import { clampCoverFocus, clampCoverZoom } from "./coverFrameUi";

export type CommunityVisualAsset = {
  resource_key: string | null;
  url: string | null;
  focus_x: number;
  focus_y: number;
  zoom: number;
};

export type CommunityVisualIdentity = {
  community_id: string;
  revision: number;
  name: string;
  avatar: CommunityVisualAsset;
  banner: CommunityVisualAsset;
};

export type CommunityVisualIdentityFields = {
  id?: unknown;
  community_id?: unknown;
  name?: unknown;
  updated_at?: unknown;
  branding_revision?: unknown;
  avatar_url?: unknown;
  avatar_storage_id?: unknown;
  avatar_focus_x?: unknown;
  avatar_focus_y?: unknown;
  avatar_zoom?: unknown;
  banner_url?: unknown;
  banner_storage_id?: unknown;
  banner_focus_x?: unknown;
  banner_focus_y?: unknown;
  banner_zoom?: unknown;
  visual_identity?: unknown;
};

function normalizedText(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value || null;
}

export function normalizeCommunityVisualIdentityRevision(
  raw: unknown,
  fallbackUpdatedAt?: unknown,
): number {
  const direct = Math.floor(Number(raw));
  if (Number.isFinite(direct) && direct >= 0) return direct;
  const fallbackNumber = Math.floor(Number(fallbackUpdatedAt));
  if (Number.isFinite(fallbackNumber) && fallbackNumber >= 0) return fallbackNumber;
  const parsed = Date.parse(String(fallbackUpdatedAt ?? ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function resourceKey(storageId: unknown, url: unknown): string | null {
  const storage = normalizedText(storageId);
  if (storage) return `storage:${storage}`;
  const normalizedUrl = normalizedText(url);
  return normalizedUrl ? `url:${normalizedUrl}` : null;
}

function buildAsset(args: {
  resourceKey?: unknown;
  storageId?: unknown;
  url?: unknown;
  focusX?: unknown;
  focusY?: unknown;
  zoom?: unknown;
}): CommunityVisualAsset {
  return {
    resource_key: normalizedText(args.resourceKey) ?? resourceKey(args.storageId, args.url),
    url: normalizedText(args.url),
    focus_x: clampCoverFocus(args.focusX),
    focus_y: clampCoverFocus(args.focusY),
    zoom: clampCoverZoom(args.zoom),
  };
}

export function buildCommunityVisualIdentityFromFields(
  fields: CommunityVisualIdentityFields,
): CommunityVisualIdentity | null {
  const communityId = normalizedText(fields.community_id) ?? normalizedText(fields.id);
  const name = normalizedText(fields.name);
  if (!communityId || !name) return null;
  return {
    community_id: communityId,
    revision: normalizeCommunityVisualIdentityRevision(
      fields.branding_revision,
      fields.updated_at,
    ),
    name,
    avatar: buildAsset({
      storageId: fields.avatar_storage_id,
      url: fields.avatar_url,
      focusX: fields.avatar_focus_x,
      focusY: fields.avatar_focus_y,
      zoom: fields.avatar_zoom,
    }),
    banner: buildAsset({
      storageId: fields.banner_storage_id,
      url: fields.banner_url,
      focusX: fields.banner_focus_x,
      focusY: fields.banner_focus_y,
      zoom: fields.banner_zoom,
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function coerceCommunityVisualIdentity(
  raw: unknown,
  fallback?: CommunityVisualIdentityFields | null,
): CommunityVisualIdentity | null {
  if (!isRecord(raw)) {
    return fallback ? buildCommunityVisualIdentityFromFields(fallback) : null;
  }
  const communityId = normalizedText(raw.community_id);
  const name = normalizedText(raw.name);
  const avatar = isRecord(raw.avatar) ? raw.avatar : null;
  const banner = isRecord(raw.banner) ? raw.banner : null;
  if (!communityId || !name || !avatar || !banner) {
    return fallback ? buildCommunityVisualIdentityFromFields(fallback) : null;
  }
  return {
    community_id: communityId,
    revision: normalizeCommunityVisualIdentityRevision(raw.revision, fallback?.updated_at),
    name,
    avatar: buildAsset({
      resourceKey: avatar.resource_key,
      url: avatar.url,
      focusX: avatar.focus_x,
      focusY: avatar.focus_y,
      zoom: avatar.zoom,
    }),
    banner: buildAsset({
      resourceKey: banner.resource_key,
      url: banner.url,
      focusX: banner.focus_x,
      focusY: banner.focus_y,
      zoom: banner.zoom,
    }),
  };
}

export function communityVisualIdentitiesEqual(
  left: CommunityVisualIdentity,
  right: CommunityVisualIdentity,
): boolean {
  return left.community_id === right.community_id &&
    left.revision === right.revision &&
    left.name === right.name &&
    left.avatar.resource_key === right.avatar.resource_key &&
    left.avatar.url === right.avatar.url &&
    left.avatar.focus_x === right.avatar.focus_x &&
    left.avatar.focus_y === right.avatar.focus_y &&
    left.avatar.zoom === right.avatar.zoom &&
    left.banner.resource_key === right.banner.resource_key &&
    left.banner.url === right.banner.url &&
    left.banner.focus_x === right.banner.focus_x &&
    left.banner.focus_y === right.banner.focus_y &&
    left.banner.zoom === right.banner.zoom;
}

function communityVisualIdentityFramesEqual(
  left: CommunityVisualIdentity,
  right: CommunityVisualIdentity,
): boolean {
  return left.community_id === right.community_id &&
    left.revision === right.revision &&
    left.name === right.name &&
    left.avatar.resource_key === right.avatar.resource_key &&
    left.avatar.focus_x === right.avatar.focus_x &&
    left.avatar.focus_y === right.avatar.focus_y &&
    left.avatar.zoom === right.avatar.zoom &&
    left.banner.resource_key === right.banner.resource_key &&
    left.banner.focus_x === right.banner.focus_x &&
    left.banner.focus_y === right.banner.focus_y &&
    left.banner.zoom === right.banner.zoom;
}

export function mergeCommunityVisualIdentity(
  current: CommunityVisualIdentity | null | undefined,
  incoming: CommunityVisualIdentity,
): CommunityVisualIdentity {
  if (!current || current.community_id !== incoming.community_id) return incoming;
  if (incoming.revision > current.revision) return incoming;
  if (incoming.revision < current.revision) return current;
  if (communityVisualIdentitiesEqual(current, incoming)) return current;
  return communityVisualIdentityFramesEqual(current, incoming)
    ? incoming
    : current;
}
