export type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

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

export type RepoContext = {
  info: {
    full_name: string;
    description: string | null;
    stargazers_count: number;
    forks_count: number;
    language: string | null;
    topics: string[];
    html_url: string;
  };
  packageJson: PackageJson | null;
  tree: string[];
  readme: string;
};

export type AnalysisResponse = {
  repository: RepoContext;
  dependencies: DependencyAnalysisResult | null;
  summary: {
    overview: string;
    dependencySummary: string;
    riskSummary: string;
  } | null;
  cached: boolean;
};
