/**
 * Parser サービス
 * Vision API出力のJSONを解析してMarkdown形式に変換
 */

import { promises as fs } from 'fs'
import type { VisionResponse, VisionPage, VisionSymbol } from '@shared/types'
import { ErrorCode, AppError } from '@shared/types'
import { logger } from '../utils/logger'

/**
 * BoundingBoxから高さを計算
 */
function getSymbolHeight(symbol: VisionSymbol): number {
  if (!symbol.boundingBox?.vertices || symbol.boundingBox.vertices.length < 4) {
    return 0
  }
  const vertices = symbol.boundingBox.vertices
  // 縦書き・横書きどちらにも対応するため、y座標の差を使う
  const minY = Math.min(...vertices.map(v => v.y || 0))
  const maxY = Math.max(...vertices.map(v => v.y || 0))
  return maxY - minY
}

/**
 * ルビ除去の閾値
 * Why: ルビは通常、本文の50%以下のサイズ。60%を閾値にすることで
 *      誤検出を減らしつつ、多くのルビを検出できる。
 */
const RUBY_HEIGHT_RATIO_THRESHOLD = 0.6

export class ParserService {
  /**
   * Vision API出力の複数JSONファイルを読み込んで解析
   * @param jsonFiles JSONファイルパスの配列
   * @returns パース済みVision API Response配列
   */
  async parseVisionOutput(jsonFiles: string[]): Promise<VisionResponse[]> {
    try {
      logger.info(`JSONファイル解析開始: ${jsonFiles.length}件`)

      const responses: VisionResponse[] = []

      for (const filePath of jsonFiles) {
        try {
          const content = await fs.readFile(filePath, 'utf-8')
          const parsed = JSON.parse(content) as VisionResponse

          if (!parsed.responses || !Array.isArray(parsed.responses)) {
            logger.warn(`不正なJSON形式: ${filePath}`)
            continue
          }

          responses.push(parsed)
          logger.debug(`JSON解析成功: ${filePath}`)
        } catch (error) {
          logger.error(`JSONファイル読み込み失敗: ${filePath}`, error)
          // 個別のファイルエラーはスキップして続行
          continue
        }
      }

      if (responses.length === 0) {
        throw new AppError(
          ErrorCode.JSON_PARSE_FAILED,
          '有効なJSONファイルが見つかりませんでした'
        )
      }

      logger.info(`JSON解析完了: ${responses.length}件のファイルを処理`)
      return responses
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      logger.error('JSON解析失敗', error)
      throw new AppError(
        ErrorCode.JSON_PARSE_FAILED,
        'JSONファイルの解析に失敗しました',
        error
      )
    }
  }

  /**
   * fullTextAnnotationからテキストを抽出
   * @param responses Vision API Response配列
   * @param removeRuby ルビを除去するかどうか
   * @returns ページごとのテキスト配列
   */
  extractText(responses: VisionResponse[], removeRuby: boolean = false): string[] {
    try {
      logger.info(`テキスト抽出開始 (ルビ除去: ${removeRuby ? 'ON' : 'OFF'})`)

      const pages: string[] = []

      for (const response of responses) {
        for (const item of response.responses) {
          if (!item.fullTextAnnotation) {
            pages.push('')
            continue
          }

          if (removeRuby && item.fullTextAnnotation.pages) {
            // ルビ除去モード: 詳細な位置情報を使って抽出
            const text = this.extractTextWithRubyRemoval(item.fullTextAnnotation.pages)
            pages.push(text)
          } else {
            // 通常モード: そのままテキストを使用
            pages.push(item.fullTextAnnotation.text || '')
          }
        }
      }

      logger.info(`テキスト抽出完了: ${pages.length}ページ`)
      return pages
    } catch (error) {
      logger.error('テキスト抽出失敗', error)
      throw new AppError(
        ErrorCode.TEXT_EXTRACTION_FAILED,
        'テキストの抽出に失敗しました',
        error
      )
    }
  }

  /**
   * ルビを除去しながらテキストを抽出
   * Why: 日本語PDFのOCR結果では、ルビ（振り仮名）が本文に混じることがある。
   *      文字の高さを分析し、明らかに小さい文字（ルビ）を除去する。
   *
   * アルゴリズム:
   * 1. 各ブロック内の文字高さの中央値を計算（本文サイズの推定）
   * 2. 中央値の60%未満の高さの文字をルビとして除去
   * 3. 改行・スペースの情報を維持しながらテキストを再構築
   *
   * Trade-off: 完璧な除去は難しい。小さい記号や注釈も除去される可能性がある。
   */
  private extractTextWithRubyRemoval(pages: VisionPage[]): string {
    const textParts: string[] = []

    for (const page of pages) {
      if (!page.blocks) continue

      for (const block of page.blocks) {
        if (!block.paragraphs) continue

        // ブロック内の全文字の高さを収集
        const allHeights: number[] = []
        for (const paragraph of block.paragraphs) {
          if (!paragraph.words) continue
          for (const word of paragraph.words) {
            if (!word.symbols) continue
            for (const symbol of word.symbols) {
              const height = getSymbolHeight(symbol)
              if (height > 0) {
                allHeights.push(height)
              }
            }
          }
        }

        // 高さの中央値を計算（本文サイズの推定）
        const medianHeight = this.calculateMedian(allHeights)
        const rubyThreshold = medianHeight * RUBY_HEIGHT_RATIO_THRESHOLD

        logger.debug(`ブロック分析: 中央値=${medianHeight.toFixed(1)}, 閾値=${rubyThreshold.toFixed(1)}`)

        // ルビを除去しながらテキストを抽出
        for (const paragraph of block.paragraphs) {
          if (!paragraph.words) continue

          for (const word of paragraph.words) {
            if (!word.symbols) continue

            for (const symbol of word.symbols) {
              const height = getSymbolHeight(symbol)

              // 高さが0または閾値以上の場合は本文として採用
              // 閾値未満の場合はルビとして除去
              if (height === 0 || height >= rubyThreshold) {
                textParts.push(symbol.text)
              }

              // 改行・スペースの処理
              if (symbol.property?.detectedBreak) {
                const breakType = symbol.property.detectedBreak.type
                if (breakType === 'SPACE' || breakType === 'SURE_SPACE') {
                  textParts.push(' ')
                } else if (breakType === 'LINE_BREAK' || breakType === 'EOL_SURE_SPACE') {
                  textParts.push('\n')
                }
              }
            }
          }
        }

        // ブロック間の改行
        textParts.push('\n')
      }
    }

    return textParts.join('')
  }

  /**
   * 配列の中央値を計算
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0

    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2
    }
    return sorted[mid]
  }

  /**
   * ページテキスト配列をMarkdown形式に変換
   * @param pages ページごとのテキスト配列
   * @returns Markdown文字列
   */
  convertToMarkdown(pages: string[]): string {
    try {
      logger.info('Markdown変換開始')

      const markdownLines: string[] = []

      for (let i = 0; i < pages.length; i++) {
        const pageNumber = i + 1
        const pageText = pages[i].trim()

        // ページヘッダー
        markdownLines.push(`# Page ${pageNumber}`)
        markdownLines.push('')

        // ページ内容
        if (pageText) {
          markdownLines.push(pageText)
        } else {
          markdownLines.push('_(このページにはテキストが含まれていません)_')
        }

        markdownLines.push('')

        // ページ区切り（最後のページ以外）
        if (i < pages.length - 1) {
          markdownLines.push('---')
          markdownLines.push('')
        }
      }

      const markdown = markdownLines.join('\n')
      logger.info(`Markdown変換完了: ${pages.length}ページ`)

      return markdown
    } catch (error) {
      logger.error('Markdown変換失敗', error)
      throw new AppError(
        ErrorCode.TEXT_EXTRACTION_FAILED,
        'Markdown形式への変換に失敗しました',
        error
      )
    }
  }

  /**
   * Markdownをファイルに保存
   * @param content Markdown文字列
   * @param outputPath 保存先パス
   */
  async saveMarkdown(content: string, outputPath: string): Promise<void> {
    try {
      logger.info(`Markdownファイル保存: ${outputPath}`)

      await fs.writeFile(outputPath, content, 'utf-8')

      logger.info('Markdownファイル保存完了')
    } catch (error) {
      logger.error('Markdownファイル保存失敗', error)
      throw new AppError(
        ErrorCode.FILE_WRITE_FAILED,
        'Markdownファイルの保存に失敗しました',
        error
      )
    }
  }

  /**
   * JSONファイル名からページ範囲を抽出してソート
   * Vision APIは output-1-to-100.json のような形式で出力する
   * @param filePaths ファイルパス配列
   * @returns ソート済みファイルパス配列
   */
  sortJsonFilesByPageRange(filePaths: string[]): string[] {
    try {
      logger.info(`JSONファイルソート: ${filePaths.length}件`)

      // ファイル名から開始ページ番号を抽出
      const filesWithPageNumber = filePaths.map((path) => {
        const match = path.match(/output-(\d+)-to-\d+\.json/)
        const startPage = match ? parseInt(match[1], 10) : 0
        return { path, startPage }
      })

      // 開始ページ番号でソート
      filesWithPageNumber.sort((a, b) => a.startPage - b.startPage)

      const sortedPaths = filesWithPageNumber.map((item) => item.path)
      logger.info('JSONファイルソート完了')

      return sortedPaths
    } catch (error) {
      logger.warn('JSONファイルのソートに失敗しました。元の順序を使用します。', error)
      return filePaths
    }
  }

  /**
   * ページ数をカウント
   * @param responses Vision API Response配列
   * @returns 総ページ数
   */
  countPages(responses: VisionResponse[]): number {
    let count = 0
    for (const response of responses) {
      count += response.responses.length
    }
    return count
  }
}
