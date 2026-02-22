# Repolens

GitHub リポジトリの依存関係・脆弱性を分析する Web ダッシュボード。

## 機能

- **依存関係分析** — パッケージの最新バージョンとの差分（major / minor / patch）、ライセンス表示、リスクスコア算出
- **脆弱性検出** — npm advisory API によるセキュリティアドバイザリーの一覧表示
- **AI サマリー**（準備中） — リポジトリ概要・依存関係の解説・技術的リスク評価を自動生成
- **24 時間キャッシュ** — 同一リポジトリへの再アクセスは DB から即時返却

## 技術スタック

| 項目 | 選択 |
|------|------|
| Framework | Next.js App Router (TypeScript) |
| UI | shadcn/ui + Tailwind CSS |
| DB | Prisma + SQLite |
| GitHub API | Octokit |
| AI | Vercel AI SDK（プロバイダー未定） |

## Next.js App Router の活用

このプロジェクトは Next.js App Router の学習を目的としています。

- **Server Components** — 全分析ページがサーバー上でデータフェッチ・レンダリング。`useEffect` / `useState` 不要
- **Parallel Routes** — `@dependencies` / `@vulnerabilities` / `@summary` が独立して並列レンダリング
- **Dynamic Routes** — `/analyze/[owner]/[repo]` で GitHub の owner/repo と 1 対 1 対応
- **loading.tsx** — ファイルを置くだけで Suspense フォールバックが自動適用
- **Route Handlers** — `api/analyze/route.ts` で REST API を提供（Server Actions は再利用性の観点から不使用）

## セットアップ

```bash
npm install
cp .env.example .env.local
```

`.env.local` を編集：

```
GITHUB_TOKEN=your_github_personal_access_token
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
```

`GITHUB_TOKEN` は [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens) から取得。

```bash
npx prisma generate
npx prisma db push
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いて GitHub リポジトリの URL を入力。

## ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx                          # トップ（URL 入力フォーム）
│   ├── layout.tsx
│   ├── analyze/[owner]/[repo]/
│   │   ├── layout.tsx                    # Parallel Routes レイアウト
│   │   ├── page.tsx                      # リポジトリ情報ヘッダー
│   │   ├── loading.tsx                   # Suspense フォールバック
│   │   ├── @dependencies/page.tsx        # 依存関係セクション
│   │   ├── @vulnerabilities/page.tsx     # 脆弱性セクション
│   │   └── @summary/page.tsx            # AI サマリーセクション
│   └── api/analyze/route.ts             # 分析 API（キャッシュ制御）
├── lib/
│   ├── github.ts                         # GitHub API クライアント
│   ├── npm.ts                            # npm registry / advisory API
│   ├── ai.ts                             # Vercel AI SDK
│   └── db.ts                             # Prisma client
├── components/                           # shadcn/ui コンポーネント
└── types/index.ts                        # 型定義
```
