# 実装計画書

## 実装フェーズ

### Phase 1: 基盤・型定義 ✅
**目標:** プロジェクトの基本構造とTypeScript型定義を整備

#### 完了項目
- [x] プロジェクト設計書作成
- [x] アーキテクチャ設計書作成
- [x] API仕様書作成
- [x] package.json作成
- [x] TypeScript設定ファイル作成
- [x] Vite設定ファイル作成
- [x] ディレクトリ構造作成

#### 次のステップ
- [ ] 共有型定義ファイル (`src/shared/types.ts`)
- [ ] Renderer型定義ファイル (`src/renderer/src/types/index.ts`)

---

### Phase 2: Main Process - サービス層実装
**目標:** GCS、Vision API、Parser、Config各サービスの実装

#### 2.1 ConfigService
**優先度:** 高（他のサービスの依存元）
- [ ] `src/main/services/config.service.ts`
  - [ ] loadConfig()
  - [ ] saveConfig()
  - [ ] getDefaultConfig()
  - [ ] 設定ファイルディレクトリ作成
  - [ ] 設定ファイル読み書き

**依存:** なし

---

#### 2.2 Logger
**優先度:** 高（全サービスで使用）
- [ ] `src/main/utils/logger.ts`
  - [ ] ログレベル設定
  - [ ] コンソール出力
  - [ ] ファイル出力
  - [ ] タイムスタンプ付与

**依存:** ConfigService

---

#### 2.3 GCSService
**優先度:** 高
- [ ] `src/main/services/gcs.service.ts`
  - [ ] GCP認証初期化
  - [ ] uploadFile() - ストリーミングアップロード
  - [ ] downloadFile() - ストリーミングダウンロード
  - [ ] listFiles() - フォルダ内ファイル一覧
  - [ ] fileExists() - ファイル存在確認
  - [ ] エラーハンドリング

**依存:** Logger

**テスト項目:**
- GCP認証成功/失敗
- 小サイズファイル（1MB）のアップロード
- 大サイズファイル（100MB）のアップロード
- ダウンロード
- 存在しないファイルへのアクセス

---

#### 2.4 VisionService
**優先度:** 高
- [ ] `src/main/services/vision.service.ts`
  - [ ] GCP認証初期化
  - [ ] asyncBatchAnnotate() - 非同期バッチリクエスト
  - [ ] pollOperation() - ポーリングループ
  - [ ] getOperationStatus() - Operation状態取得
  - [ ] タイムアウト処理
  - [ ] エラーハンドリング

**依存:** Logger

**テスト項目:**
- API リクエスト成功
- Operation ポーリング
- タイムアウト処理
- API エラー処理

---

#### 2.5 ParserService
**優先度:** 中
- [ ] `src/main/services/parser.service.ts`
  - [ ] parseVisionOutput() - JSON複数ファイル読み込み
  - [ ] extractText() - fullTextAnnotation抽出
  - [ ] convertToMarkdown() - Markdown変換
  - [ ] saveMarkdown() - ファイル保存
  - [ ] ページソート処理
  - [ ] エラーハンドリング

**依存:** Logger

**テスト項目:**
- JSON解析
- ページ順ソート
- Markdown生成
- ファイル書き込み

---

### Phase 3: Main Process - IPC通信実装
**目標:** Renderer ↔ Main のIPC通信基盤構築

#### 3.1 Preload Script
- [ ] `src/main/preload.ts`
  - [ ] contextBridge.exposeInMainWorld()
  - [ ] IPC invoke ハンドラー定義
  - [ ] IPC on ハンドラー定義
  - [ ] 型安全性確保

**依存:** 共有型定義

---

#### 3.2 Main Process Entry
- [ ] `src/main/index.ts`
  - [ ] Electron app初期化
  - [ ] BrowserWindow作成
  - [ ] セキュリティ設定（contextIsolation, nodeIntegration）
  - [ ] IPC ハンドラー登録
    - [ ] start-ocr
    - [ ] get-config
    - [ ] save-config
    - [ ] select-file
    - [ ] open-folder
  - [ ] OCR処理オーケストレーション
  - [ ] 進捗イベント送信
  - [ ] エラーイベント送信
  - [ ] 完了イベント送信

**依存:** 全サービス、Preload

---

### Phase 4: Renderer Process - UI実装
**目標:** Reactコンポーネントと状態管理の実装

#### 4.1 Context・Hook
- [ ] `src/renderer/src/contexts/ConfigContext.tsx`
  - [ ] ConfigProvider
  - [ ] useConfig フック
  - [ ] 設定読み込み・保存
  - [ ] エラーハンドリング

- [ ] `src/renderer/src/hooks/useOCRProcess.ts`
  - [ ] OCR状態管理
  - [ ] startOCR()
  - [ ] reset()
  - [ ] 進捗イベント購読
  - [ ] エラーイベント購読
  - [ ] 完了イベント購読

**依存:** 共有型定義、Renderer型定義

---

#### 4.2 Reactコンポーネント
**優先度:** 中

- [ ] `src/renderer/src/components/ConfigPanel.tsx`
  - [ ] GCPキーファイルパス入力
  - [ ] GCSバケット名入力
  - [ ] デフォルト出力先入力
  - [ ] ポーリング間隔設定
  - [ ] 保存ボタン
  - [ ] バリデーション

- [ ] `src/renderer/src/components/FileDropzone.tsx`
  - [ ] Drag & Drop エリア
  - [ ] ファイル選択ダイアログ
  - [ ] PDFファイルのみ受付
  - [ ] ファイル名表示

- [ ] `src/renderer/src/components/ProgressLog.tsx`
  - [ ] 進捗ログリスト表示
  - [ ] 各ステップの状態表示
  - [ ] プログレスバー
  - [ ] 自動スクロール

- [ ] `src/renderer/src/components/ResultActions.tsx`
  - [ ] 完了メッセージ
  - [ ] ファイルパス表示
  - [ ] 「フォルダを開く」ボタン
  - [ ] 「新規OCR」ボタン

- [ ] `src/renderer/src/App.tsx`
  - [ ] レイアウト構築
  - [ ] コンポーネント統合
  - [ ] 状態連携

**依存:** Context、Hook

---

#### 4.3 Renderer Entry
- [ ] `src/renderer/src/main.tsx`
  - [ ] React DOM レンダリング
  - [ ] ConfigProvider ラップ

- [ ] `src/renderer/index.html`
  - [ ] HTML テンプレート
  - [ ] スタイル読み込み

**依存:** App.tsx

---

### Phase 5: スタイリング
**目標:** UIの見た目を整える

- [ ] 基本CSS作成
  - [ ] レイアウト
  - [ ] カラーテーマ
  - [ ] フォント
  - [ ] Drag & Drop エフェクト
  - [ ] プログレスバー
  - [ ] ボタンスタイル

**オプション:** Tailwind CSS または CSS Modules導入

---

### Phase 6: 統合テスト
**目標:** 全体フローの動作確認

#### 6.1 開発環境テスト
- [ ] `npm run dev` でアプリ起動
- [ ] 設定画面で認証情報入力
- [ ] 小規模PDF（5ページ）でOCR実行
- [ ] 進捗ログ確認
- [ ] 出力Markdownファイル確認
- [ ] エラーケース確認
  - [ ] 認証失敗
  - [ ] ネットワークエラー
  - [ ] ファイルアクセスエラー

#### 6.2 大規模PDFテスト
- [ ] 50ページPDF
- [ ] 100ページPDF
- [ ] 200ページPDF
- [ ] ポーリング動作確認
- [ ] メモリ使用量確認

---

### Phase 7: ビルド・パッケージング
**目標:** 配布可能な実行ファイル作成

- [ ] `npm run build` 実行確認
- [ ] electron-builder 設定調整
- [ ] Windows版ビルド（NSIS, Portable）
- [ ] macOS版ビルド（DMG）
- [ ] Linux版ビルド（AppImage, deb）
- [ ] アイコン作成・設定

---

### Phase 8: ドキュメント整備
**目標:** ユーザー向けドキュメント作成

- [ ] `docs/user-guide.md` - ユーザーマニュアル
  - [ ] インストール方法
  - [ ] GCP設定方法
  - [ ] 使用方法
  - [ ] トラブルシューティング

- [ ] `README.md` - プロジェクト概要
  - [ ] 機能説明
  - [ ] セットアップ手順
  - [ ] ビルド手順
  - [ ] ライセンス

---

## 実装順序まとめ

```
1. 型定義 (shared/types.ts, renderer/types/index.ts)
2. ConfigService
3. Logger
4. GCSService
5. VisionService
6. ParserService
7. Preload Script
8. Main Process Entry (index.ts)
9. ConfigContext
10. useOCRProcess Hook
11. Reactコンポーネント（ConfigPanel → FileDropzone → ProgressLog → ResultActions → App）
12. Renderer Entry (main.tsx, index.html)
13. スタイリング
14. 統合テスト
15. ビルド・パッケージング
16. ドキュメント整備
```

---

## 各実装の完了条件

### サービス層
- [ ] TypeScript strict モードでエラーなし
- [ ] 主要機能の動作確認（手動テスト）
- [ ] エラーハンドリング実装
- [ ] ログ出力実装

### UI層
- [ ] コンポーネントのレンダリング確認
- [ ] ユーザー操作の動作確認
- [ ] 状態管理の正常動作
- [ ] エラー表示の確認

### 統合
- [ ] E2Eフロー完走
- [ ] エラーケース処理確認
- [ ] パフォーマンス確認（大規模PDF）

---

## 現在の状態

**完了:** Phase 1 - 基盤・型定義 ✅
**次のステップ:** Phase 2 - サービス層実装（型定義から開始）

---

## 注意事項

1. **GCP認証:** 実装前にGCPプロジェクトとService Accountを作成し、keyfile.jsonを準備すること
2. **Vision API有効化:** Google Cloud Vision APIとCloud Storage APIを有効化すること
3. **バケット作成:** テスト用GCSバケットを作成すること（input/, output/ フォルダは自動作成）
4. **コスト注意:** Vision APIは従量課金なので、大規模テスト時は費用に注意
5. **セキュリティ:** keyfile.jsonは絶対にGitにコミットしないこと（.gitignoreで除外済み）
