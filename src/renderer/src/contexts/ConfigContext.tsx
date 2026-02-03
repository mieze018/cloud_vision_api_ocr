/**
 * 設定管理Context
 * アプリケーション設定の状態管理を提供
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import type { AppConfig } from '@shared/types'
import type { ConfigContextType } from '../types'

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

interface ConfigProviderProps {
  children: ReactNode
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 設定読み込み
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const loadedConfig = await window.electronAPI.getConfig()
      setConfig(loadedConfig)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '設定の読み込みに失敗しました'
      setError(errorMessage)
      console.error('設定読み込みエラー:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // 設定更新
  const updateConfig = useCallback(async (newConfig: AppConfig) => {
    try {
      setLoading(true)
      setError(null)

      await window.electronAPI.saveConfig(newConfig)
      setConfig(newConfig)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '設定の保存に失敗しました'
      setError(errorMessage)
      console.error('設定保存エラー:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // 設定再読み込み
  const refreshConfig = useCallback(async () => {
    await loadConfig()
  }, [loadConfig])

  // 初回マウント時に設定読み込み
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const value: ConfigContextType = {
    config,
    loading,
    error,
    updateConfig,
    refreshConfig,
  }

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

// Custom Hook
export function useConfig() {
  const context = useContext(ConfigContext)
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider')
  }
  return context
}
