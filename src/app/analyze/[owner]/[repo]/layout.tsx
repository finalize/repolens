import { ReactNode } from "react";

export default async function AnalyzeLayout({
  children,
  dependencies,
  vulnerabilities,
  summary,
}: {
  children: ReactNode;
  dependencies: ReactNode;
  vulnerabilities: ReactNode;
  summary: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-6xl p-4 md:p-8">
      {children}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          {dependencies}
          {vulnerabilities}
        </div>
        <div>{summary}</div>
      </div>
    </main>
  );
}
