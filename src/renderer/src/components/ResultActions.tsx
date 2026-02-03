/**
 * 結果アクションコンポーネント
 */

import type { CompleteEvent } from '@shared/types'

interface ResultActionsProps {
  result: CompleteEvent | null
  error: string | null
  onReset: () => void
}

export function ResultActions({ result, error, onReset }: ResultActionsProps) {
  if (!result && !error) {
    return null
  }

  const handleOpenFolder = async () => {
    if (result) {
      const folderPath = result.outputPath.split(/[/\\]/).slice(0, -1).join('/')
      await window.electronAPI.openFolder(folderPath)
    }
  }

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60

    if (minutes > 0) {
      return `${minutes}分${remainingSeconds}秒`
    }
    return `${seconds}秒`
  }

  return (
    <div className="result-actions-container">
      {result && (
        <div className="result-success">
          <div className="success-icon">✅</div>
          <h3>OCR処理が完了しました！</h3>

          <div className="result-details">
            <div className="detail-item">
              <span className="detail-label">出力ファイル:</span>
              <span className="detail-value">{result.outputPath}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">ページ数:</span>
              <span className="detail-value">{result.pageCount} ページ</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">処理時間:</span>
              <span className="detail-value">{formatTime(result.processingTime)}</span>
            </div>
          </div>

          <div className="result-actions">
            <button onClick={handleOpenFolder} className="btn-primary">
              📁 フォルダを開く
            </button>
            <button onClick={onReset} className="btn-secondary">
              🔄 新規OCR処理
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="result-error">
          <div className="error-icon">❌</div>
          <h3>エラーが発生しました</h3>
          <p className="error-message">{error}</p>
          <button onClick={onReset} className="btn-secondary">
            🔄 再試行
          </button>
        </div>
      )}
    </div>
  )
}
