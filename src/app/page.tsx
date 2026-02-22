"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const match = url.match(
      /(?:https?:\/\/github\.com\/)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/?/
    );

    if (!match) {
      setError(
        "Invalid format. Use a GitHub URL (https://github.com/owner/repo) or owner/repo."
      );
      return;
    }

    const [, owner, repo] = match;
    router.push(`/analyze/${owner}/${repo}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">RepoLens</CardTitle>
          <CardDescription>
            Analyze GitHub repositories for dependency health, vulnerabilities,
            and AI-powered insights.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              placeholder="https://github.com/owner/repo or owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">
              Analyze
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
