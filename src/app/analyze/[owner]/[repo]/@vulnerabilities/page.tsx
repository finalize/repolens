import { fetchRepoContext } from "@/lib/github";
import { analyzeDependencies } from "@/lib/npm";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Vulnerability } from "@/types";

const severityColors: Record<Vulnerability["severity"], string> = {
  critical: "destructive",
  high: "destructive",
  moderate: "secondary",
  low: "outline",
};

export default async function VulnerabilitiesPage({
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
          <CardTitle>Vulnerabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No package.json found — vulnerability scan skipped.
          </p>
        </CardContent>
      </Card>
    );
  }

  const analysis = await analyzeDependencies(repoContext.packageJson);
  const { vulnerabilities } = analysis;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Vulnerabilities
          {vulnerabilities.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {vulnerabilities.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {vulnerabilities.length === 0 ? (
          <p className="text-muted-foreground">
            No known vulnerabilities detected.
          </p>
        ) : (
          <div className="space-y-2">
            {vulnerabilities.map((vuln, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">
                    {vuln.packageName}
                  </span>
                  <Badge
                    variant={
                      severityColors[vuln.severity] as
                        | "default"
                        | "secondary"
                        | "destructive"
                        | "outline"
                    }
                  >
                    {vuln.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{vuln.title}</p>
                <a
                  href={vuln.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:underline"
                >
                  View advisory
                </a>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
