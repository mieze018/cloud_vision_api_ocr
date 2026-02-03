/**
 * Renderer Process 型定義
 */

import type {
  AppConfig,
  ProgressEvent,
  ErrorEvent,
  CompleteEvent,
  SelectFileResponse,
  OpenFolderResponse,
} from '@shared/types'

// ============================================================================
// OCR処理状態
// ============================================================================

/** OCR処理ステータス */
export type OCRStatus =
  | 'idle'        // 待機中
  | 'uploading'   // アップロード中
  | 'processing'  // Vision API処理中
  | 'downloading' // ダウンロード中
  | 'parsing'     // JSON解析中
  | 'complete'    // 完了
  | 'error'       // エラー

/** OCR処理状態 */
export interface OCRProcessState {
  /** 現在のステータス */
  status: OCRStatus
  /** 進捗イベント履歴 */
  progress: ProgressEvent[]
  /** エラー情報 */
  error: string | null
  /** 完了情報 */
  result: CompleteEvent | null
}

// ============================================================================
// Electron API（preloadで公開される型）
// ============================================================================

export interface ElectronAPI {
  // Renderer → Main への呼び出し
  startOCR: (filePath: string, config: AppConfig) => Promise<{ success: boolean }>
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<{ success: boolean }>
  selectFile: () => Promise<SelectFileResponse>
  openFolder: (path: string) => Promise<OpenFolderResponse>

  // Main → Renderer へのイベント購読
  onProgress: (callback: (event: ProgressEvent) => void) => () => void
  onError: (callback: (event: ErrorEvent) => void) => () => void
  onComplete: (callback: (event: CompleteEvent) => void) => () => void
}

// ============================================================================
// Window型拡張
// ============================================================================

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// ============================================================================
// Hook返り値型
// ============================================================================

/** useOCRProcess Hook の返り値 */
export interface UseOCRProcessReturn {
  /** 現在のステータス */
  status: OCRStatus
  /** 進捗イベント履歴 */
  progress: ProgressEvent[]
  /** エラーメッセージ */
  error: string | null
  /** 完了情報 */
  result: CompleteEvent | null
  /** OCR処理開始 */
  startOCR: (file: File) => Promise<void>
  /** 状態リセット */
  reset: () => void
}

// ============================================================================
// Context型
// ============================================================================

/** ConfigContext の型 */
export interface ConfigContextType {
  /** 現在の設定 */
  config: AppConfig | null
  /** ロード中フラグ */
  loading: boolean
  /** エラーメッセージ */
  error: string | null
  /** 設定更新 */
  updateConfig: (config: AppConfig) => Promise<void>
  /** 設定再読み込み */
  refreshConfig: () => Promise<void>
}
