/**
 * OCR処理Hook
 * OCR処理の状態管理とイベントハンドリング
 */

import { useState, useEffect, useCallback } from 'react'
import type { ProgressEvent, ErrorEvent, CompleteEvent, OCROptions } from '@shared/types'
import type { OCRStatus, UseOCRProcessReturn } from '../types'
import { useConfig } from '../contexts/ConfigContext'

export function useOCRProcess(): UseOCRProcessReturn {
  const { config } = useConfig()
  const [status, setStatus] = useState<OCRStatus>('idle')
  const [progress, setProgress] = useState<ProgressEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CompleteEvent | null>(null)

  // OCR処理開始
  const startOCR = useCallback(
    async (file: File, options?: OCROptions) => {
      if (!config) {
        setError('設定が読み込まれていません')
        return
      }

      // 設定検証
      if (!config.gcpKeyfilePath) {
        setError('GCP認証キーファイルが設定されていません')
        return
      }

      if (!config.gcsBucketName) {
        setError('GCSバケット名が設定されていません')
        return
      }

      try {
        // 状態リセット
        setStatus('uploading')
        setProgress([])
        setError(null)
        setResult(null)

        // OCR開始（オプションも渡す）
        const response = await window.electronAPI.startOCR(file.path, config, options)

        if (!response.success) {
          throw new Error('OCR処理の開始に失敗しました')
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'OCR処理に失敗しました'
        setError(errorMessage)
        setStatus('error')
      }
    },
    [config]
  )

  // 状態リセット
  const reset = useCallback(() => {
    setStatus('idle')
    setProgress([])
    setError(null)
    setResult(null)
  }, [])

  // 進捗イベントハンドラー
  useEffect(() => {
    const unsubscribe = window.electronAPI.onProgress((event: ProgressEvent) => {
      setProgress((prev) => [...prev, event])

      // ステータス更新
      switch (event.step) {
        case 'upload':
          setStatus('uploading')
          break
        case 'api-request':
        case 'polling':
          setStatus('processing')
          break
        case 'download':
          setStatus('downloading')
          break
        case 'parse':
        case 'save':
          setStatus('parsing')
          break
      }
    })

    return unsubscribe
  }, [])

  // エラーイベントハンドラー
  useEffect(() => {
    const unsubscribe = window.electronAPI.onError((event: ErrorEvent) => {
      setError(event.error)
      setStatus('error')
      setProgress((prev) => [
        ...prev,
        {
          timestamp: event.timestamp,
          step: event.step as any,
          message: `エラー: ${event.error}`,
        },
      ])
    })

    return unsubscribe
  }, [])

  // 完了イベントハンドラー
  useEffect(() => {
    const unsubscribe = window.electronAPI.onComplete((event: CompleteEvent) => {
      setResult(event)
      setStatus('complete')
      setProgress((prev) => [
        ...prev,
        {
          timestamp: event.timestamp,
          step: 'save',
          message: `処理完了: ${event.pageCount}ページ`,
          progress: 100,
        },
      ])
    })

    return unsubscribe
  }, [])

  return {
    status,
    progress,
    error,
    result,
    startOCR,
    reset,
  }
}
