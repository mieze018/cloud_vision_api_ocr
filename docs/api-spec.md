# API仕様書

## 1. IPC API 仕様（Renderer ↔ Main）

### 1.1 Renderer → Main（invoke）

#### `start-ocr`
OCR処理を開始する

**Parameters:**
```typescript
{
  filePath: string      // ローカルPDFファイルパス
  config: AppConfig     // アプリ設定
}
```

**Returns:**
```typescript
Promise<{ success: boolean }>
```

**Errors:**
- ファイルが存在しない
- GCP認証失敗
- バケットアクセス失敗

---

#### `get-config`
現在の設定を取得する

**Parameters:** なし

**Returns:**
```typescript
Promise<AppConfig>
```

---

#### `save-config`
設定を保存する

**Parameters:**
```typescript
{
  config: AppConfig
}
```

**Returns:**
```typescript
Promise<{ success: boolean }>
```

---

#### `select-file`
ファイル選択ダイアログを表示

**Parameters:** なし

**Returns:**
```typescript
Promise<{
  filePath: string | null
  canceled: boolean
}>
```

---

#### `open-folder`
エクスプローラー/Finderでフォルダを開く

**Parameters:**
```typescript
{
  path: string  // フォルダパス
}
```

**Returns:**
```typescript
Promise<{ success: boolean }>
```

---

### 1.2 Main → Renderer（on）

#### `ocr-progress`
OCR処理の進捗を通知

**Payload:**
```typescript
{
  timestamp: number
  step: 'upload' | 'api-request' | 'polling' | 'download' | 'parse' | 'save'
  message: string
  progress?: number  // 0-100 (optional)
}
```

**Example:**
```typescript
{
  timestamp: 1704067200000,
  step: 'upload',
  message: 'PDFファイルをGCSにアップロード中... (50%)',
  progress: 50
}
```

---

#### `ocr-error`
エラー発生を通知

**Payload:**
```typescript
{
  timestamp: number
  step: string
  error: string
  details?: any
}
```

**Example:**
```typescript
{
  timestamp: 1704067200000,
  step: 'upload',
  error: 'GCSへのアクセスに失敗しました',
  details: {
    code: 403,
    message: 'Forbidden'
  }
}
```

---

#### `ocr-complete`
処理完了を通知

**Payload:**
```typescript
{
  timestamp: number
  outputPath: string
  pageCount: number
  processingTime: number  // ミリ秒
}
```

**Example:**
```typescript
{
  timestamp: 1704067200000,
  outputPath: 'C:/Users/user/Documents/output.md',
  pageCount: 250,
  processingTime: 180000
}
```

---

## 2. Service API 仕様（Main Process）

### 2.1 GCSService

#### `uploadFile()`
ローカルファイルをGCSにアップロード

```typescript
uploadFile(
  localPath: string,
  bucketName: string,
  destPath: string
): Promise<void>
```

**Parameters:**
- `localPath`: アップロード元ローカルパス
- `bucketName`: GCSバケット名
- `destPath`: GCS内の保存先パス（例: `input/document.pdf`）

**Throws:**
- ファイルが存在しない
- GCS認証エラー
- アップロードエラー

---

#### `downloadFile()`
GCSからローカルにファイルをダウンロード

```typescript
downloadFile(
  bucketName: string,
  srcPath: string,
  localPath: string
): Promise<void>
```

**Parameters:**
- `bucketName`: GCSバケット名
- `srcPath`: GCS内のファイルパス
- `localPath`: ダウンロード先ローカルパス

**Throws:**
- ファイルが存在しない
- ダウンロードエラー

---

#### `listFiles()`
GCS内の指定フォルダのファイル一覧を取得

```typescript
listFiles(
  bucketName: string,
  prefix: string
): Promise<string[]>
```

**Parameters:**
- `bucketName`: GCSバケット名
- `prefix`: フォルダパス（例: `output/`）

**Returns:**
- ファイルパスの配列（例: `['output/response-0001.json', 'output/response-0002.json']`）

---

#### `fileExists()`
GCS内のファイル存在確認

```typescript
fileExists(
  bucketName: string,
  filePath: string
): Promise<boolean>
```

**Returns:**
- `true`: ファイルが存在
- `false`: ファイルが存在しない

---

### 2.2 VisionService

#### `asyncBatchAnnotate()`
非同期バッチOCRリクエストを送信

```typescript
asyncBatchAnnotate(
  inputUri: string,
  outputUri: string
): Promise<string>
```

**Parameters:**
- `inputUri`: GCS URI（例: `gs://my-bucket/input/document.pdf`）
- `outputUri`: GCS出力先URI（例: `gs://my-bucket/output/`）

**Returns:**
- Operation name（例: `projects/123/operations/456`）

**API Request Example:**
```json
{
  "requests": [
    {
      "inputConfig": {
        "gcsSource": {
          "uri": "gs://my-bucket/input/document.pdf"
        },
        "mimeType": "application/pdf"
      },
      "features": [
        {
          "type": "DOCUMENT_TEXT_DETECTION"
        }
      ],
      "outputConfig": {
        "gcsDestination": {
          "uri": "gs://my-bucket/output/"
        },
        "batchSize": 100
      }
    }
  ]
}
```

---

#### `pollOperation()`
Operation完了までポーリング

```typescript
pollOperation(
  operationName: string,
  intervalMs: number = 10000
): Promise<void>
```

**Parameters:**
- `operationName`: Operation名
- `intervalMs`: ポーリング間隔（デフォルト: 10000ms）

**Behavior:**
- `done: true` になるまで `intervalMs` 間隔でポーリング
- 完了またはエラーで resolve/reject

---

#### `getOperationStatus()`
Operation状態を取得

```typescript
getOperationStatus(
  operationName: string
): Promise<OperationStatus>
```

**Returns:**
```typescript
{
  done: boolean
  error?: {
    code: number
    message: string
  }
  metadata?: any
}
```

---

### 2.3 ParserService

#### `parseVisionOutput()`
Vision API出力のJSON群を読み込み

```typescript
parseVisionOutput(
  jsonFiles: string[]
): Promise<VisionResponse[]>
```

**Parameters:**
- `jsonFiles`: JSONファイルパスの配列

**Returns:**
- パース済みVision API Responseの配列

---

#### `extractText()`
fullTextAnnotationからテキストを抽出

```typescript
extractText(
  responses: VisionResponse[]
): string[]
```

**Returns:**
- ページごとのテキスト配列（ページ順にソート済み）

---

#### `convertToMarkdown()`
テキスト配列をMarkdown形式に変換

```typescript
convertToMarkdown(
  pages: string[]
): string
```

**Returns:**
- Markdown形式の文字列

**Format:**
```markdown
# Page 1

[1ページ目のテキスト]

---

# Page 2

[2ページ目のテキスト]

---

...
```

---

#### `saveMarkdown()`
Markdownをファイルに保存

```typescript
saveMarkdown(
  content: string,
  outputPath: string
): Promise<void>
```

**Parameters:**
- `content`: Markdown文字列
- `outputPath`: 保存先パス

---

### 2.4 ConfigService

#### `loadConfig()`
設定ファイルを読み込み

```typescript
loadConfig(): Promise<AppConfig>
```

**Returns:**
```typescript
{
  gcpKeyfilePath: string
  gcsBucketName: string
  defaultOutputDir: string
  pollingIntervalMs: number
}
```

**Default Values:**
```typescript
{
  gcpKeyfilePath: '',
  gcsBucketName: '',
  defaultOutputDir: os.homedir() + '/Documents',
  pollingIntervalMs: 10000
}
```

**Config File Path:**
- Windows: `C:\Users\<user>\.cloud-vision-ocr\config.json`
- macOS: `/Users/<user>/.cloud-vision-ocr/config.json`
- Linux: `/home/<user>/.cloud-vision-ocr/config.json`

---

#### `saveConfig()`
設定をファイルに保存

```typescript
saveConfig(config: AppConfig): Promise<void>
```

---

#### `getDefaultConfig()`
デフォルト設定を取得

```typescript
getDefaultConfig(): AppConfig
```

---

## 3. 型定義

### 3.1 AppConfig
```typescript
interface AppConfig {
  gcpKeyfilePath: string        // GCP keyfile.jsonのパス
  gcsBucketName: string          // GCSバケット名
  defaultOutputDir: string       // デフォルト出力先ディレクトリ
  pollingIntervalMs: number      // ポーリング間隔（ミリ秒）
}
```

### 3.2 ProgressEvent
```typescript
interface ProgressEvent {
  timestamp: number
  step: 'upload' | 'api-request' | 'polling' | 'download' | 'parse' | 'save'
  message: string
  progress?: number  // 0-100
}
```

### 3.3 ErrorEvent
```typescript
interface ErrorEvent {
  timestamp: number
  step: string
  error: string
  details?: any
}
```

### 3.4 CompleteEvent
```typescript
interface CompleteEvent {
  timestamp: number
  outputPath: string
  pageCount: number
  processingTime: number  // ミリ秒
}
```

### 3.5 OperationStatus
```typescript
interface OperationStatus {
  done: boolean
  error?: {
    code: number
    message: string
  }
  metadata?: any
}
```

### 3.6 VisionResponse
```typescript
interface VisionResponse {
  responses: Array<{
    fullTextAnnotation?: {
      text: string
    }
  }>
}
```

---

## 4. エラーコード

### 4.1 共通エラー
| Code | Message | Description |
|------|---------|-------------|
| `E001` | File not found | 指定ファイルが存在しない |
| `E002` | GCP authentication failed | GCP認証に失敗 |
| `E003` | Invalid config | 設定が不正 |

### 4.2 GCS関連エラー
| Code | Message | Description |
|------|---------|-------------|
| `E101` | Bucket not found | バケットが存在しない |
| `E102` | Upload failed | アップロードに失敗 |
| `E103` | Download failed | ダウンロードに失敗 |
| `E104` | List files failed | ファイル一覧取得に失敗 |

### 4.3 Vision API関連エラー
| Code | Message | Description |
|------|---------|-------------|
| `E201` | API request failed | API リクエスト失敗 |
| `E202` | Operation timeout | Operation タイムアウト |
| `E203` | Invalid response | レスポンスが不正 |

### 4.4 Parser関連エラー
| Code | Message | Description |
|------|---------|-------------|
| `E301` | JSON parse failed | JSON解析に失敗 |
| `E302` | Text extraction failed | テキスト抽出に失敗 |
| `E303` | File write failed | ファイル書き込みに失敗 |

---

## 5. Vision API詳細仕様

### 5.1 使用するAPI
- **Method:** `projects.files.asyncBatchAnnotate`
- **Endpoint:** `https://vision.googleapis.com/v1/files:asyncBatchAnnotate`

### 5.2 リクエスト詳細

#### Feature Type
```json
{
  "type": "DOCUMENT_TEXT_DETECTION"
}
```

#### Output Config
```json
{
  "gcsDestination": {
    "uri": "gs://bucket-name/output/"
  },
  "batchSize": 100
}
```

**batchSize:**
- 各JSONファイルに含めるページ数
- 推奨値: 100ページ
- 最大: 100ページ

### 5.3 レスポンス形式

#### Operation
```json
{
  "name": "projects/123456/operations/789012",
  "metadata": {
    "@type": "type.googleapis.com/google.cloud.vision.v1.OperationMetadata",
    "state": "RUNNING",
    "createTime": "2024-01-01T00:00:00Z",
    "updateTime": "2024-01-01T00:01:00Z"
  }
}
```

#### 完了時のOperation
```json
{
  "name": "projects/123456/operations/789012",
  "metadata": {
    "@type": "type.googleapis.com/google.cloud.vision.v1.OperationMetadata",
    "state": "DONE",
    "createTime": "2024-01-01T00:00:00Z",
    "updateTime": "2024-01-01T00:05:00Z"
  },
  "done": true,
  "response": {
    "@type": "type.googleapis.com/google.cloud.vision.v1.AsyncBatchAnnotateFilesResponse",
    "responses": [
      {
        "outputConfig": {
          "gcsDestination": {
            "uri": "gs://bucket-name/output/"
          },
          "batchSize": 100
        }
      }
    ]
  }
}
```

### 5.4 出力JSONファイル形式

**ファイル名パターン:**
```
output/output-1-to-100.json
output/output-101-to-200.json
output/output-201-to-250.json
```

**JSON構造:**
```json
{
  "responses": [
    {
      "fullTextAnnotation": {
        "pages": [...],
        "text": "ページ全体のテキスト..."
      }
    }
  ]
}
```

---

## 6. GCS URIフォーマット

### 6.1 入力URI
```
gs://{bucket-name}/input/{filename}.pdf
```

**Example:**
```
gs://my-ocr-bucket/input/book-2024.pdf
```

### 6.2 出力URI
```
gs://{bucket-name}/output/
```

**Example:**
```
gs://my-ocr-bucket/output/
```

**注意:** 末尾の `/` は必須

---

## 7. 環境変数

### 7.1 必須環境変数

```bash
# GCP認証キーファイルパス
GOOGLE_APPLICATION_CREDENTIALS=/path/to/keyfile.json

# GCSバケット名
GCS_BUCKET_NAME=my-ocr-bucket
```

### 7.2 オプション環境変数

```bash
# デフォルト出力先ディレクトリ
DEFAULT_OUTPUT_DIR=/path/to/output

# ポーリング間隔（ミリ秒）
POLLING_INTERVAL_MS=10000

# ログレベル
LOG_LEVEL=info
```
