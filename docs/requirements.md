# Role
あなたはGoogle Cloud PlatformとElectronのエキスパートです。
TypeScriptとNode.jsを使用した堅牢なデスクトップアプリケーションの設計と実装を行ってください。

# Goal
Google Cloud Vision APIを使用して、ローカルの画像やPDFファイル（数百ページ規模）をOCRし、
テキストデータ（Markdown形式）としてローカルに保存するElectronアプリを作成したい。
個人での利用を想定。

# Requirements

## 1. Technical Stack
- **Environment:** Electron + React + Vite (TypeScript)
- **Language:** TypeScript (Strict mode)
- **Cloud Service:** Google Cloud Vision API, Google Cloud Storage (GCS)
- **State Management:** React Context or simple Hooks (Keep it simple)

## 2. Core Logic (Critical)
入力されるPDFは数百ページ（書籍）規模です。したがって、同期リクエスト(`annotate`)は使用できません。
必ず以下のフローで**非同期バッチ処理 (`asyncBatchAnnotate`)** を実装してください。

1. **Upload:** ユーザーが選択したPDFを、指定されたGCSバケットの `input/` フォルダにアップロードする。
2. **Request:** Vision APIに対し、GCS上のPDFを入力とし、GCS上の `output/` フォルダを出力先として `asyncBatchAnnotate` リクエストを送る。
3. **Polling:** 処理が完了するまで（または出力フォルダにJSONが生成されるまで）、適切な間隔でステータスを確認する。
4. **Download:** GCSに出力されたJSONファイル群をダウンロードする。
5. **Parse:** JSONから `fullTextAnnotation` を抽出し、ページ順に結合して1つの Markdownファイルを作成する。

## 3. Configuration
- GCPの認証情報（keyfile.jsonのパス）とバケット名は、環境変数または設定画面から入力できるように設計してください。

## 4. UI/UX
- 複雑なプレビューは不要。
- ファイル選択エリア（Drag & Drop）。
- 処理状況を示すログまたはプログレスバー。
- 処理完了後の「保存先を開く」ボタン。

## Output Deliverables
まずは、この要件を満たすための **プロジェクトのディレクトリ構造** と、
**`package.json` に必要な依存関係（dependencies）** を提案してください。
コードの実装はその後ステップバイステップで行います。