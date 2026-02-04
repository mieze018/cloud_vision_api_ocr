/**
 * ファイルドロップゾーンコンポーネント
 */

import {useCallback, useState} from 'react'
import type { OCROptions } from '@shared/types'

/**
 * サポートするファイル拡張子
 * Why: Vision APIがサポートするPDF/画像形式に対応
 */
const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.gif']

/**
 * 見開き分割対応の拡張子
 * Why: PDF/TIFFのみ見開き分割に対応（画像は別途対応が必要）
 */
const SPREAD_SPLIT_EXTENSIONS = ['.pdf']

/**
 * ファイルがサポートされている形式かチェック
 */
function isSupportedFile(fileName: string): boolean {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'))
    return SUPPORTED_EXTENSIONS.includes(ext)
}

/**
 * ファイルが見開き分割に対応しているかチェック
 */
function supportsSplitSpread(fileName: string): boolean {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'))
    return SPREAD_SPLIT_EXTENSIONS.includes(ext)
}

interface FileDropzoneProps {
  onFileSelect: (file: File, options: OCROptions) => void
  disabled?: boolean
}

export function FileDropzone({ onFileSelect, disabled = false }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [splitSpread, setSplitSpread] = useState(false)
  const [rightToLeft, setRightToLeft] = useState(true) // 日本語縦書きデフォルト

  /**
   * 選択されたファイルが見開き分割に対応しているか
   */
  const canSplitSpread = selectedFile && supportsSplitSpread(selectedFile.name)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (disabled) return

      const files = Array.from(e.dataTransfer.files)
        const supportedFile = files.find((f) => isSupportedFile(f.name))

        if (supportedFile) {
          // Why: contextIsolation環境下ではFile.pathが存在しないため、
          //      webUtils.getPathForFile()経由でパスを取得する
            const filePath = window.electronAPI.getFilePath(supportedFile)
            const fileWithPath = Object.assign(supportedFile, {path: filePath})
          setSelectedFile(fileWithPath)
          // ファイル選択時は直接処理を開始せず、オプション設定後に開始ボタンで処理
      } else {
            alert('PDF または画像ファイル（JPEG, PNG, TIFF, GIF）を選択してください')
      }
    },
    [disabled]
  )

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        const file = files[0]
        setSelectedFile(file)
        // ファイル選択時は直接処理を開始せず、オプション設定後に開始ボタンで処理
      }
    },
    []
  )

  const handleBrowse = useCallback(async () => {
    if (disabled) return

    const result = await window.electronAPI.selectFile()
    if (result.filePath && !result.canceled) {
      // FileオブジェクトをFile pathから作成することはできないため、
      // ここではpathのみを扱う
      const file = { path: result.filePath, name: result.filePath.split(/[/\\]/).pop() || '' } as File
      setSelectedFile(file)
      // ファイル選択時は直接処理を開始せず、オプション設定後に開始ボタンで処理
    }
  }, [disabled])

  /**
   * OCR処理を開始
   */
  const handleStartOCR = useCallback(() => {
    if (!selectedFile || disabled) return

    const options: OCROptions = {
      splitSpread: canSplitSpread ? splitSpread : false,
      rightToLeft: rightToLeft,
    }

    onFileSelect(selectedFile, options)
  }, [selectedFile, disabled, canSplitSpread, splitSpread, rightToLeft, onFileSelect])

  /**
   * ファイル選択をリセット
   */
  const handleClear = useCallback(() => {
    setSelectedFile(null)
    setSplitSpread(false)
  }, [])

  return (
    <div className="file-dropzone-container">
      <div
        className={`file-dropzone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="dropzone-content">
          {selectedFile ? (
            <>
              <div className="file-icon">📄</div>
              <div className="file-name">{selectedFile.name}</div>

              {/* 見開き分割オプション（PDFのみ表示） */}
              {canSplitSpread && (
                <div className="spread-options">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={splitSpread}
                      onChange={(e) => setSplitSpread(e.target.checked)}
                      disabled={disabled}
                    />
                    <span>見開きページを分割する</span>
                    <span className="badge experimental">実験的</span>
                  </label>

                  {splitSpread && (
                    <div className="spread-direction">
                      <label className="radio-label">
                        <input
                          type="radio"
                          name="readDirection"
                          checked={rightToLeft}
                          onChange={() => setRightToLeft(true)}
                          disabled={disabled}
                        />
                        <span>左←右（日本語縦書き）</span>
                      </label>
                      <label className="radio-label">
                        <input
                          type="radio"
                          name="readDirection"
                          checked={!rightToLeft}
                          onChange={() => setRightToLeft(false)}
                          disabled={disabled}
                        />
                        <span>左→右（横書き）</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              <div className="file-actions">
                <button onClick={handleStartOCR} disabled={disabled} className="btn-primary">
                  OCR 開始
                </button>
                <button onClick={handleClear} disabled={disabled} className="btn-secondary">
                  クリア
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="upload-icon">📁</div>
                <p>PDF / 画像ファイルをドラッグ＆ドロップ</p>
                <p className="supported-formats">対応形式: PDF, JPEG, PNG, TIFF, GIF</p>
              <p className="or-text">または</p>
              <button onClick={handleBrowse} disabled={disabled} className="btn-primary">
                ファイルを選択
              </button>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.gif"
                onChange={handleFileInput}
                style={{ display: 'none' }}
                disabled={disabled}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
