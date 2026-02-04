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
  /**
   * ルビ（振り仮名）を除去するかどうか
   * Why: 日本語PDFのOCR結果にはルビが本文に混じって出力されることがあり、
   *      可読性が低下する。このオプションでルビを除去できる。
   * Trade-off: 完璧な除去は難しく、誤検出の可能性がある（実験的機能）
   */
  removeRuby?: boolean
    /**
     * 改行を段落単位で整形するかどうか
     * Why: OCR結果は視覚的なレイアウトに基づいて改行されるため、
     *      文章の途中で不自然な改行が入ることがある。
     *      このオプションで段落単位に改行を整形し、読みやすくする。
     * Trade-off: 元のレイアウト情報は失われる（実験的機能）
     */
    normalizeLineBreaks?: boolean
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

/**
 * Vision API BoundingBox（位置情報）
 */
export interface BoundingBox {
  vertices: Array<{
    x: number
    y: number
  }>
}

/**
 * Vision API Symbol（1文字）
 */
export interface VisionSymbol {
  text: string
  boundingBox?: BoundingBox
  property?: {
    detectedBreak?: {
      type: string // SPACE, LINE_BREAK, etc.
    }
  }
}

/**
 * Vision API Word（単語）
 */
export interface VisionWord {
  symbols: VisionSymbol[]
  boundingBox?: BoundingBox
}

/**
 * Vision API Paragraph（段落）
 */
export interface VisionParagraph {
  words: VisionWord[]
  boundingBox?: BoundingBox
}

/**
 * Vision API Block（ブロック）
 */
export interface VisionBlock {
  paragraphs: VisionParagraph[]
  boundingBox?: BoundingBox
  blockType?: string
}

/**
 * Vision API Page（ページ）
 */
export interface VisionPage {
  blocks: VisionBlock[]
  width: number
  height: number
}

/**
 * Vision API FullTextAnnotation（詳細版）
 */
export interface FullTextAnnotation {
  text: string
  pages: VisionPage[]
}

/** Vision API Response（詳細版） */
export interface VisionResponse {
  responses: Array<{
    fullTextAnnotation?: FullTextAnnotation
  }>
}

// ============================================================================
// IPC通信
// ============================================================================

/**
 * OCR処理オプション（ファイルアップロード時に指定）
 * Why: 設定画面（AppConfig）とは別に、ファイルごとに指定したいオプションを管理
 */
export interface OCROptions {
  /**
   * 見開きページを左右に分割するかどうか
   * Why: 見開きスキャンされたPDFは、縦書きテキストが正しく認識されないことがある。
   *      左右に分割することで精度向上を図る。
   */
  splitSpread?: boolean
  /**
   * 分割時の読み取り順序
   * true: 右→左（日本語縦書き用）
   * false: 左→右（横書き・英語用）
   */
  rightToLeft?: boolean
}

/** OCR開始リクエスト */
export interface StartOCRRequest {
  /** PDFファイルパス */
  filePath: string
  /** アプリ設定 */
  config: AppConfig
  /** OCR処理オプション */
  options?: OCROptions
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
