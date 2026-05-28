function safeBlaxelResourcePart(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (normalized || "project").slice(0, 40);
}

export function buildBlaxelProjectWorkspaceNames(projectId: unknown): {
  sandboxName: string;
  volumeName: string;
} {
  const resourcePart = safeBlaxelResourcePart(projectId);
  return {
    sandboxName: `pn-p-${resourcePart}`,
    volumeName: `pn-p-${resourcePart}-v`,
  };
}
