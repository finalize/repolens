import { fetchRepoContext } from "@/lib/github";
import { analyzeDependencies } from "@/lib/npm";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PackageInfo } from "@/types";

const diffColors: Record<PackageInfo["versionDiff"], string> = {
  major: "destructive",
  minor: "secondary",
  patch: "outline",
  "up-to-date": "default",
};

export default async function DependenciesPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const repoContext = await fetchRepoContext(owner, repo);

  if (!repoContext.packageJson) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>依存関係</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            このリポジトリに package.json が見つかりませんでした。
          </p>
        </CardContent>
      </Card>
    );
  }

  const analysis = await analyzeDependencies(repoContext.packageJson);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>依存関係</CardTitle>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">リスクスコア</p>
            <p className="text-2xl font-bold">{analysis.riskScore}/100</p>
          </div>
        </div>
        <Progress value={analysis.riskScore} className="mt-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {analysis.packages.map((pkg) => (
            <div
              key={pkg.name}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono">{pkg.name}</span>
                {pkg.license && (
                  <Badge variant="outline" className="text-xs">
                    {pkg.license}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {pkg.currentVersion}
                </span>
                {pkg.isOutdated && (
                  <>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span>{pkg.latestVersion}</span>
                  </>
                )}
                <Badge
                  variant={
                    diffColors[pkg.versionDiff] as
                      | "default"
                      | "secondary"
                      | "destructive"
                      | "outline"
                  }
                >
                  {pkg.versionDiff}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
