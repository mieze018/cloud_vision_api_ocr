/**
 * Google Cloud Storage サービス
 * GCSへのファイルアップロード・ダウンロード・一覧取得を行う
 */

import { Storage } from '@google-cloud/storage'
import { createReadStream, createWriteStream } from 'fs'
import { ErrorCode, AppError } from '@shared/types'
import { logger } from '../utils/logger'

export class GCSService {
  private storage: Storage | null = null
  private initialized = false

  /**
   * GCS初期化
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

      this.storage = new Storage({
        keyFilename: keyFilePath,
      })

      // 認証確認（バケット一覧取得を試みる）
      await this.storage.getBuckets({ maxResults: 1 })

      this.initialized = true
      logger.info('GCS初期化完了')
    } catch (error) {
      this.initialized = false
      logger.error('GCS初期化失敗', error)

      throw new AppError(
        ErrorCode.GCP_AUTH_FAILED,
        'GCP認証に失敗しました。認証キーファイルを確認してください。',
        error
      )
    }
  }

  /**
   * ファイルをGCSにアップロード
   * @param localPath ローカルファイルパス
   * @param bucketName GCSバケット名
   * @param destPath GCS内の保存先パス
   */
  async uploadFile(
    localPath: string,
    bucketName: string,
    destPath: string
  ): Promise<void> {
    this.ensureInitialized()

    try {
      logger.info(`GCSアップロード開始: ${localPath} -> gs://${bucketName}/${destPath}`)

      const bucket = this.storage!.bucket(bucketName)
      const file = bucket.file(destPath)

      // ストリーミングアップロード
      await new Promise<void>((resolve, reject) => {
        const readStream = createReadStream(localPath)
        const writeStream = file.createWriteStream({
          resumable: true,
          metadata: {
            contentType: 'application/pdf',
          },
        })

        readStream
          .pipe(writeStream)
          .on('error', reject)
          .on('finish', () => {
            logger.info(`GCSアップロード完了: ${destPath}`)
            resolve()
          })

        readStream.on('error', reject)
      })
    } catch (error) {
      logger.error('GCSアップロード失敗', error)
      throw new AppError(
        ErrorCode.UPLOAD_FAILED,
        `ファイルのアップロードに失敗しました: ${destPath}`,
        error
      )
    }
  }

  /**
   * ファイルをGCSからダウンロード
   * @param bucketName GCSバケット名
   * @param srcPath GCS内のファイルパス
   * @param localPath ダウンロード先ローカルパス
   */
  async downloadFile(
    bucketName: string,
    srcPath: string,
    localPath: string
  ): Promise<void> {
    this.ensureInitialized()

    try {
      logger.info(`GCSダウンロード開始: gs://${bucketName}/${srcPath} -> ${localPath}`)

      const bucket = this.storage!.bucket(bucketName)
      const file = bucket.file(srcPath)

      // ファイル存在確認
      const [exists] = await file.exists()
      if (!exists) {
        throw new AppError(
          ErrorCode.FILE_NOT_FOUND,
          `GCS内にファイルが見つかりません: ${srcPath}`
        )
      }

      // ストリーミングダウンロード
      await new Promise<void>((resolve, reject) => {
        const readStream = file.createReadStream()
        const writeStream = createWriteStream(localPath)

        readStream
          .pipe(writeStream)
          .on('error', reject)
          .on('finish', () => {
            logger.info(`GCSダウンロード完了: ${localPath}`)
            resolve()
          })

        readStream.on('error', reject)
      })
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      logger.error('GCSダウンロード失敗', error)
      throw new AppError(
        ErrorCode.DOWNLOAD_FAILED,
        `ファイルのダウンロードに失敗しました: ${srcPath}`,
        error
      )
    }
  }

  /**
   * 指定プレフィックス配下のファイル一覧を取得
   * @param bucketName GCSバケット名
   * @param prefix フォルダパス（例: 'output/'）
   * @returns ファイルパスの配列
   */
  async listFiles(bucketName: string, prefix: string): Promise<string[]> {
    this.ensureInitialized()

    try {
      logger.info(`GCSファイル一覧取得: gs://${bucketName}/${prefix}`)

      const bucket = this.storage!.bucket(bucketName)
      const [files] = await bucket.getFiles({ prefix })

      const filePaths = files.map((file) => file.name)
      logger.info(`GCSファイル一覧取得完了: ${filePaths.length}件`)

      return filePaths
    } catch (error) {
      logger.error('GCSファイル一覧取得失敗', error)
      throw new AppError(
        ErrorCode.LIST_FILES_FAILED,
        `ファイル一覧の取得に失敗しました: ${prefix}`,
        error
      )
    }
  }

  /**
   * ファイルの存在確認
   * @param bucketName GCSバケット名
   * @param filePath GCS内のファイルパス
   * @returns 存在する場合true
   */
  async fileExists(bucketName: string, filePath: string): Promise<boolean> {
    this.ensureInitialized()

    try {
      const bucket = this.storage!.bucket(bucketName)
      const file = bucket.file(filePath)
      const [exists] = await file.exists()

      return exists
    } catch (error) {
      logger.error('GCSファイル存在確認失敗', error)
      return false
    }
  }

  /**
   * バケットの存在確認
   * @param bucketName GCSバケット名
   * @returns 存在する場合true
   */
  async bucketExists(bucketName: string): Promise<boolean> {
    this.ensureInitialized()

    try {
      const bucket = this.storage!.bucket(bucketName)
      const [exists] = await bucket.exists()

      return exists
    } catch (error) {
      logger.error('GCSバケット存在確認失敗', error)
      return false
    }
  }

  /**
   * 初期化チェック
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.storage) {
      throw new AppError(
        ErrorCode.GCP_AUTH_FAILED,
        'GCSが初期化されていません。先にinitialize()を呼び出してください。'
      )
    }
  }
}
