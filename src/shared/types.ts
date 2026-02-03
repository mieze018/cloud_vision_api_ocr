/**
 * 共有型定義
 * Main Process と Renderer Process 間で共有する型
 */

// ============================================================================
// アプリケーション設定
// ============================================================================

export interface AppConfig {
  /** GCP認証キーファイルのパス */
  gcpKeyfilePath: string
  /** GCSバケット名 */
  gcsBucketName: string
  /** デフォルト出力先ディレクトリ */
  defaultOutputDir: string
  /** ポーリング間隔（ミリ秒） */
  pollingIntervalMs: number
}

// ============================================================================
// OCR処理イベント
// ============================================================================

/** OCR処理ステップ */
export type OCRStep =
  | 'upload'      // GCSアップロード
  | 'api-request' // Vision API リクエスト
  | 'polling'     // Operation ポーリング
  | 'download'    // GCSダウンロード
  | 'parse'       // JSON解析
  | 'save'        // Markdownファイル保存

/** 進捗イベント */
export interface ProgressEvent {
  /** イベント発生時刻（Unix timestamp） */
  timestamp: number
  /** 処理ステップ */
  step: OCRStep
  /** 進捗メッセージ */
  message: string
  /** 進捗率（0-100、オプション） */
  progress?: number
}

/** エラーイベント */
export interface ErrorEvent {
  /** イベント発生時刻（Unix timestamp） */
  timestamp: number
  /** エラーが発生したステップ */
  step: string
  /** エラーメッセージ */
  error: string
  /** エラー詳細（オプション） */
  details?: unknown
}

/** 完了イベント */
export interface CompleteEvent {
  /** イベント発生時刻（Unix timestamp） */
  timestamp: number
  /** 出力ファイルパス */
  outputPath: string
  /** 処理ページ数 */
  pageCount: number
  /** 処理時間（ミリ秒） */
  processingTime: number
}

// ============================================================================
// Vision API 関連
// ============================================================================

/** Vision API Operation 状態 */
export interface OperationStatus {
  /** Operation完了フラグ */
  done: boolean
  /** エラー情報（存在する場合） */
  error?: {
    code: number
    message: string
  }
  /** メタデータ（オプション） */
  metadata?: unknown
}

/** Vision API Response（簡略版） */
export interface VisionResponse {
  responses: Array<{
    fullTextAnnotation?: {
      text: string
    }
  }>
}

// ============================================================================
// IPC通信
// ============================================================================

/** OCR開始リクエスト */
export interface StartOCRRequest {
  /** PDFファイルパス */
  filePath: string
  /** アプリ設定 */
  config: AppConfig
}

/** OCR開始レスポンス */
export interface StartOCRResponse {
  /** 成功フラグ */
  success: boolean
  /** エラーメッセージ（失敗時） */
  error?: string
}

/** ファイル選択レスポンス */
export interface SelectFileResponse {
  /** 選択されたファイルパス */
  filePath: string | null
  /** キャンセルフラグ */
  canceled: boolean
}

/** フォルダを開くレスポンス */
export interface OpenFolderResponse {
  /** 成功フラグ */
  success: boolean
}

// ============================================================================
// エラーコード
// ============================================================================

/** アプリケーションエラーコード */
export enum ErrorCode {
  // 共通エラー
  FILE_NOT_FOUND = 'E001',
  GCP_AUTH_FAILED = 'E002',
  INVALID_CONFIG = 'E003',

  // GCS関連エラー
  BUCKET_NOT_FOUND = 'E101',
  UPLOAD_FAILED = 'E102',
  DOWNLOAD_FAILED = 'E103',
  LIST_FILES_FAILED = 'E104',

  // Vision API関連エラー
  API_REQUEST_FAILED = 'E201',
  OPERATION_TIMEOUT = 'E202',
  INVALID_RESPONSE = 'E203',

  // Parser関連エラー
  JSON_PARSE_FAILED = 'E301',
  TEXT_EXTRACTION_FAILED = 'E302',
  FILE_WRITE_FAILED = 'E303',
}

/** アプリケーションエラー */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}
