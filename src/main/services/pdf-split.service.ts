/**
 * PDF分割サービス
 * 見開きPDFを左右に分割して2ページに変換する
 *
 * Why: 見開きスキャンされたPDFは、Vision APIで縦書きテキストが
 *      正しく認識されないことがある。左右に分割することで精度向上を図る。
 */

import { PDFDocument } from 'pdf-lib'
import { promises as fs } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'
import { logger } from '../utils/logger'

/**
 * 見開きPDFを左右に分割する
 *
 * @param inputPath 入力PDFファイルパス
 * @param rightToLeft true: 右→左の順（日本語縦書き用）, false: 左→右の順
 * @returns 分割後のPDFファイルパス（一時ファイル）
 *
 * Trade-off:
 * - メリット: 縦書き見開きPDFの認識精度が向上
 * - デメリット: 処理時間が増加、一時ファイルが必要
 */
export async function splitSpreadPdf(
  inputPath: string,
  rightToLeft: boolean = true
): Promise<string> {
  logger.info(`見開きPDF分割開始: ${inputPath}`)
  logger.info(`読み取り順: ${rightToLeft ? '右→左（日本語縦書き）' : '左→右'}`)

  // 入力PDFを読み込み
  const inputBytes = await fs.readFile(inputPath)
  const inputPdf = await PDFDocument.load(inputBytes)
  const pageCount = inputPdf.getPageCount()

  logger.info(`元のページ数: ${pageCount}`)

  // 出力用の新しいPDFを作成
  const outputPdf = await PDFDocument.create()

  for (let i = 0; i < pageCount; i++) {
    const originalPage = inputPdf.getPage(i)
    const { width, height } = originalPage.getSize()

    // ページが横長（見開き）かどうかを判定
    // Why: 縦長のページは分割不要なのでそのままコピー
    const isSpread = width > height

    if (isSpread) {
      // 見開きページを左右に分割
      const halfWidth = width / 2

      // 右ページと左ページの順序を決定
      // 日本語縦書きは右→左なので、rightToLeft=trueの場合は右ページを先に
      const firstCropBox = rightToLeft
        ? { left: halfWidth, bottom: 0, right: width, top: height } // 右半分
        : { left: 0, bottom: 0, right: halfWidth, top: height } // 左半分

      const secondCropBox = rightToLeft
        ? { left: 0, bottom: 0, right: halfWidth, top: height } // 左半分
        : { left: halfWidth, bottom: 0, right: width, top: height } // 右半分

      // 1ページ目（右または左）
      const [firstPage] = await outputPdf.copyPages(inputPdf, [i])
      firstPage.setCropBox(
        firstCropBox.left,
        firstCropBox.bottom,
        halfWidth,
        height
      )
      firstPage.setMediaBox(
        firstCropBox.left,
        firstCropBox.bottom,
        halfWidth,
        height
      )
      outputPdf.addPage(firstPage)

      // 2ページ目（左または右）
      const [secondPage] = await outputPdf.copyPages(inputPdf, [i])
      secondPage.setCropBox(
        secondCropBox.left,
        secondCropBox.bottom,
        halfWidth,
        height
      )
      secondPage.setMediaBox(
        secondCropBox.left,
        secondCropBox.bottom,
        halfWidth,
        height
      )
      outputPdf.addPage(secondPage)

      logger.info(`ページ ${i + 1}: 見開き → 2ページに分割`)
    } else {
      // 縦長ページはそのままコピー
      const [copiedPage] = await outputPdf.copyPages(inputPdf, [i])
      outputPdf.addPage(copiedPage)

      logger.info(`ページ ${i + 1}: 単ページ → そのままコピー`)
    }
  }

  // 一時ファイルに保存
  const outputFileName = `split-${Date.now()}-${basename(inputPath)}`
  const outputPath = join(tmpdir(), outputFileName)

  const outputBytes = await outputPdf.save()
  await fs.writeFile(outputPath, outputBytes)

  const newPageCount = outputPdf.getPageCount()
  logger.info(`分割後のページ数: ${newPageCount}`)
  logger.info(`出力先: ${outputPath}`)

  return outputPath
}

/**
 * 一時ファイルを削除する
 */
export async function cleanupTempPdf(tempPath: string): Promise<void> {
  try {
    await fs.unlink(tempPath)
    logger.info(`一時PDFファイル削除: ${tempPath}`)
  } catch (error) {
    logger.warn(`一時PDFファイル削除失敗: ${tempPath}`, error)
  }
}
