import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchRepoContext } from "@/lib/github";
import { analyzeDependencies } from "@/lib/npm";
import { generateSummaryStream, parseSummaryText } from "@/lib/ai";

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: NextRequest) {
  try {
    const { owner, repo } = await request.json();

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "owner and repo are required" },
        { status: 400 }
      );
    }

    // Check cache
    const cached = await prisma.repository.findUnique({
      where: { owner_repo: { owner, repo } },
      include: { dependencies: true, summary: true },
    });

    if (
      cached &&
      Date.now() - cached.analyzedAt.getTime() < CACHE_DURATION_MS
    ) {
      return NextResponse.json({
        dependencies: cached.dependencies
          ? {
              packages: JSON.parse(cached.dependencies.packages),
              vulnerabilities: JSON.parse(cached.dependencies.vulnerabilities),
              riskScore: cached.dependencies.riskScore,
            }
          : null,
        summary: cached.summary
          ? {
              overview: cached.summary.overview,
              dependencySummary: cached.summary.dependencySummary,
              riskSummary: cached.summary.riskSummary,
            }
          : null,
        cached: true,
      });
    }

    // Fetch repo context from GitHub
    const repoContext = await fetchRepoContext(owner, repo);

    // Analyze dependencies if package.json exists
    const depAnalysis = repoContext.packageJson
      ? await analyzeDependencies(repoContext.packageJson)
      : null;

    // Generate AI summary
    const summaryStream = generateSummaryStream(repoContext, depAnalysis);
    let fullText = "";
    for await (const chunk of (await summaryStream).textStream) {
      fullText += chunk;
    }
    const summary = parseSummaryText(fullText);

    // Upsert to DB
    const repository = await prisma.repository.upsert({
      where: { owner_repo: { owner, repo } },
      create: { owner, repo },
      update: { analyzedAt: new Date() },
    });

    // Upsert dependencies
    if (depAnalysis) {
      await prisma.dependencyAnalysis.upsert({
        where: { repositoryId: repository.id },
        create: {
          repositoryId: repository.id,
          packages: JSON.stringify(depAnalysis.packages),
          vulnerabilities: JSON.stringify(depAnalysis.vulnerabilities),
          riskScore: depAnalysis.riskScore,
        },
        update: {
          packages: JSON.stringify(depAnalysis.packages),
          vulnerabilities: JSON.stringify(depAnalysis.vulnerabilities),
          riskScore: depAnalysis.riskScore,
        },
      });
    }

    // Upsert summary
    await prisma.summary.upsert({
      where: { repositoryId: repository.id },
      create: {
        repositoryId: repository.id,
        overview: summary.overview,
        dependencySummary: summary.dependencySummary,
        riskSummary: summary.riskSummary,
      },
      update: {
        overview: summary.overview,
        dependencySummary: summary.dependencySummary,
        riskSummary: summary.riskSummary,
      },
    });

    return NextResponse.json({
      repository: repoContext,
      dependencies: depAnalysis,
      summary,
      cached: false,
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze repository" },
      { status: 500 }
    );
  }
}
