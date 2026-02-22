import { Octokit } from "@octokit/rest";
import type { PackageJson, RepoContext } from "@/types";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export async function fetchRepoContext(
  owner: string,
  repo: string
): Promise<RepoContext> {
  const [info, packageJson, tree, readme] = await Promise.all([
    fetchRepoInfo(owner, repo),
    fetchPackageJson(owner, repo),
    fetchTree(owner, repo),
    fetchReadme(owner, repo),
  ]);
  return { info, packageJson, tree, readme };
}

async function fetchRepoInfo(owner: string, repo: string) {
  const { data } = await octokit.repos.get({ owner, repo });
  return {
    full_name: data.full_name,
    description: data.description,
    stargazers_count: data.stargazers_count,
    forks_count: data.forks_count,
    language: data.language,
    topics: data.topics ?? [],
    html_url: data.html_url,
  };
}

async function fetchPackageJson(
  owner: string,
  repo: string
): Promise<PackageJson | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: "package.json",
    });
    if ("content" in data) {
      return JSON.parse(Buffer.from(data.content, "base64").toString());
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchTree(owner: string, repo: string): Promise<string[]> {
  const { data } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: "HEAD",
    recursive: "1",
  });
  return data.tree
    .map((item) => item.path ?? "")
    .filter(Boolean)
    .slice(0, 200);
}

async function fetchReadme(owner: string, repo: string): Promise<string> {
  try {
    const { data } = await octokit.repos.getReadme({ owner, repo });
    if ("content" in data) {
      return Buffer.from(data.content, "base64").toString().slice(0, 3000);
    }
    return "";
  } catch {
    return "";
  }
}
