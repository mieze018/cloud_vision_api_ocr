/**
 * Parser サービス
 * Vision API出力のJSONを解析してMarkdown形式に変換
 */

import { promises as fs } from 'fs'
import type { VisionResponse } from '@shared/types'
import { ErrorCode, AppError } from '@shared/types'
import { logger } from '../utils/logger'

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
   * @returns ページごとのテキスト配列
   */
  extractText(responses: VisionResponse[]): string[] {
    try {
      logger.info('テキスト抽出開始')

      const pages: string[] = []

      for (const response of responses) {
        for (const item of response.responses) {
          if (item.fullTextAnnotation?.text) {
            pages.push(item.fullTextAnnotation.text)
          } else {
            // テキストが空のページ
            pages.push('')
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
