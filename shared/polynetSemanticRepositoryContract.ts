import { validateProfileHandle } from "./profileHandle.ts";
import { parseCommunityResourceDirectoryUri } from "./communityResourceDirectory.ts";
import { parseCommunityResourceEvidenceRef } from "./communityEvidenceContract.ts";

export const POLYNET_PLATFORM_ROOT_PATH = "/";
export const POLYNET_COMMUNITIES_DIRECTORY_PATH = "/communities/";
export const POLYNET_USERS_DIRECTORY_PATH = "/users/";
export const POLYNET_SELF_USER_DIRECTORY_PATH = "/users/me/";

export function isRetiredAiFeedSemanticPath(localPath: string): boolean {
  return localPath === "/ai-feed/" || localPath.startsWith("/ai-feed/");
}

export type PolynetSemanticMount =
  | { kind: "platform" }
  | {
      kind: "community";
      communityId?: string | null;
      communitySlug?: string | null;
    };

export function selectRuntimePolynetSemanticMount(args: {
  path: unknown;
  communityId?: string | null;
  evidenceSurface?: string | null;
}): PolynetSemanticMount {
  const path = String(args.path ?? "");
  const stableResourceSelector = Boolean(
    parseCommunityResourceEvidenceRef(path) ||
      parseCommunityResourceDirectoryUri(path),
  );
  const canonicalPlatformSelector =
    path === POLYNET_PLATFORM_ROOT_PATH ||
    path.startsWith(POLYNET_COMMUNITIES_DIRECTORY_PATH) ||
    path.startsWith(POLYNET_USERS_DIRECTORY_PATH) ||
    stableResourceSelector;
  const communityMounted =
    args.evidenceSurface === "community_concierge" ||
    (!canonicalPlatformSelector && Boolean(args.communityId));
  return communityMounted
    ? {
        kind: "community",
        communityId: args.communityId ?? null,
      }
    : { kind: "platform" };
}

export type PolynetSemanticRepositoryEntry = {
  path: string;
  kind: "directory" | "document";
  type:
    | "communities"
    | "users"
    | "community"
    | "community_profile"
    | "user"
    | "user_profile"
    | "members"
    | "member"
    | "resources"
    | "resource"
    | "channels"
    | "channel"
    | "events"
    | "event"
    | "memory"
    | "capabilities"
    | "builder";
  name?: string;
  ref?: string;
  role?: "owner" | "admin" | "moderator" | "member";
};

export type PolynetSemanticDirectoryResult = {
  path: string;
  entries: PolynetSemanticRepositoryEntry[];
  next_cursor: string | null;
  truncated: boolean;
  skipped_incomplete: number;
};

type RepositoryPathError = {
  ok: false;
  code: "invalid_selector" | "semantic_not_found";
  message: string;
};

export type ParsedPolynetSemanticRepositoryPath =
  | { ok: true; kind: "platform_root"; path: "/" }
  | { ok: true; kind: "communities_root"; path: "/communities/" }
  | {
      ok: true;
      kind: "community";
      path: string;
      communitySlug: string;
      localPath: string;
    }
  | { ok: true; kind: "users_root"; path: "/users/" }
  | {
      ok: true;
      kind: "user_root";
      path: string;
      userSelector: "me" | string;
    }
  | {
      ok: true;
      kind: "user_profile";
      path: string;
      userSelector: "me" | string;
    };

function repositoryPathError(
  code: RepositoryPathError["code"],
  message: string,
): RepositoryPathError {
  return { ok: false, code, message };
}

function canonicalCommunitySlug(raw: string): string | null {
  return /^[a-z0-9-]{3,64}$/.test(raw) ? raw : null;
}

function canonicalUserSelector(raw: string): "me" | string | null {
  if (raw === "me") return "me";
  const validated = validateProfileHandle(raw);
  return validated.ok && validated.normalizedHandle === raw
    ? validated.normalizedHandle
    : null;
}

export function parsePolynetSemanticRepositoryPath(
  raw: unknown,
): ParsedPolynetSemanticRepositoryPath | RepositoryPathError {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 1_024) {
    return repositoryPathError(
      "invalid_selector",
      "path must be an absolute semantic repository path.",
    );
  }
  if (
    raw.includes("\\") ||
    raw.includes("%") ||
    raw.includes("//") ||
    /[\u0000-\u001f\u007f]/.test(raw) ||
    raw.split("/").some((part) => part === "." || part === "..")
  ) {
    return repositoryPathError(
      "invalid_selector",
      "path must be canonical and traversal-free.",
    );
  }
  if (raw === POLYNET_PLATFORM_ROOT_PATH) {
    return { ok: true, kind: "platform_root", path: raw };
  }
  if (raw === POLYNET_COMMUNITIES_DIRECTORY_PATH) {
    return { ok: true, kind: "communities_root", path: raw };
  }
  if (raw === POLYNET_USERS_DIRECTORY_PATH) {
    return { ok: true, kind: "users_root", path: raw };
  }

  const userMatch = /^\/users\/([^/]+)\/(profile\.md)?$/.exec(raw);
  if (userMatch) {
    const userSelector = canonicalUserSelector(userMatch[1]);
    if (!userSelector) {
      return repositoryPathError(
        "semantic_not_found",
        "Semantic path not found or not accessible.",
      );
    }
    if (userMatch[2]) {
      return {
        ok: true,
        kind: "user_profile",
        path: raw,
        userSelector,
      };
    }
    return {
      ok: true,
      kind: "user_root",
      path: raw,
      userSelector,
    };
  }

  const communityMatch = /^\/communities\/([^/]+)(\/.*)$/.exec(raw);
  if (communityMatch) {
    const communitySlug = canonicalCommunitySlug(communityMatch[1]);
    if (!communitySlug) {
      return repositoryPathError(
        "semantic_not_found",
        "Semantic path not found or not accessible.",
      );
    }
    const suffix = communityMatch[2];
    const localPath = suffix === "/" ? "/" : suffix;
    return {
      ok: true,
      kind: "community",
      path: raw,
      communitySlug,
      localPath,
    };
  }
  return repositoryPathError(
    "semantic_not_found",
    "Semantic path not found or not accessible.",
  );
}

export function buildPolynetPlatformRootDirectory(): PolynetSemanticDirectoryResult {
  return {
    path: POLYNET_PLATFORM_ROOT_PATH,
    entries: [
      {
        path: POLYNET_COMMUNITIES_DIRECTORY_PATH,
        kind: "directory",
        type: "communities",
        name: "Communities",
      },
      {
        path: POLYNET_USERS_DIRECTORY_PATH,
        kind: "directory",
        type: "users",
        name: "Users",
      },
    ],
    next_cursor: null,
    truncated: false,
    skipped_incomplete: 0,
  };
}

export function buildPolynetUsersRootDirectory(): PolynetSemanticDirectoryResult {
  return {
    path: POLYNET_USERS_DIRECTORY_PATH,
    entries: [
      {
        path: POLYNET_SELF_USER_DIRECTORY_PATH,
        kind: "directory",
        type: "user",
        name: "Me",
      },
    ],
    next_cursor: null,
    truncated: false,
    skipped_incomplete: 0,
  };
}

export function buildPolynetUserDirectory(args: {
  path: string;
  profilePath: string;
  ref?: string | null;
  name?: string | null;
}): PolynetSemanticDirectoryResult {
  return {
    path: args.path,
    entries: [
      {
        path: args.profilePath,
        kind: "document",
        type: "user_profile",
        ...(args.ref ? { ref: args.ref } : null),
        ...(args.name ? { name: args.name } : null),
      },
    ],
    next_cursor: null,
    truncated: false,
    skipped_incomplete: 0,
  };
}

export function buildPolynetCommunitiesDirectory(args: {
  communities: Array<{
    slug: string;
    name: string;
    relation: string;
  }>;
  nextCursor?: string | null;
  skippedIncomplete?: number;
}): PolynetSemanticDirectoryResult {
  const nextCursor =
    typeof args.nextCursor === "string" && args.nextCursor
      ? args.nextCursor
      : null;
  return {
    path: POLYNET_COMMUNITIES_DIRECTORY_PATH,
    entries: args.communities.map((community) => ({
      path: `${POLYNET_COMMUNITIES_DIRECTORY_PATH}${community.slug}/`,
      kind: "directory" as const,
      type: "community" as const,
      name: community.name,
      ...(community.relation === "owner" ||
      community.relation === "admin" ||
      community.relation === "moderator" ||
      community.relation === "member"
        ? { role: community.relation }
        : null),
    })),
    next_cursor: nextCursor,
    truncated: Boolean(nextCursor),
    skipped_incomplete: Math.max(
      0,
      Math.min(1_000, Math.floor(args.skippedIncomplete ?? 0)),
    ),
  };
}

function communityMountedPath(
  communitySlug: string,
  localPath: unknown,
): string {
  const path = String(localPath ?? "");
  if (path === "/")
    return `${POLYNET_COMMUNITIES_DIRECTORY_PATH}${communitySlug}/`;
  if (!path.startsWith("/")) return path;
  return `${POLYNET_COMMUNITIES_DIRECTORY_PATH}${communitySlug}${path}`;
}

function inferMountedEntryType(path: string, kind: "directory" | "document") {
  if (path.endsWith("/members/")) return "members" as const;
  if (path.includes("/members/")) return "member" as const;
  if (path.endsWith("/resources/")) return "resources" as const;
  if (path.includes("/resources/")) {
    return kind === "directory"
      ? ("resources" as const)
      : ("resource" as const);
  }
  if (path.endsWith("/channels/")) return "channels" as const;
  if (path.includes("/channels/")) return "channel" as const;
  if (path.endsWith("/events/")) return "events" as const;
  if (path.includes("/events/")) return "event" as const;
  if (path.includes("/memory/")) return "memory" as const;
  if (path.includes("/capabilities/")) return "capabilities" as const;
  if (path.includes("/builder/")) return "builder" as const;
  if (path.endsWith("/community.md")) return "community_profile" as const;
  return kind === "directory"
    ? ("community" as const)
    : ("community_profile" as const);
}

export function mountCommunitySemanticResult(args: {
  communitySlug: string;
  result: Record<string, unknown>;
}): Record<string, unknown> {
  const path = communityMountedPath(args.communitySlug, args.result.path);
  const rawEntries = Array.isArray(args.result.entries)
    ? args.result.entries
    : null;
  if (!rawEntries) {
    return {
      ...args.result,
      path,
    };
  }
  const entries = rawEntries
    .filter((entry) => {
      const entryPath =
        entry && typeof entry === "object"
          ? String((entry as Record<string, unknown>).path ?? "")
          : "";
      return entryPath !== "/self.md";
    })
    .map((entry) => {
      const record = entry as Record<string, unknown>;
      const kind = record.kind === "directory" ? "directory" : "document";
      const mountedPath = communityMountedPath(args.communitySlug, record.path);
      return {
        ...record,
        path: mountedPath,
        type: inferMountedEntryType(mountedPath, kind),
      };
    });
  return {
    ...args.result,
    path,
    entries,
  };
}
