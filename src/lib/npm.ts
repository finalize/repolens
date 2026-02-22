import type {
  PackageJson,
  PackageInfo,
  Vulnerability,
  DependencyAnalysisResult,
} from "@/types";

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
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
      if (!res.ok) throw new Error(`Failed to fetch ${name}`);
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

  try {
    const res = await fetch(
      "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packages),
      }
    );

    if (!res.ok) return [];
    const data = await res.json();

    return Object.entries(data).flatMap(([packageName, advisories]) =>
      (advisories as Record<string, unknown>[]).map((a) => ({
        packageName,
        severity: a.severity as Vulnerability["severity"],
        title: a.title as string,
        url: a.url as string,
      }))
    );
  } catch {
    return [];
  }
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
