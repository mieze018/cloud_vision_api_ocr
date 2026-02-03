# アーキテクチャ設計書

## 1. システムアーキテクチャ

### 1.1 レイヤー構造

```
┌─────────────────────────────────────────────────────┐
│                  Presentation Layer                  │
│              (React Components + Hooks)              │
│  - FileDropzone, ProgressLog, ConfigPanel           │
└───────────────────────┬─────────────────────────────┘
                        │ IPC (Electron)
┌───────────────────────▼─────────────────────────────┐
│                   Application Layer                  │
│              (Main Process Services)                 │
│  - OCR Orchestration                                │
│  - Config Management                                │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                   Domain Layer                       │
│              (Business Logic Services)               │
│  - GCSService: Upload/Download                      │
│  - VisionService: asyncBatchAnnotate                │
│  - ParserService: JSON → Markdown                   │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                Infrastructure Layer                  │
│              (External Services & FS)                │
│  - Google Cloud Vision API                          │
│  - Google Cloud Storage                             │
│  - File System (Node.js fs)                         │
└─────────────────────────────────────────────────────┘
```

## 2. Main Process アーキテクチャ

### 2.1 サービス構成

#### GCSService (`gcs.service.ts`)
**責務:** Google Cloud Storageとのファイル操作

```typescript
class GCSService {
  // PDFをGCSにアップロード
  uploadFile(localPath: string, bucketName: string, destPath: string): Promise<void>

  // GCSからJSONファイルをダウンロード
  downloadFile(bucketName: string, srcPath: string, localPath: string): Promise<void>

  // 特定フォルダ内の全ファイルリストを取得
  listFiles(bucketName: string, prefix: string): Promise<string[]>

  // ファイルの存在確認
  fileExists(bucketName: string, filePath: string): Promise<boolean>
}
```

#### VisionService (`vision.service.ts`)
**責務:** Vision API との通信

```typescript
class VisionService {
  // 非同期バッチOCRリクエスト
  asyncBatchAnnotate(
    inputUri: string,
    outputUri: string
  ): Promise<string> // Operation name返却

  // Operation状態のポーリング
  pollOperation(
    operationName: string,
    intervalMs: number
  ): Promise<void>

  // Operation状態取得
  getOperationStatus(operationName: string): Promise<OperationStatus>
}
```

#### ParserService (`parser.service.ts`)
**責務:** Vision API出力のJSON解析とMarkdown変換

```typescript
class ParserService {
  // 複数JSONファイルを読み込んで結合
  parseVisionOutput(jsonFiles: string[]): Promise<VisionResponse[]>

  // fullTextAnnotationを抽出してページ順にソート
  extractText(responses: VisionResponse[]): string[]

  // Markdown形式に整形
  convertToMarkdown(pages: string[]): string

  // ローカルファイルに書き込み
  saveMarkdown(content: string, outputPath: string): Promise<void>
}
```

#### ConfigService (`config.service.ts`)
**責務:** アプリケーション設定の管理

```typescript
class ConfigService {
  // 設定ファイルパス: ~/.cloud-vision-ocr/config.json

  // 設定読み込み
  loadConfig(): Promise<AppConfig>

  // 設定保存
  saveConfig(config: AppConfig): Promise<void>

  // デフォルト設定生成
  getDefaultConfig(): AppConfig
}

interface AppConfig {
  gcpKeyfilePath: string
  gcsBucketName: string
  defaultOutputDir: string
  pollingIntervalMs: number // デフォルト: 10000
}
```

### 2.2 IPC通信設計

#### Preload Script (`preload.ts`)
```typescript
// Renderer → Main への通信
contextBridge.exposeInMainWorld('electronAPI', {
  // OCR処理開始
  startOCR: (filePath: string, config: AppConfig) =>
    ipcRenderer.invoke('start-ocr', filePath, config),

  // 設定取得
  getConfig: () =>
    ipcRenderer.invoke('get-config'),

  // 設定保存
  saveConfig: (config: AppConfig) =>
    ipcRenderer.invoke('save-config', config),

  // ファイル選択ダイアログ
  selectFile: () =>
    ipcRenderer.invoke('select-file'),

  // フォルダを開く
  openFolder: (path: string) =>
    ipcRenderer.invoke('open-folder', path),

  // Main → Renderer へのイベント購読
  onProgress: (callback: (event: ProgressEvent) => void) =>
    ipcRenderer.on('ocr-progress', (_, event) => callback(event)),

  onError: (callback: (error: ErrorEvent) => void) =>
    ipcRenderer.on('ocr-error', (_, error) => callback(error)),

  onComplete: (callback: (result: CompleteEvent) => void) =>
    ipcRenderer.on('ocr-complete', (_, result) => callback(result))
})
```

#### IPCイベント定義

**Main → Renderer**
- `ocr-progress`: 処理進捗通知
- `ocr-error`: エラー通知
- `ocr-complete`: 処理完了通知

**Renderer → Main**
- `start-ocr`: OCR処理開始
- `get-config`: 設定取得
- `save-config`: 設定保存
- `select-file`: ファイル選択ダイアログ表示
- `open-folder`: エクスプローラーでフォルダを開く

## 3. Renderer Process アーキテクチャ

### 3.1 コンポーネント構成

```
App.tsx
├── ConfigContext.Provider
│   ├── ConfigPanel.tsx         (設定画面)
│   └── MainContent
│       ├── FileDropzone.tsx    (ファイル選択)
│       ├── ProgressLog.tsx     (進捗表示)
│       └── ResultActions.tsx   (完了後アクション)
```

### 3.2 状態管理

#### ConfigContext
```typescript
interface ConfigContextType {
  config: AppConfig | null
  loading: boolean
  error: string | null
  updateConfig: (config: AppConfig) => Promise<void>
  refreshConfig: () => Promise<void>
}
```

#### useOCRProcess Hook
```typescript
interface OCRProcessState {
  status: 'idle' | 'uploading' | 'processing' | 'downloading' | 'parsing' | 'complete' | 'error'
  progress: ProgressEvent[]
  error: string | null
  result: CompleteEvent | null

  startOCR: (file: File) => Promise<void>
  reset: () => void
}
```

## 4. データモデル

### 4.1 共有型定義 (`shared/types.ts`)

```typescript
// 進捗イベント
export interface ProgressEvent {
  timestamp: number
  step: 'upload' | 'api-request' | 'polling' | 'download' | 'parse' | 'save'
  message: string
  progress?: number // 0-100
}

// エラーイベント
export interface ErrorEvent {
  timestamp: number
  step: string
  error: string
  details?: any
}

// 完了イベント
export interface CompleteEvent {
  timestamp: number
  outputPath: string
  pageCount: number
  processingTime: number // ミリ秒
}

// アプリ設定
export interface AppConfig {
  gcpKeyfilePath: string
  gcsBucketName: string
  defaultOutputDir: string
  pollingIntervalMs: number
}

// Vision API Operation状態
export interface OperationStatus {
  done: boolean
  error?: {
    code: number
    message: string
  }
  metadata?: any
}

// Vision API Response（簡略版）
export interface VisionResponse {
  responses: Array<{
    fullTextAnnotation?: {
      text: string
    }
  }>
}
```

## 5. OCR処理フロー詳細

### 5.1 シーケンス図

```
Renderer              Main Process           GCS              Vision API
   │                       │                   │                   │
   │──startOCR()──────────>│                   │                   │
   │                       │──upload()────────>│                   │
   │<──progress: upload────│                   │                   │
   │                       │<─────────────────│                   │
   │                       │──asyncBatchAnnotate()────────────────>│
   │<──progress: request───│                   │                   │
   │                       │<─────────────────────────operationName│
   │                       │                   │                   │
   │                       │─┐ poll (10s interval)                 │
   │<──progress: polling───│ │                 │                   │
   │                       │ │──getStatus()───────────────────────>│
   │                       │<┘                 │<──────────────────│
   │                       │                   │                   │
   │                       │──listFiles()─────>│                   │
   │<──progress: download──│<─────────────────│                   │
   │                       │──download()──────>│                   │
   │                       │<─────────────────│                   │
   │                       │                   │                   │
   │                       │─┐ parse JSON      │                   │
   │<──progress: parse─────│ │                 │                   │
   │                       │<┘                 │                   │
   │                       │                   │                   │
   │                       │─┐ save Markdown   │                   │
   │<──progress: save──────│ │                 │                   │
   │                       │<┘                 │                   │
   │                       │                   │                   │
   │<──complete────────────│                   │                   │
```

### 5.2 エラーハンドリングフロー

各ステップでエラー発生時:
1. エラーをキャッチ
2. `ocr-error` イベントで Renderer に通知
3. ログファイルに記録
4. 処理を中断
5. UI でエラーメッセージ表示

## 6. セキュリティアーキテクチャ

### 6.1 Electron Security Best Practices

- **contextIsolation: true** - Renderer と Main のコンテキスト分離
- **nodeIntegration: false** - Renderer で Node.js API を直接使用不可
- **sandbox: true** - Renderer をサンドボックス内で実行
- **preload script** - 限定的な IPC 通信のみ許可

### 6.2 認証情報管理

- GCP keyfile は**ユーザーのローカルファイルシステム**に配置
- パスのみを設定ファイルに保存
- keyfile 自体はアプリに含めない
- 環境変数経由での読み込みも対応

## 7. パフォーマンス設計

### 7.1 大容量ファイル対策

- **ストリーミングアップロード**: `createReadStream()` 使用
- **並列ダウンロード**: Promise.all でJSON複数ファイル同時取得
- **段階的書き込み**: メモリに全テキスト展開せず、ページ単位で書き込み

### 7.2 ポーリング最適化

- 初期: 5秒間隔
- 10回以降: 10秒間隔
- 30回以降: 30秒間隔
- タイムアウト: 1時間（設定可能）

## 8. ログ設計

### 8.1 ログレベル

- **INFO**: 正常処理の記録
- **WARN**: 警告レベルの問題
- **ERROR**: エラー発生時

### 8.2 ログ出力先

- **Console**: 開発時のみ
- **File**: `~/.cloud-vision-ocr/logs/app.log`
- **Renderer**: IPC 経由で進捗ログとして表示

## 9. テスト戦略

### 9.1 単体テスト
- サービス層の各メソッド
- Parser ロジック

### 9.2 統合テスト
- GCS アップロード/ダウンロード
- Vision API 呼び出し（モック使用）

### 9.3 E2Eテスト
- 実際の小規模PDF（5ページ程度）で全体フロー確認

## 10. ビルド・デプロイ

### 10.1 ビルドプロセス

1. TypeScript コンパイル
2. Vite バンドル（Renderer）
3. electron-builder でパッケージング

### 10.2 配布形式

- **Windows**: NSIS Installer / Portable
- **macOS**: DMG / PKG
- **Linux**: AppImage / deb

### 10.3 自動更新

- 将来的に electron-updater 導入を検討
