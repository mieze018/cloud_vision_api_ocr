/**
 * Preload Script
 * Renderer Process と Main Process の安全なブリッジ
 */

import {contextBridge, ipcRenderer, webUtils} from 'electron'
import type {AppConfig, CompleteEvent, ErrorEvent, OCROptions, ProgressEvent} from '@shared/types'

// Electron API定義
const electronAPI = {
  // ============================================================================
  // Renderer → Main への呼び出し
  // ============================================================================

  /**
   * OCR処理を開始
   */
  startOCR: (filePath: string, config: AppConfig, options?: OCROptions) => {
    return ipcRenderer.invoke('start-ocr', filePath, config, options)
  },

  /**
   * 設定を取得
   */
  getConfig: (): Promise<AppConfig> => {
    return ipcRenderer.invoke('get-config')
  },

  /**
   * 設定を保存
   */
  saveConfig: (config: AppConfig) => {
    return ipcRenderer.invoke('save-config', config)
  },

  /**
   * ファイル選択ダイアログを表示
   */
  selectFile: () => {
    return ipcRenderer.invoke('select-file')
  },

  /**
   * フォルダを開く
   */
  openFolder: (path: string) => {
    return ipcRenderer.invoke('open-folder', path)
  },

  /**
   * Fileオブジェクトからファイルパスを取得
   * Why: ドラッグ＆ドロップで取得したFileオブジェクトには
   *      contextIsolation環境下で.pathプロパティがないため、
   *      webUtils.getPathForFile()を使用してパスを取得する
   */
  getFilePath: (file: File): string => {
    return webUtils.getPathForFile(file)
  },

  // ============================================================================
  // Main → Renderer へのイベント購読
  // ============================================================================

  /**
   * OCR進捗イベントを購読
   */
  onProgress: (callback: (event: ProgressEvent) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: ProgressEvent) => {
      callback(data)
    }
    ipcRenderer.on('ocr-progress', subscription)

    // クリーンアップ関数を返す
    return () => {
      ipcRenderer.removeListener('ocr-progress', subscription)
    }
  },

  /**
   * OCRエラーイベントを購読
   */
  onError: (callback: (event: ErrorEvent) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: ErrorEvent) => {
      callback(data)
    }
    ipcRenderer.on('ocr-error', subscription)

    // クリーンアップ関数を返す
    return () => {
      ipcRenderer.removeListener('ocr-error', subscription)
    }
  },

  /**
   * OCR完了イベントを購読
   */
  onComplete: (callback: (event: CompleteEvent) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: CompleteEvent) => {
      callback(data)
    }
    ipcRenderer.on('ocr-complete', subscription)

    // クリーンアップ関数を返す
    return () => {
      ipcRenderer.removeListener('ocr-complete', subscription)
    }
  },
}

// Window オブジェクトに electronAPI を公開
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 型定義エクスポート
export type ElectronAPI = typeof electronAPI
