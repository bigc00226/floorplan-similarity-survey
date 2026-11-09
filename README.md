# 間取り図 類似性評価アンケート（Prolific 連携）— デモ版

Next.js 16（App Router）だけで動くデモです。データベースや環境変数は不要で、そのまま Vercel にデプロイできます。

## ページ構成

| URL | 内容 |
|---|---|
| `/` | デモのトップ（参加者 ID を自動生成して開始、検収項目と確認方法） |
| `/study?PROLIFIC_PID=…&STUDY_ID=…&SESSION_ID=…` | 参加者画面（英語）。同意 → 見方 → 理解度確認 → 練習 → 本試行 N+2 問 → 事後質問 → 属性 → 完了 |
| `/admin` | 管理画面（ダッシュボード／参加者／問題別／設定／取込検証／CSV／シミュレーション／ログ） |
| `/docs` | 設計・運用資料（技術構成、割当方式、離脱処理、CSV、Prolific 設定、相談事項） |
| `/RPLAN_triplets/{triplet_id}/{a,b,c}.png` | ご提供いただいた実データの間取り図（`public/RPLAN_triplets/` の静的ファイル） |
| `/placeholder/{id}/{a,b,c}` | 練習・注意力確認用の仮画像（ご用意いただく画像に差し替え予定） |
| `/api/triplets.csv` | デモ用の問題データ CSV（3,000 行） |

## 問題データの取り込み（差し替え時）

```bash
node scripts/import-data.mjs <RPLAN_triplets フォルダのパス>
```

`triplets.csv`・`triplets.json`・各フォルダの画像を検査し、`public/RPLAN_triplets/` と `lib/data/triplets.json` を更新します。

## ローカル起動

```bash
npm install
npm run dev        # http://localhost:3000
```

## Vercel へのデプロイ

1. このフォルダを GitHub リポジトリに push
2. Vercel で **Add New → Project** → リポジトリを選択
3. Framework Preset は自動で **Next.js**。Build / Output の設定・環境変数は不要
4. **Deploy**

CLI の場合: `npx vercel`（このフォルダ内で実行）→ `npx vercel --prod`

## デモの仕様メモ

- データベースには接続しません。割当・保存・離脱処理はブラウザ内の仮想バックエンド（`lib/engine.ts`・`lib/allocator.ts`）で実行します。
- 回答データはブラウザの localStorage に保存（端末間で共有されない）。Web Locks API で複数タブ間の排他制御を行います。
- 実データのうち 0 バイトの画像 832 枚（279 組）は、取り込み時に検出して出題対象から除外しています。
- 参加者画面の左下「DEMO 内部状態」パネルはデモ専用（記録内容の確認・本試行の自動回答）。
