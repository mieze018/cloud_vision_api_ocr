/**
 * Google Cloud Vision API サービス
 * 非同期バッチOCR処理とポーリングを行う
 */

import {ImageAnnotatorClient} from '@google-cloud/vision'
import {extname} from 'path'
import type {OperationStatus} from '@shared/types'
import {AppError, ErrorCode} from '@shared/types'
import {logger} from '../utils/logger'

/**
 * ファイル拡張子からMIMEタイプを取得
 * Why: Vision APIは入力ファイルのMIMEタイプを明示的に指定する必要があるため、
 *      拡張子から適切なMIMEタイプを判定する
 */
function getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
        '.gif': 'image/gif',
    }

    const mimeType = mimeTypes[ext]
    if (!mimeType) {
        throw new AppError(
            ErrorCode.API_REQUEST_FAILED,
            `サポートされていないファイル形式です: ${ext}`
        )
    }
    return mimeType
}

/**
 * 非同期バッチ処理がサポートされているファイル形式かチェック
 * Why: Vision APIの非同期バッチ処理（asyncBatchAnnotateFiles）は
 *      PDF, GIF, TIFF のみサポート。JPEG/PNGは同期処理が必要。
 */
export function supportsBatchProcessing(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  const batchSupportedExtensions = ['.pdf', '.gif', '.tiff', '.tif']
  return batchSupportedExtensions.includes(ext)
}

export class VisionService {
  private client: ImageAnnotatorClient | null = null
  private initialized = false

  /**
   * Vision API初期化
   * @param keyFilePath GCP認証キーファイルのパス
   */
  async initialize(keyFilePath: string): Promise<void> {
    try {
      if (!keyFilePath) {
        throw new AppError(
          ErrorCode.GCP_AUTH_FAILED,
          'GCP認証キーファイルのパスが指定されていません'
        )
      }

      this.client = new ImageAnnotatorClient({
        keyFilename: keyFilePath,
      })

      this.initialized = true
      logger.info('Vision API初期化完了')
    } catch (error) {
      this.initialized = false
      logger.error('Vision API初期化失敗', error)

      throw new AppError(
        ErrorCode.GCP_AUTH_FAILED,
        'Vision API認証に失敗しました。認証キーファイルを確認してください。',
        error
      )
    }
  }

  /**
   * 非同期バッチOCRリクエストを送信
   * @param inputUri GCS入力URI（例: gs://bucket/input/file.pdf）
   * @param outputUri GCS出力URI（例: gs://bucket/output/）
   * @returns Operation名
   *
   * Why: Vision APIの非同期バッチ処理は大容量ファイル（PDF/画像）に対応するため使用
   * Trade-off: 同期処理より複雑だが、数百ページのPDFも処理可能
   */
  async asyncBatchAnnotate(inputUri: string, outputUri: string): Promise<string> {
    this.ensureInitialized()

    try {
        // Why: URIからファイル名を抽出してMIMEタイプを判定
        const mimeType = getMimeType(inputUri)

      logger.info(`Vision API非同期バッチOCRリクエスト開始`)
      logger.info(`  入力: ${inputUri}`)
      logger.info(`  出力: ${outputUri}`)
        logger.info(`  MIMEタイプ: ${mimeType}`)

      const request = {
        requests: [
          {
            inputConfig: {
              gcsSource: {
                uri: inputUri,
              },
                mimeType,
            },
            features: [
              {
                type: 'DOCUMENT_TEXT_DETECTION' as const,
              },
            ],
            outputConfig: {
              gcsDestination: {
                uri: outputUri,
              },
              batchSize: 100, // 1JSONファイルあたりのページ数
            },
          },
        ],
      }

      const [operation] = await this.client!.asyncBatchAnnotateFiles(request)

      if (!operation.name) {
        throw new AppError(
          ErrorCode.API_REQUEST_FAILED,
          'Vision APIからOperation名が返されませんでした'
        )
      }

      logger.info(`Vision APIリクエスト成功: Operation=${operation.name}`)
      return operation.name
    } catch (error) {
      logger.error('Vision APIリクエスト失敗', error)

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(
        ErrorCode.API_REQUEST_FAILED,
        'Vision APIリクエストに失敗しました',
        error
      )
    }
  }

  /**
   * Operation完了までポーリング
   * @param operationName Operation名
   * @param intervalMs ポーリング間隔（ミリ秒）
   * @param timeoutMs タイムアウト時間（ミリ秒、デフォルト: 1時間）
   * @param onProgress 進捗コールバック
   */
  async pollOperation(
    operationName: string,
    intervalMs: number = 10000,
    timeoutMs: number = 60 * 60 * 1000, // 1時間
    onProgress?: (elapsed: number, status: OperationStatus) => void
  ): Promise<void> {
    this.ensureInitialized()

    const startTime = Date.now()
    let pollCount = 0

    logger.info(`Operationポーリング開始: ${operationName}`)
    logger.info(`  ポーリング間隔: ${intervalMs}ms`)
    logger.info(`  タイムアウト: ${timeoutMs}ms`)

    while (true) {
      pollCount++
      const elapsed = Date.now() - startTime

      // タイムアウトチェック
      if (elapsed > timeoutMs) {
        throw new AppError(
          ErrorCode.OPERATION_TIMEOUT,
          `Operationがタイムアウトしました（${timeoutMs}ms経過）`
        )
      }

      // Operation状態取得
      const status = await this.getOperationStatus(operationName)

      // 進捗コールバック呼び出し
      if (onProgress) {
        onProgress(elapsed, status)
      }

      // エラーチェック
      if (status.error) {
        logger.error('Operation実行エラー', status.error)
        throw new AppError(
          ErrorCode.API_REQUEST_FAILED,
          `Vision API処理でエラーが発生しました: ${status.error.message}`,
          status.error
        )
      }

      // 完了チェック
      if (status.done) {
        logger.info(`Operation完了（${pollCount}回目のポーリング、経過時間: ${elapsed}ms）`)
        return
      }

      // 次回ポーリングまで待機
      logger.debug(`ポーリング${pollCount}回目: 未完了、${intervalMs}ms後に再確認`)
      await this.sleep(intervalMs)
    }
  }

  /**
   * Operation状態を取得
   * @param operationName Operation名
   * @returns Operation状態
   */
  async getOperationStatus(operationName: string): Promise<OperationStatus> {
    this.ensureInitialized()

    try {
      // Operation状態取得（operationsClient使用）
      const operationsClient = this.client!.operationsClient

      const [operation] = await operationsClient.getOperation({
        name: operationName,
      })

      return {
        done: operation.done || false,
        error: operation.error
          ? {
              code: operation.error.code || 0,
              message: operation.error.message || 'Unknown error',
            }
          : undefined,
        metadata: operation.metadata,
      }
    } catch (error) {
      logger.error('Operation状態取得失敗', error)
      throw new AppError(
        ErrorCode.API_REQUEST_FAILED,
        'Operation状態の取得に失敗しました',
        error
      )
    }
  }

  /**
   * 初期化チェック
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new AppError(
        ErrorCode.GCP_AUTH_FAILED,
        'Vision APIが初期化されていません。先にinitialize()を呼び出してください。'
      )
    }
  }

  /**
   * 単一画像の同期OCR処理
   * Why: JPEG/PNGは非同期バッチ処理（asyncBatchAnnotateFiles）に対応していないため、
   *      同期処理（documentTextDetection）を使用する
   * Trade-off: GCS不要で手軽だが、大容量ファイルには向かない
   *
   * @param imagePath ローカル画像ファイルのパス
   * @returns OCR結果のテキスト
   */
  async syncAnnotateImage(imagePath: string): Promise<string> {
    this.ensureInitialized()

    try {
      logger.info(`Vision API同期OCRリクエスト開始`)
      logger.info(`  入力: ${imagePath}`)

      const [result] = await this.client!.documentTextDetection(imagePath)

      if (!result.fullTextAnnotation?.text) {
        logger.warn('テキストが検出されませんでした')
        return ''
      }

      const text = result.fullTextAnnotation.text
      logger.info(`Vision API同期OCR完了: ${text.length}文字を抽出`)

      return text
    } catch (error) {
      logger.error('Vision API同期OCRリクエスト失敗', error)

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(
          ErrorCode.API_REQUEST_FAILED,
          'Vision API同期OCRリクエストに失敗しました',
          error
      )
    }
  }

  /**
   * 指定時間スリープ
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
