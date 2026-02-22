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