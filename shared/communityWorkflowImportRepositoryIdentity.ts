type RepositoryIdentityInput = {
  record?: Record<string, unknown> | null;
  remoteUrl?: string | null;
  host?: string | null;
  fallback?: string;
};

type RepositoryIdentity = {
  remoteUrl: string;
  host: string;
  owner: string | null;
  repo: string | null;
  fullName: string | null;
  displayName: string;
};

function readRecordString(record: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function cleanRepoSegment(value: string): string {
  return value
    .trim()
    .replace(/[#?].*$/, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
}

function normalizeGitHubFullName(value: string): string | null {
  const clean = cleanRepoSegment(value);
  const parts = clean.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[parts.length - 2];
  const repo = parts[parts.length - 1];
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

export function parseCommunityWorkflowImportGitHubFullName(remoteUrl: string): string | null {
  const clean = remoteUrl.trim();
  if (!clean) return null;
  const sshMatch = clean.match(/^(?:ssh:\/\/)?git@github\.com[:/]([^/\s]+)\/(.+?)(?:\.git)?(?:[#?].*)?$/i);
  if (sshMatch?.[1] && sshMatch[2]) {
    return normalizeGitHubFullName(`${sshMatch[1]}/${sshMatch[2]}`);
  }
  try {
    const parsed = new URL(clean.replace(/^git\+/, ""));
    if (parsed.hostname.toLowerCase() !== "github.com") return null;
    return normalizeGitHubFullName(parsed.pathname);
  } catch {
    return null;
  }
}

export function buildCommunityWorkflowImportRepositoryIdentity(input: RepositoryIdentityInput): RepositoryIdentity {
  const record = input.record ?? null;
  const remoteUrl = (input.remoteUrl ?? "").trim() || readRecordString(record, ["remoteUrl", "remote_url", "url"]);
  const host = (input.host ?? "").trim().toLowerCase() || readRecordString(record, ["host"]).toLowerCase() || (remoteUrl.includes("github.com") ? "github" : "unknown");
  const explicitFullName = normalizeGitHubFullName(readRecordString(record, ["fullName", "full_name", "repoFullName", "repo_full_name", "repositoryFullName", "repository_full_name"]));
  const owner = readRecordString(record, ["owner", "repoOwner", "repo_owner", "repositoryOwner", "repository_owner", "org", "organization"]);
  const repo = readRecordString(record, ["repo", "repoName", "repo_name", "repositoryName", "repository_name"]);
  const ownerRepoFullName = owner && repo ? normalizeGitHubFullName(`${owner}/${repo}`) : null;
  const parsedFullName = parseCommunityWorkflowImportGitHubFullName(remoteUrl);
  const fullName = explicitFullName ?? ownerRepoFullName ?? parsedFullName;
  return {
    remoteUrl,
    host,
    owner: fullName?.split("/")[0] ?? (owner || null),
    repo: fullName?.split("/")[1] ?? (repo || null),
    fullName,
    displayName: fullName ?? (host === "github" ? "GitHub repository" : (input.fallback ?? "Repository")),
  };
}
