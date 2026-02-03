/**
 * 設定管理サービス
 * アプリケーション設定の読み込み・保存を行う
 */

import {promises as fs} from 'fs'
import {join} from 'path'
import {homedir} from 'os'
import type {AppConfig} from '@shared/types'
import {AppError, ErrorCode} from '@shared/types'

export class ConfigService {
  private configDir: string
  private configFilePath: string

  constructor() {
    // 設定ファイルの保存先: ~/.cloud-vision-ocr/config.json
    this.configDir = join(homedir(), '.cloud-vision-ocr')
    this.configFilePath = join(this.configDir, 'config.json')
  }

  /**
   * 設定を読み込む
   * 設定ファイルが存在しない場合はデフォルト設定を返す
   */
  async loadConfig(): Promise<AppConfig> {
    try {
      await this.ensureConfigDir()

      // ファイル存在確認
      try {
        await fs.access(this.configFilePath)
      } catch {
        // ファイルが存在しない場合はデフォルト設定を返す
        const defaultConfig = this.getDefaultConfig()
        await this.saveConfig(defaultConfig)
        return defaultConfig
      }

      // ファイル読み込み
      const content = await fs.readFile(this.configFilePath, 'utf-8')
      const config = JSON.parse(content) as AppConfig

      // バリデーション
      this.validateConfig(config)

      return config
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        '設定ファイルの読み込みに失敗しました',
        error
      )
    }
  }

  /**
   * 設定を保存する
   */
  async saveConfig(config: AppConfig): Promise<void> {
    try {
      await this.ensureConfigDir()

      // バリデーション
      this.validateConfig(config)

      // JSON形式で保存
      const content = JSON.stringify(config, null, 2)
      await fs.writeFile(this.configFilePath, content, 'utf-8')
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        '設定ファイルの保存に失敗しました',
        error
      )
    }
  }

  /**
   * デフォルト設定を取得する
   */
  getDefaultConfig(): AppConfig {
    return {
      gcpKeyfilePath: '',
      gcsBucketName: '',
      defaultOutputDir: join(homedir(), 'Documents'),
      pollingIntervalMs: 10000, // 10秒
      removeRuby: false, // ルビ除去はデフォルトOFF
        normalizeLineBreaks: false, // 改行整形はデフォルトOFF
    }
  }

  /**
   * 設定ディレクトリが存在することを確認し、なければ作成する
   */
  private async ensureConfigDir(): Promise<void> {
    try {
      await fs.access(this.configDir)
    } catch {
      await fs.mkdir(this.configDir, { recursive: true })
    }
  }

  /**
   * 設定の妥当性をチェックする
   */
  private validateConfig(config: AppConfig): void {
    if (typeof config !== 'object' || config === null) {
      throw new AppError(ErrorCode.INVALID_CONFIG, '設定が不正です')
    }

    // 必須フィールドの型チェック
    if (typeof config.gcpKeyfilePath !== 'string') {
      throw new AppError(ErrorCode.INVALID_CONFIG, 'gcpKeyfilePath が不正です')
    }

    if (typeof config.gcsBucketName !== 'string') {
      throw new AppError(ErrorCode.INVALID_CONFIG, 'gcsBucketName が不正です')
    }

    if (typeof config.defaultOutputDir !== 'string') {
      throw new AppError(ErrorCode.INVALID_CONFIG, 'defaultOutputDir が不正です')
    }

    if (typeof config.pollingIntervalMs !== 'number' || config.pollingIntervalMs <= 0) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        'pollingIntervalMs は正の数値である必要があります'
      )
    }
  }

  /**
   * GCP認証キーファイルの存在確認
   */
  async validateKeyFile(keyfilePath: string): Promise<boolean> {
    if (!keyfilePath) {
      return false
    }

    try {
      await fs.access(keyfilePath)
      return true
    } catch {
      return false
    }
  }
}
