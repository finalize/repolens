# GitHub Repository Analyzer - Implementation Spec

## プロジェクト概要

GitHubリポジトリのURLを入力すると、依存関係の分析結果とAIサマリーを表示するWebダッシュボード。

**学習目的**: Next.js App Router（Server Components・Streaming・Parallel Routes）の習得 + AI統合 + バックエンド設計

---

## 技術スタック

| 項目 | 選択 |
|------|------|
| Framework | Next.js App Router（TypeScript） |
| Deploy | Vercel（無料枠） |
| AI | Vercel AI SDK |
| DB | Prisma + Vercel Postgres |
| GitHub API | Octokit |
| UI | shadcn/ui |

**使用しないもの**: Server Actions（再利用性の観点からRoute Handlersを使用）

---

## コア機能

### 1. 依存関係分析
- パッケージの最新バージョンとの差分（major / minor / patch / up-to-date）
- 脆弱性検出（npm advisory API）
- ライセンスリスク
- リスクスコア（0〜100）

### 2. AIサマリー
- リポジトリ概要（README + ディレクトリ構成から生成）
- 依存関係の状況を自然言語で解説
- 総合的な技術的リスク評価

### 3. キャッシュ
- 分析結果をDBに24時間キャッシュ
- 同一リポジトリへの再アクセスはDBから返す

---

## ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx                        # トップ（URL入力フォーム）
│   ├── layout.tsx
│   ├── analyze/
│   │   └── [owner]/
│   │       └── [repo]/
│   │           ├── page.tsx            # ダッシュボード本体（Parallel Routesのレイアウト）
│   │           ├── loading.tsx         # Suspenseフォールバック
│   │           ├── @dependencies/
│   │           │   └── page.tsx        # 依存関係セクション
│   │           ├── @vulnerabilities/
│   │           │   └── page.tsx        # 脆弱性セクション
│   │           └── @summary/
│   │               └── page.tsx        # AIサマリーセクション（Streaming）
│   └── api/
│       └── analyze/
│           └── route.ts                # 分析トリガー・キャッシュ制御
├── components/
├── lib/
│   ├── github.ts                       # GitHub APIクライアント
│   ├── npm.ts                          # npm registry / advisory API
│   ├── ai.ts                           # Vercel AI SDK
│   └── db.ts                           # Prisma client
└── types/
    └── index.ts
```

**URLパラメータ設計**: `/analyze/vercel/next.js` のようにGitHubのowner/repoと1対1対応

**App Routerの活用ポイント**:
- Parallel Routesで依存関係・脆弱性・AIサマリーを独立してフェッチ・表示（一部が遅くても他をブロックしない）
- AIサマリーはStreamingで逐次表示
- Server Componentsでデータフェッチ

---

## DB設計（Prisma）

```prisma
model Repository {
  id           String    @id @default(cuid())
  owner        String
  repo         String
  analyzedAt   DateTime  @default(now())

  dependencies DependencyAnalysis?
  summary      Summary?

  @@unique([owner, repo])
}

model DependencyAnalysis {
  id              String     @id @default(cuid())
  repositoryId    String     @unique
  repository      Repository @relation(fields: [repositoryId], references: [id])

  packages        Json       // PackageInfo[]
  vulnerabilities Json       // Vulnerability[]
  riskScore       Int        // 0-100

  createdAt       DateTime   @default(now())
}

model Summary {
  id                String     @id @default(cuid())
  repositoryId      String     @unique
  repository        Repository @relation(fields: [repositoryId], references: [id])

  overview          String     // リポジトリ概要
  dependencySummary String     // 依存関係のAI解説
  riskSummary       String     // 技術的リスクのAI評価

  createdAt         DateTime   @default(now())
}
```

---

## キャッシュ戦略

```
リクエスト
  → DBにowner+repoのレコードが存在 かつ analyzedAtが24時間以内？
      YES → DBから返す
      NO  → GitHub API取得 → npm分析 → AI生成 → DBにupsert → 返す
```

---

## GitHub APIクライアント（lib/github.ts）

```typescript
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export type RepoContext = {
  info: Awaited<ReturnType<typeof fetchRepoInfo>>;
  packageJson: PackageJson | null;
  tree: string[];
  readme: string;
};

export async function fetchRepoContext(
  owner: string,
  repo: string
): Promise<RepoContext> {
  const [info, packageJson, tree, readme] = await Promise.all([
    fetchRepoInfo(owner, repo),
    fetchPackageJson(owner, repo),
    fetchTree(owner, repo),
    fetchReadme(owner, repo),
  ]);
  return { info, packageJson, tree, readme };
}

async function fetchRepoInfo(owner: string, repo: string) {
  const { data } = await octokit.repos.get({ owner, repo });
  return data;
}

async function fetchPackageJson(
  owner: string,
  repo: string
): Promise<PackageJson | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: "package.json",
    });
    if ("content" in data) {
      return JSON.parse(Buffer.from(data.content, "base64").toString());
    }
    return null;
  } catch {
    return null; // package.jsonがないリポジトリも許容（Rust等）
  }
}

async function fetchTree(owner: string, repo: string): Promise<string[]> {
  const { data } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: "HEAD",
    recursive: "1",
  });
  return data.tree
    .map((item) => item.path ?? "")
    .filter(Boolean)
    .slice(0, 200); // トークン節約
}

async function fetchReadme(owner: string, repo: string): Promise<string> {
  try {
    const { data } = await octokit.repos.getReadme({ owner, repo });
    if ("content" in data) {
      return Buffer.from(data.content, "base64").toString().slice(0, 3000);
    }
    return "";
  } catch {
    return "";
  }
}
```

---

## npm分析（lib/npm.ts）

```typescript
export type PackageInfo = {
  name: string;
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  versionDiff: "major" | "minor" | "patch" | "up-to-date";
  license: string | null;
};

export type Vulnerability = {
  packageName: string;
  severity: "critical" | "high" | "moderate" | "low";
  title: string;
  url: string;
};

export type DependencyAnalysisResult = {
  packages: PackageInfo[];
  vulnerabilities: Vulnerability[];
  riskScore: number;
};

export async function analyzeDependencies(
  packageJson: PackageJson
): Promise<DependencyAnalysisResult> {
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const [packages, vulnerabilities] = await Promise.all([
    fetchPackageInfos(allDeps),
    fetchVulnerabilities(allDeps),
  ]);

  const riskScore = calcRiskScore(packages, vulnerabilities);
  return { packages, vulnerabilities, riskScore };
}

async function fetchPackageInfos(
  deps: Record<string, string>
): Promise<PackageInfo[]> {
  const results = await Promise.allSettled(
    Object.entries(deps).map(async ([name, currentVersion]) => {
      const res = await fetch(`https://registry.npmjs.org/${name}/latest`);
      const data = await res.json();
      const latest = data.version as string;
      const current = currentVersion.replace(/[\^~]/, "");
      return {
        name,
        currentVersion: current,
        latestVersion: latest,
        isOutdated: current !== latest,
        versionDiff: calcVersionDiff(current, latest),
        license: data.license ?? null,
      };
    })
  );

  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<PackageInfo>).value);
  // Promise.allSettledを使う理由: 特定パッケージのfetch失敗で全体を止めないため
}

async function fetchVulnerabilities(
  deps: Record<string, string>
): Promise<Vulnerability[]> {
  const packages = Object.fromEntries(
    Object.entries(deps).map(([name, version]) => [
      name,
      [version.replace(/[\^~]/, "")],
    ])
  );

  const res = await fetch(
    "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packages),
    }
  );

  const data = await res.json();

  return Object.entries(data).flatMap(([packageName, advisories]) =>
    (advisories as any[]).map((a) => ({
      packageName,
      severity: a.severity,
      title: a.title,
      url: a.url,
    }))
  );
}

function calcVersionDiff(
  current: string,
  latest: string
): PackageInfo["versionDiff"] {
  const [curMajor, curMinor] = current.split(".").map(Number);
  const [latMajor, latMinor] = latest.split(".").map(Number);
  if (curMajor !== latMajor) return "major";
  if (curMinor !== latMinor) return "minor";
  if (current !== latest) return "patch";
  return "up-to-date";
}

function calcRiskScore(
  packages: PackageInfo[],
  vulnerabilities: Vulnerability[]
): number {
  let score = 100;
  for (const v of vulnerabilities) {
    if (v.severity === "critical") score -= 20;
    else if (v.severity === "high") score -= 10;
    else if (v.severity === "moderate") score -= 5;
    else score -= 2;
  }
  for (const p of packages) {
    if (p.versionDiff === "major") score -= 5;
    else if (p.versionDiff === "minor") score -= 2;
    else if (p.versionDiff === "patch") score -= 1;
  }
  return Math.max(0, score);
}
```

---

## AIサマリー（lib/ai.ts）

Vercel AI SDKを使用してStreamingでサマリーを生成する。

**入力**: RepoContext + DependencyAnalysisResult
**出力**: overview / dependencySummary / riskSummary の3セクション

プロンプトの構成:
1. READMEとディレクトリ構成からリポジトリの概要を生成
2. 依存関係の分析結果（riskScore・脆弱性・古いパッケージ一覧）を渡してAIが自然言語で解説
3. 上記を統合してリスク評価を生成

---

## 環境変数

```env
GITHUB_TOKEN=
DATABASE_URL=
OPENAI_API_KEY=   # または ANTHROPIC_API_KEY
```

---

## 実装上の注意点

- `package.json`が存在しないリポジトリ（Rust・Goなど）でも最低限サマリーは表示する
- Vercel無料枠のため、Streamingのタイムアウト（10秒）に注意
- GitHubのrate limitに注意（認証トークン使用で5000req/h）
- `tree`は200件、`readme`は3000文字でクリップしてトークン数を制御

## ワークフロー・オーケストレーション

### 1. Plan Node Default
- 3ステップ以上、または設計判断を含む非自明なタスクは必ずプランモードに入る
- 問題が起きたら無理に進めず、すぐ停止して再プランする
- ビルドだけでなく検証工程にもプランモードを使う
- 曖昧さを減らすため、最初に詳細な仕様を書く

### 2. サブエージェント戦略
- メインのコンテキストを綺麗に保つため積極的にサブエージェントを使う
- 調査・探索・並列分析はサブエージェントに任せる
- 複雑な問題にはサブエージェントで計算資源を多く投下する
- 1サブエージェント1タスクで集中実行

### 3. 自己改善ループ
- ユーザーから修正を受けたら必ず `tasks/lessons.md` にパターンを追記
- 同じミスを防ぐルールを自分で作る
- ミス率が下がるまで徹底的に改善を繰り返す
- セッション開始時に関連プロジェクトの教訓を見直す

### 4. 完了前の検証
- 動作確認なしに完了扱いにしない
- 必要に応じて main と変更差分を確認する
- 「スタッフエンジニアが承認するか？」と自問する
- テスト実行・ログ確認・正しさの証明を行う

### 5. エレガンスの追求（バランス重視）
- 重要な変更では「より美しい方法はないか？」と立ち止まる
- ハックっぽい修正なら、最善の解決策を再実装する
- 単純な修正では過度な設計をしない
- 提出前に自分の仕事を疑う

### 6. 自律的バグ修正
- バグ報告を受けたら即修正する。手取り足取りは求めない
- ログ・エラー・失敗テストを確認して解決する
- ユーザーに文脈切替を要求しない
- 指示がなくてもCIの失敗を直す

## タスク管理

1. **まず計画**: `tasks/todo.md` にチェック可能な計画を書く
2. **計画確認**: 実装前に確認する
3. **進捗管理**: 完了した項目を都度チェック
4. **変更説明**: 各ステップで概要を説明
5. **結果記録**: `tasks/todo.md` にレビューを追加
6. **教訓蓄積**: 修正後は `tasks/lessons.md` を更新

## コア原則

- **シンプル第一**: 変更は可能な限り単純に。影響範囲は最小限に。
- **怠らない**: 根本原因を解決する。応急処置は禁止。シニア水準。
- **最小影響**: 必要な箇所だけ変更し、新たなバグを生まない。

<!-- ## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs. -->