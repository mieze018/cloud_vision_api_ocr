/**
 * ロガーユーティリティ
 * コンソールとファイルへのログ出力を行う
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export class Logger {
  private logDir: string
  private logFilePath: string
  private currentLogLevel: LogLevel

  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logDir = join(homedir(), '.cloud-vision-ocr', 'logs')
    this.logFilePath = join(this.logDir, 'app.log')
    this.currentLogLevel = logLevel
    this.ensureLogDir()
  }

  /**
   * DEBUGレベルログ
   */
  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args)
  }

  /**
   * INFOレベルログ
   */
  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args)
  }

  /**
   * WARNレベルログ
   */
  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args)
  }

  /**
   * ERRORレベルログ
   */
  error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
    } else {
      this.log(LogLevel.ERROR, message, error)
    }
  }

  /**
   * ログレベルを設定
   */
  setLogLevel(level: LogLevel): void {
    this.currentLogLevel = level
  }

  /**
   * ログ出力のメイン処理
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    // ログレベルチェック
    if (!this.shouldLog(level)) {
      return
    }

    const timestamp = new Date().toISOString()
    const logMessage = this.formatMessage(timestamp, level, message, ...args)

    // コンソール出力
    this.logToConsole(level, logMessage)

    // ファイル出力（非同期、エラーは無視）
    this.logToFile(logMessage).catch(() => {
      // ログファイル書き込みエラーは無視
    })
  }

  /**
   * 現在のログレベルに基づいて出力すべきか判定
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    const currentIndex = levels.indexOf(this.currentLogLevel)
    const targetIndex = levels.indexOf(level)
    return targetIndex >= currentIndex
  }

  /**
   * ログメッセージをフォーマット
   */
  private formatMessage(
    timestamp: string,
    level: LogLevel,
    message: string,
    ...args: unknown[]
  ): string {
    let formatted = `[${timestamp}] [${level}] ${message}`

    if (args.length > 0) {
      const argsStr = args
        .map((arg) => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2)
            } catch {
              return String(arg)
            }
          }
          return String(arg)
        })
        .join(' ')

      formatted += ` ${argsStr}`
    }

    return formatted
  }

  /**
   * コンソールへログ出力
   */
  private logToConsole(level: LogLevel, message: string): void {
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(message)
        break
      case LogLevel.INFO:
        console.info(message)
        break
      case LogLevel.WARN:
        console.warn(message)
        break
      case LogLevel.ERROR:
        console.error(message)
        break
    }
  }

  /**
   * ファイルへログ出力
   */
  private async logToFile(message: string): Promise<void> {
    try {
      await fs.appendFile(this.logFilePath, message + '\n', 'utf-8')
    } catch {
      // ファイル書き込みエラーは無視
    }
  }

  /**
   * ログディレクトリが存在することを確認
   */
  private ensureLogDir(): void {
    fs.mkdir(this.logDir, { recursive: true }).catch(() => {
      // ディレクトリ作成エラーは無視
    })
  }

  /**
   * ログファイルをクリア
   */
  async clearLogs(): Promise<void> {
    try {
      await fs.writeFile(this.logFilePath, '', 'utf-8')
      this.info('ログファイルをクリアしました')
    } catch (error) {
      this.error('ログファイルのクリアに失敗しました', error)
    }
  }

  /**
   * 古いログファイルをローテーション（オプション機能）
   */
  async rotateLogs(maxSizeBytes: number = 10 * 1024 * 1024): Promise<void> {
    try {
      const stats = await fs.stat(this.logFilePath)

      if (stats.size > maxSizeBytes) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const archivePath = join(this.logDir, `app-${timestamp}.log`)

        await fs.rename(this.logFilePath, archivePath)
        this.info(`ログファイルをローテーションしました: ${archivePath}`)
      }
    } catch {
      // ローテーションエラーは無視
    }
  }
}

// シングルトンインスタンス
export const logger = new Logger()
