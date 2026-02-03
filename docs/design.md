# プロジェクト全体設計書

## 1. プロジェクト概要

**プロジェクト名:** Cloud Vision OCR Desktop App
**目的:** Google Cloud Vision APIを使用して、大規模PDF（数百ページ）をOCRし、Markdown形式でローカル保存するElectronアプリ
**対象ユーザー:** 個人利用

## 2. 技術スタック

### コアテクノロジー
- **Runtime:** Electron 33.x
- **UI Framework:** React 18.x
- **Build Tool:** Vite 6.x
- **Language:** TypeScript 5.x (Strict Mode)
- **State Management:** React Context + Hooks

### Google Cloud Services
- **Google Cloud Vision API:** 非同期バッチOCR処理
- **Google Cloud Storage:** 入出力ファイルの一時保存

### 主要ライブラリ
- `@google-cloud/vision`: Vision API SDK
- `@google-cloud/storage`: GCS SDK
- `dotenv`: 環境変数管理

## 3. アプリケーションアーキテクチャ

### プロセス分離
```
┌─────────────────────────────────────────┐
│         Main Process (Node.js)          │
│  - GCS Upload/Download                  │
│  - Vision API asyncBatchAnnotate        │
│  - JSON → Markdown変換                   │
│  - ファイルシステム操作                    │
└─────────────┬───────────────────────────┘
              │ IPC (contextBridge)
┌─────────────▼───────────────────────────┐
│      Renderer Process (React/Vite)      │
│  - UI Components                        │
│  - ユーザー操作                           │
│  - 進捗表示                              │
└─────────────────────────────────────────┘
```

### データフロー
```
1. ユーザーがPDFファイル選択
   ↓
2. Main Process: GCS input/ にアップロード
   ↓
3. Main Process: Vision API asyncBatchAnnotate呼び出し
   ↓
4. Main Process: ポーリングで完了待機
   ↓
5. Main Process: GCS output/ からJSONダウンロード
   ↓
6. Main Process: JSON解析 → Markdown生成
   ↓
7. Main Process: ローカルファイルシステムに保存
   ↓
8. Renderer: 完了通知 + 保存先表示
```

## 4. ディレクトリ構成

```
cloud-vision-ocr/
├── src/
│   ├── main/                           # Main Process
│   │   ├── index.ts                   # エントリーポイント
│   │   ├── preload.ts                 # IPC Bridge
│   │   ├── services/
│   │   │   ├── gcs.service.ts         # GCS操作
│   │   │   ├── vision.service.ts      # Vision API操作
│   │   │   ├── parser.service.ts      # JSON→MD変換
│   │   │   └── config.service.ts      # 設定管理
│   │   └── utils/
│   │       └── logger.ts              # ログ出力
│   ├── renderer/                       # Renderer Process
│   │   ├── src/
│   │   │   ├── App.tsx                # ルートコンポーネント
│   │   │   ├── main.tsx               # エントリーポイント
│   │   │   ├── components/
│   │   │   │   ├── FileDropzone.tsx  # ファイル選択UI
│   │   │   │   ├── ProgressLog.tsx   # 進捗ログ
│   │   │   │   ├── ConfigPanel.tsx   # 設定画面
│   │   │   │   └── ResultActions.tsx # 完了後アクション
│   │   │   ├── hooks/
│   │   │   │   └── useOCRProcess.ts  # OCR処理ロジック
│   │   │   ├── contexts/
│   │   │   │   └── ConfigContext.tsx # 設定状態管理
│   │   │   └── types/
│   │   │       └── index.ts          # 型定義
│   │   ├── index.html
│   │   └── vite.config.ts
│   └── shared/
│       └── types.ts                   # Main/Renderer共有型
├── docs/
│   ├── requirements.md                # 要件定義
│   ├── design.md                      # 本ファイル
│   ├── architecture.md                # アーキテクチャ詳細
│   └── api-spec.md                    # API仕様
├── electron-builder.yml               # ビルド設定
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── .env.example                       # 環境変数テンプレート
```

## 5. 主要機能

### 5.1 ファイル選択
- Drag & Drop対応
- ファイルダイアログ対応
- PDF形式のみ受付

### 5.2 OCR処理
- **非同期バッチ処理**を使用（同期処理は不可）
- ステップ:
  1. GCSアップロード
  2. asyncBatchAnnotate実行
  3. ポーリング（10秒間隔推奨）
  4. 結果ダウンロード
  5. Markdown変換

### 5.3 進捗表示
- リアルタイムログ表示
- 処理ステップの可視化
- エラーハンドリング

### 5.4 設定管理
- GCP認証キーパス
- GCSバケット名
- 出力先ディレクトリ
- ポーリング間隔

## 6. セキュリティ考慮事項

- **認証情報の保護:** keyfile.jsonはユーザーローカルに保存、アプリには含めない
- **contextIsolation:** 有効化（Electron推奨）
- **nodeIntegration:** 無効化（Electron推奨）
- **preload.ts経由のIPC通信のみ許可**

## 7. エラーハンドリング

### 想定エラー
- GCS認証失敗
- アップロード失敗
- Vision APIタイムアウト
- JSON解析エラー
- ファイル書き込みエラー

### 対応方針
- すべてのエラーをキャッチしてユーザーに通知
- ログファイルに詳細記録
- リトライ機能（GCS操作のみ）

## 8. パフォーマンス最適化

- **ストリーミングアップロード:** 大容量PDF対応
- **並列処理:** JSON複数ファイルの並列ダウンロード
- **メモリ管理:** 大容量テキストの段階的書き込み

## 9. 開発フェーズ

### Phase 1: 基盤構築
- プロジェクトセットアップ
- 型定義
- IPC通信基盤

### Phase 2: GCS連携
- アップロード機能
- ダウンロード機能

### Phase 3: Vision API統合
- asyncBatchAnnotate実装
- ポーリング機能

### Phase 4: UI実装
- React コンポーネント
- 状態管理

### Phase 5: 統合・テスト
- E2Eテスト
- パッケージング

## 10. 今後の拡張可能性

- 画像ファイル対応（PNG, JPG）
- バッチ処理（複数ファイル同時処理）
- OCR言語設定
- 出力フォーマット選択（TXT, DOCXなど）
