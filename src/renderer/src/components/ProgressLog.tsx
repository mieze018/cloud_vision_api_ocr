/**
 * 進捗ログコンポーネント
 */

import { useEffect, useRef } from 'react'
import type { ProgressEvent } from '@shared/types'
import type { OCRStatus } from '../types'

interface ProgressLogProps {
  status: OCRStatus
  progress: ProgressEvent[]
}

const statusLabels: Record<OCRStatus, string> = {
  idle: '待機中',
  uploading: 'アップロード中',
  processing: '処理中',
  downloading: 'ダウンロード中',
  parsing: '解析中',
  complete: '完了',
  error: 'エラー',
}

export function ProgressLog({ status, progress }: ProgressLogProps) {
  const logEndRef = useRef<HTMLDivElement>(null)

  // 自動スクロール
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [progress])

  // 最新の進捗率を取得
  const latestProgress = progress.length > 0 ? progress[progress.length - 1].progress : undefined

  return (
    <div className="progress-log-container">
      <div className="progress-header">
        <h3>📊 処理状況</h3>
        <span className={`status-badge status-${status}`}>{statusLabels[status]}</span>
      </div>

      {latestProgress !== undefined && (
        <div className="progress-bar-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${latestProgress}%` }} />
          </div>
          <div className="progress-percent">{latestProgress}%</div>
        </div>
      )}

      <div className="log-entries">
        {progress.length === 0 ? (
          <div className="log-entry empty">処理を開始するとログが表示されます</div>
        ) : (
          progress.map((entry, index) => (
            <div key={index} className="log-entry">
              <span className="log-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span className={`log-step step-${entry.step}`}>[{entry.step}]</span>
              <span className="log-message">{entry.message}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}
