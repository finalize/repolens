import { Suspense } from "react";
import { fetchRepoContext } from "@/lib/github";
import { analyzeDependencies } from "@/lib/npm";
import { generateSummaryStream, parseSummaryText } from "@/lib/ai";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function AISummary({
  owner,
  repo,
}: {
  owner: string;
  repo: string;
}) {
  const repoContext = await fetchRepoContext(owner, repo);
  const depAnalysis = repoContext.packageJson
    ? await analyzeDependencies(repoContext.packageJson)
    : null;

  const result = await generateSummaryStream(repoContext, depAnalysis);
  let fullText = "";
  for await (const chunk of result.textStream) {
    fullText += chunk;
  }

  const summary = parseSummaryText(fullText);

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 font-semibold">Overview</h3>
        <p className="text-sm text-muted-foreground">{summary.overview}</p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold">Dependency Summary</h3>
        <p className="text-sm text-muted-foreground">
          {summary.dependencySummary}
        </p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold">Risk Assessment</h3>
        <p className="text-sm text-muted-foreground">{summary.riskSummary}</p>
      </section>
    </div>
  );
}

function SummaryFallback() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i}>
          <div className="mb-1 h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default async function SummaryPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<SummaryFallback />}>
          <AISummary owner={owner} repo={repo} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
