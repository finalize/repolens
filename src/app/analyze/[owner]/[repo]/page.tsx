import Link from "next/link";
import { fetchRepoContext } from "@/lib/github";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AnalyzePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const repoContext = await fetchRepoContext(owner, repo);
  const { info } = repoContext;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">
              <Link
                href={info.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {info.full_name}
              </Link>
            </CardTitle>
            <CardDescription>{info.description}</CardDescription>
          </div>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            &larr; Back
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {info.language && <Badge variant="secondary">{info.language}</Badge>}
          <Badge variant="outline">
            {info.stargazers_count.toLocaleString()} stars
          </Badge>
          <Badge variant="outline">
            {info.forks_count.toLocaleString()} forks
          </Badge>
          {info.topics.slice(0, 5).map((topic) => (
            <Badge key={topic} variant="secondary">
              {topic}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
