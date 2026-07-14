export type CommunityResourceVisibilityRow = {
  moduleId?: unknown;
  role?: unknown;
  title?: unknown;
  bodyMd?: unknown;
  bodyChars?: unknown;
  url?: unknown;
  fileKey?: unknown;
};

export type CommunityResourceModuleVisibilityRow = {
  status?: unknown;
};

function normalizedModuleStatus(raw: unknown): "draft" | "live" {
  const status = String(raw ?? "").trim().toLowerCase();
  if (!status) return "live";
  return status === "live" ? "live" : "draft";
}

function resourceBodyChars(row: CommunityResourceVisibilityRow): number {
  const legacyBody = String(row.bodyMd ?? "").trim();
  if (legacyBody) return legacyBody.length;
  const chars = Number(row.bodyChars ?? 0);
  return Number.isFinite(chars) && chars > 0 ? Math.floor(chars) : 0;
}

/** Canonical member evidence visibility for a resource module. */
export function communityResourceModuleIsMemberLive(
  row: CommunityResourceModuleVisibilityRow,
): boolean {
  return normalizedModuleStatus(row.status) === "live";
}

/**
 * Canonical member evidence visibility for a resource row. Page lifecycle
 * status is intentionally not consulted: publication is owned by the module.
 */
export function communityResourceIsMemberVisiblePage(
  row: CommunityResourceVisibilityRow,
  liveModuleIds: Set<string>,
): boolean {
  const moduleId = String(row.moduleId ?? "").trim();
  const role = String(row.role ?? "").trim().toLowerCase();
  const title = String(row.title ?? "").trim();
  const hasContent = Boolean(
    resourceBodyChars(row) > 0 ||
      String(row.url ?? "").trim() ||
      String(row.fileKey ?? "").trim(),
  );
  return Boolean(
    moduleId &&
      liveModuleIds.has(moduleId) &&
      role !== "source" &&
      title &&
      hasContent
  );
}
