export const COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT = "unsorted";
export const COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT = "source-inbox";

type ResourceRoleLike = "page" | "source" | string | null | undefined;

export type ParsedCommunityResourceDirectoryUri = {
  communityId: string;
  moduleId: string;
  sourceInbox: boolean;
  resourceId: string | null;
};

function normalizeResourceDirectoryText(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeCommunityResourcePathSegment(
  raw: unknown,
  fallback = "untitled",
): string {
  const normalized = normalizeResourceDirectoryText(raw)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return normalized || fallback;
}

function encodeResourceDirectoryUriPart(raw: unknown): string {
  return encodeURIComponent(String(raw ?? "").trim() || "unknown");
}

function decodeResourceDirectoryUriPart(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function normalizeResourceRole(raw: ResourceRoleLike): "page" | "source" {
  return String(raw ?? "").trim().toLowerCase() === "source" ? "source" : "page";
}

export function parseCommunityResourceDirectoryUri(
  raw: unknown,
): ParsedCommunityResourceDirectoryUri | null {
  const value = String(raw ?? "").trim();
  const match = value.match(
    /^resources:\/\/community\/([^/]+)\/modules\/([^/]+)(?:\/(source-inbox))?(?:\/resources\/([^/]+))?$/,
  );
  if (!match) return null;
  const communityId = decodeResourceDirectoryUriPart(match[1]);
  const moduleId = decodeResourceDirectoryUriPart(match[2]);
  const resourceId = match[4] ? decodeResourceDirectoryUriPart(match[4]) : null;
  if (!communityId || !moduleId) return null;
  if (match[4] && !resourceId) return null;
  return {
    communityId,
    moduleId,
    sourceInbox: Boolean(match[3]),
    resourceId,
  };
}

export function buildCommunityResourceModuleDirectoryFields(args: {
  communityId: string;
  moduleId: string;
  moduleName: string;
}): {
  directory_uri: string;
  directory_path: string;
} {
  const moduleSegment = normalizeCommunityResourcePathSegment(args.moduleName, "module");
  return {
    directory_uri: `resources://community/${encodeResourceDirectoryUriPart(args.communityId)}/modules/${encodeResourceDirectoryUriPart(args.moduleId)}`,
    directory_path: `/${moduleSegment}`,
  };
}

export function buildCommunityResourceDirectoryFields(args: {
  communityId: string;
  moduleId?: string | null;
  moduleName?: string | null;
  resourceId: string;
  resourceTitle: string;
  resourceRole?: ResourceRoleLike;
}): {
  directory_uri: string;
  directory_path: string;
} {
  const moduleId = String(args.moduleId ?? "").trim();
  const moduleIdSegment = moduleId || COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT;
  const modulePathSegment = moduleId
    ? normalizeCommunityResourcePathSegment(args.moduleName, "module")
    : COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT;
  const resourcePathSegment = normalizeCommunityResourcePathSegment(args.resourceTitle, "resource");
  const isSource = normalizeResourceRole(args.resourceRole) === "source";
  const pathSegments = isSource
    ? [modulePathSegment, COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT, resourcePathSegment]
    : [modulePathSegment, resourcePathSegment];

  return {
    directory_uri: `resources://community/${encodeResourceDirectoryUriPart(args.communityId)}/modules/${encodeResourceDirectoryUriPart(moduleIdSegment)}/resources/${encodeResourceDirectoryUriPart(args.resourceId)}`,
    directory_path: `/${pathSegments.join("/")}`,
  };
}
