/**
 * 設定パネルコンポーネント
 */

import { useState, useEffect } from 'react'
import { useConfig } from '../contexts/ConfigContext'
import type { AppConfig } from '@shared/types'

export function ConfigPanel() {
  const { config, loading, error, updateConfig } = useConfig()
  const [formData, setFormData] = useState<AppConfig>({
    gcpKeyfilePath: '',
    gcsBucketName: '',
    defaultOutputDir: '',
    pollingIntervalMs: 10000,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // config読み込み時にフォームを更新
  useEffect(() => {
    if (config) {
      setFormData(config)
    }
  }, [config])

  const handleChange = (field: keyof AppConfig, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setSaveSuccess(false)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setSaveError(null)
      setSaveSuccess(false)

      await updateConfig(formData)
      setSaveSuccess(true)

      // 3秒後に成功メッセージを消す
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '保存に失敗しました'
      setSaveError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  if (loading && !config) {
    return (
      <div className="config-panel">
        <h2>設定</h2>
        <p>読み込み中...</p>
      </div>
    )
  }

  if (error && !config) {
    return (
      <div className="config-panel">
        <h2>設定</h2>
        <p className="error">{error}</p>
      </div>
    )
  }

  return (
    <div className="config-panel">
      <h2>⚙️ 設定</h2>

      <div className="form-group">
        <label htmlFor="gcpKeyfilePath">
          GCP認証キーファイルパス <span className="required">*</span>
        </label>
        <input
          type="text"
          id="gcpKeyfilePath"
          value={formData.gcpKeyfilePath}
          onChange={(e) => handleChange('gcpKeyfilePath', e.target.value)}
          placeholder="例: C:\Users\username\.gcp\keyfile.json"
        />
        <small>Google Cloud Platformの認証キーファイル(JSON)へのパス</small>
      </div>

      <div className="form-group">
        <label htmlFor="gcsBucketName">
          GCSバケット名 <span className="required">*</span>
        </label>
        <input
          type="text"
          id="gcsBucketName"
          value={formData.gcsBucketName}
          onChange={(e) => handleChange('gcsBucketName', e.target.value)}
          placeholder="例: my-ocr-bucket"
        />
        <small>Google Cloud Storageのバケット名</small>
      </div>

      <div className="form-group">
        <label htmlFor="defaultOutputDir">出力先ディレクトリ</label>
        <input
          type="text"
          id="defaultOutputDir"
          value={formData.defaultOutputDir}
          onChange={(e) => handleChange('defaultOutputDir', e.target.value)}
          placeholder="例: C:\Users\username\Documents"
        />
        <small>Markdownファイルの保存先</small>
      </div>

      <div className="form-group">
        <label htmlFor="pollingIntervalMs">ポーリング間隔（ミリ秒）</label>
        <input
          type="number"
          id="pollingIntervalMs"
          value={formData.pollingIntervalMs}
          onChange={(e) => handleChange('pollingIntervalMs', parseInt(e.target.value) || 10000)}
          min="1000"
          step="1000"
        />
        <small>Vision API処理状況の確認間隔（推奨: 10000ms = 10秒）</small>
      </div>

      <div className="form-actions">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {saveSuccess && <div className="message success">設定を保存しました</div>}
      {saveError && <div className="message error">{saveError}</div>}
    </div>
  )
}
