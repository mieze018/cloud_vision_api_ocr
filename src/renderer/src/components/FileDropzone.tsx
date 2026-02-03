/**
 * ファイルドロップゾーンコンポーネント
 */

import {useCallback, useState} from 'react'

/**
 * サポートするファイル拡張子
 * Why: Vision APIがサポートするPDF/画像形式に対応
 */
const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.gif']

/**
 * ファイルがサポートされている形式かチェック
 */
function isSupportedFile(fileName: string): boolean {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'))
    return SUPPORTED_EXTENSIONS.includes(ext)
}

interface FileDropzoneProps {
  onFileSelect: (file: File) => void
  disabled?: boolean
}

export function FileDropzone({ onFileSelect, disabled = false }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

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
          onFileSelect(fileWithPath)
      } else {
            alert('PDF または画像ファイル（JPEG, PNG, TIFF, GIF）を選択してください')
      }
    },
    [disabled, onFileSelect]
  )

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        const file = files[0]
        setSelectedFile(file)
        onFileSelect(file)
      }
    },
    [onFileSelect]
  )

  const handleBrowse = useCallback(async () => {
    if (disabled) return

    const result = await window.electronAPI.selectFile()
    if (result.filePath && !result.canceled) {
      // FileオブジェクトをFile pathから作成することはできないため、
      // ここではpathのみを扱う
      const file = { path: result.filePath, name: result.filePath.split(/[/\\]/).pop() || '' } as File
      setSelectedFile(file)
      onFileSelect(file)
    }
  }, [disabled, onFileSelect])

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
              {!disabled && (
                <button onClick={handleBrowse} className="btn-secondary">
                  別のファイルを選択
                </button>
              )}
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
