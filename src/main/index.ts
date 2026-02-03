/**
 * Main Process Entry Point
 * Electronアプリのメインプロセス
 */

import {app, BrowserWindow, dialog, ipcMain, shell} from 'electron'
import {basename, join} from 'path'
import {tmpdir} from 'os'
import {promises as fs} from 'fs'
import type {AppConfig} from '@shared/types'
import {AppError} from '@shared/types'
import {ConfigService} from './services/config.service'
import {GCSService} from './services/gcs.service'
import {supportsBatchProcessing, VisionService} from './services/vision.service'
import {ParserService} from './services/parser.service'
import {logger} from './utils/logger'

// ============================================================================
// グローバル変数
// ============================================================================

let mainWindow: BrowserWindow | null = null
const configService = new ConfigService()
const gcsService = new GCSService()
const visionService = new VisionService()
const parserService = new ParserService()

// ============================================================================
// Electron アプリライフサイクル
// ============================================================================

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ============================================================================
// ウィンドウ作成
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // 開発環境ではViteサーバーに接続、本番環境ではビルド済みファイルをロード
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  logger.info('アプリケーション起動完了')
}

// ============================================================================
// IPC ハンドラー
// ============================================================================

/**
 * 設定取得
 */
ipcMain.handle('get-config', async () => {
  try {
    logger.info('設定取得リクエスト')
    return await configService.loadConfig()
  } catch (error) {
    logger.error('設定取得失敗', error)
    throw error
  }
})

/**
 * 設定保存
 */
ipcMain.handle('save-config', async (_event, config: AppConfig) => {
  try {
    logger.info('設定保存リクエスト')
    await configService.saveConfig(config)
    return { success: true }
  } catch (error) {
    logger.error('設定保存失敗', error)
    throw error
  }
})

/**
 * ファイル選択ダイアログ
 */
ipcMain.handle('select-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
        filters: [
            {name: 'PDF / 画像ファイル', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'tif', 'gif']},
            {name: 'PDF', extensions: ['pdf']},
            {name: '画像', extensions: ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'gif']},
        ],
    })

    return {
      filePath: result.filePaths[0] || null,
      canceled: result.canceled,
    }
  } catch (error) {
    logger.error('ファイル選択失敗', error)
    return {
      filePath: null,
      canceled: true,
    }
  }
})

/**
 * フォルダを開く
 */
ipcMain.handle('open-folder', async (_event, path: string) => {
  try {
    await shell.openPath(path)
    return { success: true }
  } catch (error) {
    logger.error('フォルダを開く失敗', error)
    return { success: false }
  }
})

/**
 * OCR処理開始
 */
ipcMain.handle('start-ocr', async (_event, filePath: string, config: AppConfig) => {
  const startTime = Date.now()

  try {
    logger.info('='.repeat(80))
    logger.info('OCR処理開始')
    logger.info(`ファイル: ${filePath}`)
    logger.info('='.repeat(80))

    // ファイル存在確認
    await fs.access(filePath)

    // OCR処理実行
    await runOCRProcess(filePath, config, startTime)

    return { success: true }
  } catch (error) {
    logger.error('OCR処理失敗', error)

    // エラーイベント送信
    sendErrorEvent('ocr', error)

    return { success: false }
  }
})

// ============================================================================
// OCR処理オーケストレーション
// ============================================================================

async function runOCRProcess(
  filePath: string,
  config: AppConfig,
  startTime: number
): Promise<void> {
  const fileName = basename(filePath)

  // ファイル形式によって処理を分岐
  // Why: Vision APIの非同期バッチ処理はPDF/GIF/TIFFのみ対応
  //      JPEG/PNGは同期処理を使用する必要がある
  if (supportsBatchProcessing(filePath)) {
    await runBatchOCRProcess(filePath, fileName, config, startTime)
  } else {
    await runSyncOCRProcess(filePath, fileName, config, startTime)
  }
}

/**
 * 非同期バッチOCR処理（PDF, GIF, TIFF 用）
 * Why: 大容量ファイル（数百ページのPDF等）を処理するため、GCS経由の非同期処理を使用
 */
async function runBatchOCRProcess(
    filePath: string,
    fileName: string,
    config: AppConfig,
    startTime: number
): Promise<void> {
  let tempDir: string | null = null

  try {
    // Step 1: 初期化
    sendProgressEvent('upload', 'GCS・Vision API初期化中...', 0)
    await gcsService.initialize(config.gcpKeyfilePath)
    await visionService.initialize(config.gcpKeyfilePath)

    // バケット存在確認
    const bucketExists = await gcsService.bucketExists(config.gcsBucketName)
    if (!bucketExists) {
      throw new AppError(
        'E101' as any,
        `GCSバケットが見つかりません: ${config.gcsBucketName}`
      )
    }

    // Step 2: GCSにアップロード
    sendProgressEvent('upload', 'ファイルをGCSにアップロード中...', 10)
    const gcsInputPath = `input/${Date.now()}-${fileName}`
    const gcsOutputPrefix = `output/${Date.now()}/`

    await gcsService.uploadFile(filePath, config.gcsBucketName, gcsInputPath)
    sendProgressEvent('upload', 'アップロード完了', 30)

    // Step 3: Vision API非同期バッチリクエスト
    sendProgressEvent('api-request', 'Vision APIにOCRリクエスト送信中...', 35)
    const inputUri = `gs://${config.gcsBucketName}/${gcsInputPath}`
    const outputUri = `gs://${config.gcsBucketName}/${gcsOutputPrefix}`

    const operationName = await visionService.asyncBatchAnnotate(inputUri, outputUri)
    sendProgressEvent('api-request', 'リクエスト完了、処理開始', 40)

    // Step 4: Operationポーリング
    sendProgressEvent('polling', 'OCR処理完了を待機中...', 45)
    await visionService.pollOperation(
      operationName,
      config.pollingIntervalMs,
      60 * 60 * 1000, // 1時間タイムアウト
      (elapsed) => {
        const minutes = Math.floor(elapsed / 60000)
        const seconds = Math.floor((elapsed % 60000) / 1000)
        sendProgressEvent(
          'polling',
          `OCR処理中... (経過時間: ${minutes}分${seconds}秒)`,
          45 + Math.min((elapsed / 60000) * 5, 30) // 最大30%まで進捗
        )
      }
    )
    sendProgressEvent('polling', 'OCR処理完了', 75)

    // Step 5: 結果ファイルをダウンロード
    sendProgressEvent('download', '処理結果をダウンロード中...', 80)
    tempDir = join(tmpdir(), `ocr-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })

    const outputFiles = await gcsService.listFiles(config.gcsBucketName, gcsOutputPrefix)
    const jsonFiles = outputFiles.filter((f) => f.endsWith('.json'))

    if (jsonFiles.length === 0) {
      throw new AppError('E203' as any, '処理結果のJSONファイルが見つかりませんでした')
    }

    // JSONファイルをダウンロード
    const localJsonFiles: string[] = []
    for (let i = 0; i < jsonFiles.length; i++) {
      const jsonFile = jsonFiles[i]
      const localPath = join(tempDir, basename(jsonFile))
      await gcsService.downloadFile(config.gcsBucketName, jsonFile, localPath)
      localJsonFiles.push(localPath)

      const progress = 80 + Math.floor((i / jsonFiles.length) * 10)
      sendProgressEvent('download', `ダウンロード中... (${i + 1}/${jsonFiles.length})`, progress)
    }
    sendProgressEvent('download', 'ダウンロード完了', 90)

    // Step 6: JSONを解析してMarkdown生成
    sendProgressEvent('parse', 'テキストを抽出中...', 92)
    const sortedFiles = parserService.sortJsonFilesByPageRange(localJsonFiles)
    const responses = await parserService.parseVisionOutput(sortedFiles)

    sendProgressEvent('parse', 'Markdown形式に変換中...', 95)
    const pages = parserService.extractText(responses, config.removeRuby ?? false)
    const markdown = parserService.convertToMarkdown(pages)

    // Step 7: Markdownファイルを保存
    sendProgressEvent('save', 'ファイルを保存中...', 97)
    const outputFileName = fileName.replace(/\.(pdf|gif|tiff|tif)$/i, '.md')
    const outputPath = join(config.defaultOutputDir, outputFileName)
    await parserService.saveMarkdown(markdown, outputPath)
    sendProgressEvent('save', '保存完了', 100)

    // 完了イベント送信
    const processingTime = Date.now() - startTime
    const pageCount = parserService.countPages(responses)

    sendCompleteEvent(outputPath, pageCount, processingTime)

    logger.info('='.repeat(80))
    logger.info('OCR処理正常完了（バッチ処理）')
    logger.info(`出力先: ${outputPath}`)
    logger.info(`ページ数: ${pageCount}`)
    logger.info(`処理時間: ${Math.floor(processingTime / 1000)}秒`)
    logger.info('='.repeat(80))
  } finally {
    // 一時ファイル削除
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
        logger.info(`一時ディレクトリ削除: ${tempDir}`)
      } catch (error) {
        logger.warn('一時ディレクトリ削除失敗', error)
      }
    }
  }
}

/**
 * 同期OCR処理（JPEG, PNG 用）
 * Why: Vision APIの非同期バッチ処理はJPEG/PNGに対応していないため、
 *      同期処理（documentTextDetection）を使用する
 * Trade-off: GCSを経由せず直接処理できるが、大容量ファイルには向かない
 */
async function runSyncOCRProcess(
    filePath: string,
    fileName: string,
    config: AppConfig,
    startTime: number
): Promise<void> {
  try {
    // Step 1: 初期化
    sendProgressEvent('upload', 'Vision API初期化中...', 0)
    await visionService.initialize(config.gcpKeyfilePath)
    sendProgressEvent('upload', '初期化完了', 20)

    // Step 2: Vision API同期OCRリクエスト
    sendProgressEvent('api-request', 'Vision APIにOCRリクエスト送信中...', 30)
    const text = await visionService.syncAnnotateImage(filePath)
    sendProgressEvent('api-request', 'OCR処理完了', 80)

    // Step 3: Markdown生成
    sendProgressEvent('parse', 'Markdown形式に変換中...', 85)
    const markdown = parserService.convertToMarkdown([text])

    // Step 4: Markdownファイルを保存
    sendProgressEvent('save', 'ファイルを保存中...', 95)
    const outputFileName = fileName.replace(/\.(jpg|jpeg|png)$/i, '.md')
    const outputPath = join(config.defaultOutputDir, outputFileName)
    await parserService.saveMarkdown(markdown, outputPath)
    sendProgressEvent('save', '保存完了', 100)

    // 完了イベント送信
    const processingTime = Date.now() - startTime
    const pageCount = 1 // 単一画像は1ページ

    sendCompleteEvent(outputPath, pageCount, processingTime)

    logger.info('='.repeat(80))
    logger.info('OCR処理正常完了（同期処理）')
    logger.info(`出力先: ${outputPath}`)
    logger.info(`ページ数: ${pageCount}`)
    logger.info(`処理時間: ${Math.floor(processingTime / 1000)}秒`)
    logger.info('='.repeat(80))
  } catch (error) {
    logger.error('同期OCR処理失敗', error)
    throw error
  }
}

// ============================================================================
// イベント送信ヘルパー
// ============================================================================

function sendProgressEvent(step: string, message: string, progress?: number): void {
  if (mainWindow) {
    mainWindow.webContents.send('ocr-progress', {
      timestamp: Date.now(),
      step,
      message,
      progress,
    })
  }
  logger.info(`[進捗] ${step}: ${message} ${progress !== undefined ? `(${progress}%)` : ''}`)
}

function sendErrorEvent(step: string, error: unknown): void {
  if (mainWindow) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const details = error instanceof AppError ? error.details : undefined

    mainWindow.webContents.send('ocr-error', {
      timestamp: Date.now(),
      step,
      error: errorMessage,
      details,
    })
  }
}

function sendCompleteEvent(outputPath: string, pageCount: number, processingTime: number): void {
  if (mainWindow) {
    mainWindow.webContents.send('ocr-complete', {
      timestamp: Date.now(),
      outputPath,
      pageCount,
      processingTime,
    })
  }
}
