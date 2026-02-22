import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import type { RepoContext, DependencyAnalysisResult } from "@/types";

export function generateSummaryStream(
  repoContext: RepoContext,
  depAnalysis: DependencyAnalysisResult | null
) {
  const outdatedPackages = depAnalysis?.packages.filter((p) => p.isOutdated) ?? [];
  const vulnSummary =
    depAnalysis?.vulnerabilities
      .map((v) => `- [${v.severity}] ${v.packageName}: ${v.title}`)
      .join("\n") || "No vulnerabilities detected.";

  const prompt = `You are an expert software analyst. Analyze this GitHub repository and provide a structured summary.

## Repository Info
- Name: ${repoContext.info.full_name}
- Description: ${repoContext.info.description ?? "N/A"}
- Language: ${repoContext.info.language ?? "N/A"}
- Stars: ${repoContext.info.stargazers_count} | Forks: ${repoContext.info.forks_count}

## README (truncated)
${repoContext.readme || "No README available."}

## Directory Structure
${repoContext.tree.slice(0, 50).join("\n")}

## Dependency Analysis
- Risk Score: ${depAnalysis?.riskScore ?? "N/A"}/100
- Total packages: ${depAnalysis?.packages.length ?? 0}
- Outdated packages: ${outdatedPackages.length}
${outdatedPackages.length > 0 ? "Major outdated: " + outdatedPackages.filter((p) => p.versionDiff === "major").map((p) => `${p.name} (${p.currentVersion} → ${p.latestVersion})`).join(", ") : ""}

## Vulnerabilities
${vulnSummary}

---

Please respond in the following format with exactly these three sections, each starting with the header shown:

## Overview
A concise summary of what this repository is, its purpose, and key features (2-3 sentences).

## Dependency Summary
An analysis of the dependency health: which packages are outdated, any licensing concerns, and overall maintenance status (2-3 sentences).

## Risk Assessment
An overall technical risk evaluation considering vulnerabilities, outdated dependencies, and project health (2-3 sentences).`;

  return streamText({
    model: google("gemini-2.0-flash"),
    prompt,
  });
}

export function parseSummaryText(text: string) {
  const sections = {
    overview: "",
    dependencySummary: "",
    riskSummary: "",
  };

  const overviewMatch = text.match(/## Overview\n([\s\S]*?)(?=## Dependency Summary|$)/);
  const depMatch = text.match(/## Dependency Summary\n([\s\S]*?)(?=## Risk Assessment|$)/);
  const riskMatch = text.match(/## Risk Assessment\n([\s\S]*?)$/);

  if (overviewMatch) sections.overview = overviewMatch[1].trim();
  if (depMatch) sections.dependencySummary = depMatch[1].trim();
  if (riskMatch) sections.riskSummary = riskMatch[1].trim();

  return sections;
}
