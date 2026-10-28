import { type StoredInteractionActorType } from "../shared/communityAgentIdentity";
import { normalizeIdValue } from "./communityCore";
import { getCommunityChannelCapabilities, requireCommunityChannelCapability, type ChannelActor, type ChannelCapabilities } from "./communityChannelAccess";

export const GENERAL_CHANNEL_SYSTEM_ROLE = "general" as const;
export const GENERAL_CHANNEL_SLUG = "general" as const;
export const GENERAL_CHANNEL_NAME = "General" as const;
import { MAX_SHARED_COMMUNITY_CHANNELS, MAX_PRIVATE_COMMUNITY_CHANNELS } from "../shared/communityChannelCapacity";
export const LEGACY_CHANNEL_LIST_LIMIT = 10;
const CHANNEL_SLUG_COLLISION_ATTEMPTS = 12;
export const MAX_COMMUNITY_CHANNEL_NAME_CHARS = 48;

export type CommunityChannelLike = {
  _id: any;
  communityId: any;
  systemRole?: "general";
  slug: string;
  name: string;
  normalizedName?: string;
  accessMode: "all_members" | "restricted";
  postingPolicy: "members" | "managers";
  replyPolicy?: "members" | "managers" | "disabled";
  status: "active" | "archived";
  position: number;
  pinnedRootId?: any;
  createdByUserId?: any;
  createdAt: number;
  updatedAt: number;
};

export type ChannelAddressableInteractionLike = {
  _id: any;
  communityId: any;
  channelId?: any;
  visibilityScope: "private" | "admin" | "community" | "public";
};

type GeneralChannelReadableRow = {
  _id: any;
  communityId: any;
  channelId?: any;
  rootId?: any;
  visibilityScope: "private" | "admin" | "community" | "public";
  status: "live" | "hidden" | "deleted";
  kind?: string;
  createdAt: number;
};

export function normalizeCommunityChannelName(raw: unknown): string {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("community_channel_name_required");
  if (name.length > MAX_COMMUNITY_CHANNEL_NAME_CHARS) {
    throw new Error("community_channel_name_too_long");
  }
  return name;
}

function channelSlugBase(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_COMMUNITY_CHANNEL_NAME_CHARS)
    .replace(/-+$/g, "");
  return slug || "channel";
}

function channelHasCanonicalCustomContract(
  channel: CommunityChannelLike,
): boolean {
  let normalizedName: string;
  try {
    normalizedName = normalizeCommunityChannelName(channel.name);
  } catch {
    return false;
  }
  return (
    channel.systemRole === undefined &&
    channel.slug !== GENERAL_CHANNEL_SLUG &&
    /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(channel.slug) &&
    normalizedName === channel.name &&
    Number.isFinite(channel.position) &&
    channel.position > 0
  );
}

function assertChannelForCommunity(
  channel: CommunityChannelLike,
  communityId: any,
): void {
  if (
    normalizeIdValue(channel.communityId) !== normalizeIdValue(communityId) ||
    !["all_members", "restricted"].includes(channel.accessMode) ||
    !["members", "managers"].includes(channel.postingPolicy) ||
    !["members", "managers", "disabled"].includes(channel.replyPolicy ?? "members")
  ) {
    throw new Error("community_channel_invalid");
  }
  if (channel.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE) {
    assertGeneralChannelForCommunity(channel, communityId);
  } else if (!channelHasCanonicalCustomContract(channel)) {
    throw new Error("community_channel_invalid");
  }
}

export function interactionIsChannelAddressable(
  row: Pick<ChannelAddressableInteractionLike, "visibilityScope">,
): boolean {
  return row.visibilityScope === "community" || row.visibilityScope === "public";
}

export function channelHasCanonicalGeneralSystemContract(
  channel: CommunityChannelLike,
  communityId: any,
): boolean {
  return (
    normalizeIdValue(channel.communityId) === normalizeIdValue(communityId) &&
    channel.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE &&
    channel.slug === GENERAL_CHANNEL_SLUG &&
    channel.accessMode === "all_members" &&
    channel.postingPolicy === "members" &&
    (channel.replyPolicy ?? "members") === "members" &&
    channel.status === "active" &&
    channel.position === 0
  );
}

export async function getGeneralChannel(
  ctx: { db: any },
  communityId: any,
): Promise<CommunityChannelLike | null> {
  const channels = (await ctx.db
    .query("communityChannels" as any)
    .withIndex("by_community_systemRole", (q: any) =>
      q
        .eq("communityId", communityId)
        .eq("systemRole", GENERAL_CHANNEL_SYSTEM_ROLE),
    )
    .take(2)) as CommunityChannelLike[];
  if (channels.length > 1) {
    throw new Error("community_general_channel_duplicate");
  }
  const channel = channels[0] ?? null;
  if (channel) assertGeneralChannelForCommunity(channel, communityId);
  return channel;
}

function assertGeneralChannelForCommunity(
  channel: CommunityChannelLike,
  communityId: any,
): void {
  if (!channelHasCanonicalGeneralSystemContract(channel, communityId)) {
    throw new Error("community_general_channel_invalid");
  }
}

export async function ensureGeneralChannel(args: {
  ctx: { db: any };
  communityId: any;
  nowMs?: number;
}): Promise<CommunityChannelLike> {
  const community = await args.ctx.db.get(args.communityId);
  if (!community) throw new Error("community_not_found");

  const existing = await getGeneralChannel(args.ctx, args.communityId);
  if (existing) {
    const normalizedName = normalizeCommunityChannelName(existing.name).toLocaleLowerCase("en-US");
    if (existing.normalizedName !== normalizedName) {
      await args.ctx.db.patch(existing._id, { normalizedName });
      return { ...existing, normalizedName };
    }
    return existing;
  }

  const slugCollision = (await args.ctx.db
    .query("communityChannels" as any)
    .withIndex("by_community_slug", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("slug", GENERAL_CHANNEL_SLUG),
    )
    .first()) as CommunityChannelLike | null;
  if (slugCollision) {
    throw new Error("community_general_channel_slug_conflict");
  }

  await requireCommunityChannelCapacity({ ...args, accessMode: "all_members", forGeneral: true });

  const nowMs = args.nowMs ?? Date.now();
  const channelId = await args.ctx.db.insert("communityChannels" as any, {
    communityId: args.communityId,
    systemRole: GENERAL_CHANNEL_SYSTEM_ROLE,
    slug: GENERAL_CHANNEL_SLUG,
    name: GENERAL_CHANNEL_NAME,
    normalizedName: GENERAL_CHANNEL_NAME.toLocaleLowerCase("en-US"),
    accessMode: "all_members",
    postingPolicy: "members",
    status: "active",
    position: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const created = (await args.ctx.db.get(channelId)) as CommunityChannelLike | null;
  if (!created) throw new Error("community_general_channel_create_failed");
  assertGeneralChannelForCommunity(created, args.communityId);
  return created;
}

export async function requireCommunityChannelLineage(args: {
  ctx: { db: any };
  communityId: any;
  channelId: any;
}): Promise<CommunityChannelLike> {
  const channel = (await args.ctx.db.get(
    args.channelId,
  )) as CommunityChannelLike | null;
  if (!channel) throw new Error("community_channel_not_found");
  assertChannelForCommunity(channel, args.communityId);
  if (channel.status !== "active" && channel.status !== "archived") {
    throw new Error("community_channel_invalid");
  }
  return channel;
}

export async function requireActiveCommunityChannel(args: {
  ctx: { db: any };
  communityId: any;
  channelId: any;
}): Promise<CommunityChannelLike> {
  const channel = await requireCommunityChannelLineage(args);
  if (channel.status !== "active") {
    throw new Error("community_channel_inactive");
  }
  return channel;
}

export function legacyGeneralChannelSelection(
  communityId: any,
): CommunityChannelLike {
  return {
    // A semantic General selection lets read-only queries preserve the
    // rolling-deployment lane before a stored General row has been backfilled.
    // Mutations must request ensureGeneralForWrite and receive a durable id.
    _id: undefined,
    communityId,
    systemRole: GENERAL_CHANNEL_SYSTEM_ROLE,
    slug: GENERAL_CHANNEL_SLUG,
    name: GENERAL_CHANNEL_NAME,
    accessMode: "all_members",
    postingPolicy: "members",
    status: "active",
    position: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

// Callers must authorize community access before resolving a requested
// channel. That ordering prevents a cross-community channel id from becoming
// an enumeration oracle. Omission is the only compatibility path to General.
export async function resolveRequestedCommunityChannel(args: {
  ctx: { db: any };
  communityId: any;
  channelId?: any | null;
  ensureGeneralForWrite?: boolean;
  nowMs?: number;
}): Promise<CommunityChannelLike> {
  if (normalizeIdValue(args.channelId)) {
    try {
      const channel = await requireActiveCommunityChannel({
        ctx: args.ctx,
        communityId: args.communityId,
        channelId: args.channelId,
      });
      // Unscoped background callers never gain private-room access.
      if (channel.accessMode !== "all_members") throw new Error("community_channel_unavailable");
      return channel;
    } catch {
      // Public callers receive one unavailable outcome for absent, archived,
      // malformed, and cross-community ids so channel resolution is not an
      // enumeration oracle.
      throw new Error("community_channel_unavailable");
    }
  }
  if (args.ensureGeneralForWrite) {
    return await ensureGeneralChannel({
      ctx: args.ctx,
      communityId: args.communityId,
      nowMs: args.nowMs,
    });
  }
  return (
    (await getGeneralChannel(args.ctx, args.communityId)) ??
    legacyGeneralChannelSelection(args.communityId)
  );
}

// Interactive entry points must use an authenticated actor. Unscoped helpers
// remain shared-only for community-wide background consumers.
export async function resolveAuthorizedCommunityChannel(args: {
  ctx: any;
  communityId: any;
  channelId?: any | null;
  channelSlug?: string | null;
  ensureGeneralForWrite?: boolean;
  nowMs?: number;
  actor: ChannelActor;
  capability: keyof ChannelCapabilities;
}): Promise<CommunityChannelLike> {
  let channel: CommunityChannelLike;
  try {
    const slug = String(args.channelSlug ?? "").trim();
    if (args.channelId) channel = await requireCommunityChannelLineage({ ...args, channelId: args.channelId });
    else if (slug) {
      const matches = await args.ctx.db.query("communityChannels").withIndex("by_community_slug", (q: any) =>
        q.eq("communityId", args.communityId).eq("slug", slug)).take(2);
      if (matches.length > 1) throw new Error("community_channel_unavailable");
      if (!matches.length && slug === GENERAL_CHANNEL_SLUG) channel = await resolveRequestedCommunityChannel(args);
      else if (matches.length === 1) channel = await requireCommunityChannelLineage({ ...args, channelId: matches[0]._id });
      else throw new Error("community_channel_unavailable");
    } else channel = await resolveRequestedCommunityChannel(args);
    if (slug && channel.slug !== slug) throw new Error("community_channel_unavailable");
  } catch {
    throw new Error("community_channel_unavailable");
  }
  await requireCommunityChannelCapability({ ...args, channel });
  return channel;
}

export async function listActiveCommunityChannels(args: {
  ctx: { db: any };
  communityId: any;
}): Promise<CommunityChannelLike[]> {
  const channels = (await args.ctx.db
    .query("communityChannels" as any)
    .withIndex("by_community_status_position", (q: any) =>
      q.eq("communityId", args.communityId).eq("status", "active"),
    )
    .take(LEGACY_CHANNEL_LIST_LIMIT + 1)) as CommunityChannelLike[];
  if (channels.length > LEGACY_CHANNEL_LIST_LIMIT) {
    throw new Error("community_channel_refresh_required");
  }
  for (const channel of channels) {
    assertChannelForCommunity(channel, args.communityId);
  }
  return channels.sort((left, right) => {
    if (left.position !== right.position) return left.position - right.position;
    return normalizeIdValue(left._id).localeCompare(normalizeIdValue(right._id));
  });
}

// The canonical bounded directory read. Authorization is evaluated on every
// page; a member's private scan starts from their grants, not other clients.
export async function listAuthorizedCommunityChannelPage(args: {
  ctx: any; communityId: any; actor: ChannelActor;
  section: "shared" | "private";
  paginationOpts: { cursor: string | null; numItems: number };
}): Promise<{ page: CommunityChannelLike[]; isDone: boolean; continueCursor: string }> {
  if (args.actor.kind === "community_agent" && args.section === "private") {
    return { page: [], isDone: true, continueCursor: "" };
  }
  const { ctx, communityId, actor, section } = args;
  const opts = { ...args.paginationOpts, numItems: Math.min(50, Math.max(1, args.paginationOpts.numItems)) };
  const byGrant = section === "private" && !actor.isManager;
  const result = byGrant
    ? await ctx.db.query("communityChannelParticipants").withIndex("by_community_principal_status", (q: any) =>
      q.eq("communityId", communityId).eq("principalKey", actor.principalKey).eq("status", "active")).paginate(opts)
    : await ctx.db.query("communityChannels").withIndex("by_community_access_status_position", (q: any) =>
      q.eq("communityId", communityId).eq("accessMode", section === "shared" ? "all_members" : "restricted")
        .eq("status", "active")).paginate(opts);
  const candidates = byGrant
    ? await Promise.all(result.page.map((row: any) => ctx.db.get(row.channelId))) : result.page;
  const page: CommunityChannelLike[] = [];
  for (const channel of candidates) {
    if (!channel || normalizeIdValue(channel.communityId) !== normalizeIdValue(communityId) || channel.status !== "active"
      || channel.accessMode !== (section === "shared" ? "all_members" : "restricted")) continue;
    assertChannelForCommunity(channel, communityId);
    if ((await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead) page.push(channel);
  }
  if (section === "shared" && args.paginationOpts.cursor === null && !await getGeneralChannel(ctx, communityId)) {
    const general = legacyGeneralChannelSelection(communityId);
    if ((await getCommunityChannelCapabilities({ ctx, channel: general, actor })).canRead) page.unshift(general);
  }
  return { ...result, page };
}

export async function listAuthorizedCommunityChannels(args: {
  ctx: any; communityId: any; actor: ChannelActor;
}): Promise<CommunityChannelLike[]> {
  const general = await getGeneralChannel(args.ctx, args.communityId);
  const rows = await listActiveCommunityChannels(args);
  if (!general) {
    if (rows.length >= LEGACY_CHANNEL_LIST_LIMIT) throw new Error("community_channel_refresh_required");
    rows.unshift(legacyGeneralChannelSelection(args.communityId));
  }
  const visible = await Promise.all(rows.map(async channel =>
    (await getCommunityChannelCapabilities({ ...args, channel })).canRead ? channel : null));
  return visible.filter((row): row is CommunityChannelLike => row !== null);
}

export async function listSharedCommunityChannels(args: {
  ctx: { db: any };
  communityId: any;
}): Promise<CommunityChannelLike[]> {
  // getGeneralChannel detects duplicate system rows even if both happen to be
  // otherwise canonical.
  const generalChannel = await getGeneralChannel(args.ctx, args.communityId);
  // Audience filtering happens in the index BEFORE the bounded read. Private
  // room volume must neither occupy this window nor break shared projections.
  const activeChannels = await args.ctx.db.query("communityChannels")
    .withIndex("by_community_access_status_position", (q: any) =>
      q.eq("communityId", args.communityId).eq("accessMode", "all_members").eq("status", "active"))
    .take(MAX_SHARED_COMMUNITY_CHANNELS + 1) as CommunityChannelLike[];
  if (activeChannels.length > MAX_SHARED_COMMUNITY_CHANNELS) throw new Error("community_channel_limit_invalid");
  for (const channel of activeChannels) assertChannelForCommunity(channel, args.communityId);
  activeChannels.sort((left, right) =>
    left.position - right.position || normalizeIdValue(left._id).localeCompare(normalizeIdValue(right._id)),
  );
  if (generalChannel) return activeChannels;
  if (activeChannels.length >= MAX_SHARED_COMMUNITY_CHANNELS) {
    // A missing General row still consumes the required system-channel slot.
    // Refuse to project an eleventh readable channel from drifted storage.
    throw new Error("community_channel_limit_invalid");
  }
  return [legacyGeneralChannelSelection(args.communityId), ...activeChannels];
}

export function requireSharedChannelForAddressableRow(args: {
  row: ChannelAddressableInteractionLike;
  communityId: any;
  channels: CommunityChannelLike[];
}): CommunityChannelLike {
  const channel = requireChannelFromAuthorizedSet(args);
  if (channel.accessMode !== "all_members") throw new Error("interaction_channel_invalid");
  return channel;
}

// This set must come from listAuthorizedCommunityChannels or an authorized
// exact-room lookup. Community-wide consumers use the shared wrapper above.
export function requireChannelFromAuthorizedSet(args: {
  row: ChannelAddressableInteractionLike; communityId: any; channels: CommunityChannelLike[];
}): CommunityChannelLike {
  if (
    !interactionIsChannelAddressable(args.row) ||
    normalizeIdValue(args.row.communityId) !== normalizeIdValue(args.communityId)
  ) {
    throw new Error("interaction_channel_invalid");
  }
  const requestedChannelId = normalizeIdValue(args.row.channelId);
  const channel = requestedChannelId
    ? args.channels.find(
        (candidate) => normalizeIdValue(candidate._id) === requestedChannelId,
      )
    : args.channels.find(
        (candidate) => candidate.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE,
      );
  if (!channel) throw new Error("interaction_channel_invalid");
  assertChannelForCommunity(channel, args.communityId);
  if (channel.status !== "active") {
    throw new Error("interaction_channel_inactive");
  }
  return channel;
}

// Direct evidence lookup checks only the source room, not the full directory.
// The missing-channel lane is strictly the existing General migration adapter.
export async function requireSharedChannelForInteraction(args: {
  ctx: { db: any };
  communityId: any;
  row: ChannelAddressableInteractionLike;
}): Promise<CommunityChannelLike> {
  const channel = args.row.channelId
    ? await args.ctx.db.get(args.row.channelId)
    : (await getGeneralChannel(args.ctx, args.communityId)) ?? legacyGeneralChannelSelection(args.communityId);
  return requireSharedChannelForAddressableRow({
    row: args.row, communityId: args.communityId, channels: channel ? [channel] : [],
  });
}

async function resolveAvailableChannelSlug(args: {
  ctx: { db: any };
  communityId: any;
  name: string;
  nowMs: number;
}): Promise<string> {
  const base = channelSlugBase(args.name);
  const timestampToken = Math.max(0, Math.floor(args.nowMs)).toString(36);
  const suffixes = [
    ...Array.from(
      { length: CHANNEL_SLUG_COLLISION_ATTEMPTS },
      (_, index) => index === 0 ? "" : `-${index + 1}`,
    ),
    ...Array.from(
      { length: CHANNEL_SLUG_COLLISION_ATTEMPTS },
      (_, index) => `-${timestampToken}${index === 0 ? "" : `-${index + 1}`}`,
    ),
  ];
  for (const suffixText of suffixes) {
    const candidate = `${base.slice(0, 64 - suffixText.length).replace(/-+$/g, "")}${suffixText}`;
    const collision = await args.ctx.db
      .query("communityChannels" as any)
      .withIndex("by_community_slug", (q: any) =>
        q.eq("communityId", args.communityId).eq("slug", candidate),
      )
      .first();
    if (!collision) return candidate;
  }
  throw new Error("community_channel_slug_unavailable");
}

/** Allocate a readable generated label in the same transaction as channel creation. */
export async function resolveGeneratedCommunityChannelName(args: {
  ctx: { db: any }; communityId: any; name: string;
}): Promise<string> {
  await ensureGeneralChannel(args);
  const base = normalizeCommunityChannelName(args.name.slice(0, MAX_COMMUNITY_CHANNEL_NAME_CHARS));
  // There cannot be more occupied names than the combined active-channel capacity.
  for (let index = 0; index <= MAX_SHARED_COMMUNITY_CHANNELS + MAX_PRIVATE_COMMUNITY_CHANNELS; index++) {
    const suffix = index === 0 ? "" : ` (${index + 1})`;
    const candidate = `${base.slice(0, MAX_COMMUNITY_CHANNEL_NAME_CHARS - suffix.length).trimEnd()}${suffix}`;
    try {
      await requireAvailableChannelName({ ...args, name: candidate });
      return candidate;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "community_channel_name_taken") throw error;
    }
  }
  throw new Error("community_channel_name_unavailable");
}

async function requireAvailableChannelName(args: {
  ctx: { db: any }; communityId: any; name: string; excludeId?: any;
}): Promise<string> {
  // Old rows must be backfilled before writes; never silently miss a collision.
  const missing = await args.ctx.db.query("communityChannels").withIndex(
    "by_community_status_normalizedName",
    (q: any) => q.eq("communityId", args.communityId).eq("status", "active").eq("normalizedName", undefined),
  ).first();
  if (missing) throw new Error("community_channel_name_migration_required");
  const normalizedName = args.name.toLocaleLowerCase("en-US");
  const matches = await args.ctx.db.query("communityChannels").withIndex(
    "by_community_status_normalizedName",
    (q: any) => q.eq("communityId", args.communityId).eq("status", "active").eq("normalizedName", normalizedName),
  ).take(2);
  if (matches.some((row: any) => normalizeIdValue(row._id) !== normalizeIdValue(args.excludeId))) {
    throw new Error("community_channel_name_taken");
  }
  return normalizedName;
}

export async function requireCommunityChannelCapacity(args: {
  ctx: { db: any }; communityId: any; accessMode: "all_members" | "restricted";
  forGeneral?: boolean;
}): Promise<void> {
  const limit = args.accessMode === "all_members" ? MAX_SHARED_COMMUNITY_CHANNELS : MAX_PRIVATE_COMMUNITY_CHANNELS;
  const rows = await args.ctx.db.query("communityChannels").withIndex(
    "by_community_access_status_position",
    (q: any) => q.eq("communityId", args.communityId).eq("accessMode", args.accessMode).eq("status", "active"),
  ).take(limit);
  const reservedGeneral = args.accessMode === "all_members" && !args.forGeneral
    && !rows.some((row: CommunityChannelLike) => row.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE) ? 1 : 0;
  if (rows.length + reservedGeneral >= limit) throw new Error(args.accessMode === "all_members"
    ? "community_shared_channel_limit_reached" : "community_private_channel_limit_reached");
}

export async function createActiveCommunityChannel(args: {
  ctx: { db: any };
  communityId: any;
  createdByUserId: any;
  name: unknown;
  accessMode?: "all_members" | "restricted";
  nowMs?: number;
}): Promise<CommunityChannelLike> {
  const name = normalizeCommunityChannelName(args.name);
  await ensureGeneralChannel({
    ctx: args.ctx,
    communityId: args.communityId,
    nowMs: args.nowMs,
  });
  await requireCommunityChannelCapacity({ ...args, accessMode: args.accessMode ?? "all_members" });
  const normalizedName = await requireAvailableChannelName({ ...args, name });
  const nowMs = args.nowMs ?? Date.now();
  const slug = await resolveAvailableChannelSlug({
    ctx: args.ctx,
    communityId: args.communityId,
    name,
    nowMs,
  });
  const last = await args.ctx.db.query("communityChannels").withIndex(
    "by_community_status_position",
    (q: any) => q.eq("communityId", args.communityId).eq("status", "active"),
  ).order("desc").first();
  const position = (last?.position ?? 0) + 1;
  if (!Number.isFinite(position) || position <= (last?.position ?? 0)) {
    throw new Error("community_channel_order_space_exhausted");
  }
  const channelId = await args.ctx.db.insert("communityChannels" as any, {
    communityId: args.communityId,
    slug,
    name,
    normalizedName,
    accessMode: args.accessMode ?? "all_members",
    postingPolicy: "members",
    status: "active",
    position,
    createdByUserId: args.createdByUserId,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return await requireActiveCommunityChannel({
    ctx: args.ctx,
    communityId: args.communityId,
    channelId,
  });
}

async function requireCustomCommunityChannelLineage(args: {
  ctx: { db: any };
  communityId: any;
  channelId: any;
}): Promise<CommunityChannelLike> {
  let channel: CommunityChannelLike;
  try {
    channel = await requireCommunityChannelLineage(args);
  } catch {
    throw new Error("community_channel_unavailable");
  }
  if (channel.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE) {
    throw new Error("community_general_channel_immutable");
  }
  return channel;
}

async function requireMutableCommunityChannel(args: {
  ctx: { db: any };
  communityId: any;
  channelId: any;
}): Promise<CommunityChannelLike> {
  const channel = await requireCustomCommunityChannelLineage(args);
  if (channel.status !== "active") {
    throw new Error("community_channel_unavailable");
  }
  return channel;
}

export async function renameActiveCommunityChannel(args: {
  ctx: { db: any };
  communityId: any;
  channelId: any;
  name: unknown;
  nowMs?: number;
}): Promise<CommunityChannelLike> {
  const channel = await requireMutableCommunityChannel(args);
  const name = normalizeCommunityChannelName(args.name);
  const normalizedName = await requireAvailableChannelName({ ...args, name, excludeId: channel._id });
  if (channel.name === name && channel.normalizedName === normalizedName) return channel;
  await args.ctx.db.patch(channel._id, {
    name,
    normalizedName,
    updatedAt: args.nowMs ?? Date.now(),
  });
  return await requireActiveCommunityChannel({
    ctx: args.ctx,
    communityId: args.communityId,
    channelId: channel._id,
  });
}

export async function moveActiveCommunityChannel(args: {
  ctx: { db: any };
  communityId: any;
  channelId: any;
  afterChannelId: any | null;
  beforeChannelId: any | null;
  expectedPosition: number;
  nowMs?: number;
}): Promise<CommunityChannelLike> {
  const channel = await requireMutableCommunityChannel(args);
  if (channel.position !== args.expectedPosition) throw new Error("community_channel_order_stale");
  const ids = [args.channelId, args.afterChannelId, args.beforeChannelId].filter(Boolean).map(normalizeIdValue);
  if (new Set(ids).size !== ids.length) throw new Error("community_channel_order_duplicate_id");
  const after = args.afterChannelId ? await requireMutableCommunityChannel({ ...args, channelId: args.afterChannelId }) : null;
  const before = args.beforeChannelId ? await requireMutableCommunityChannel({ ...args, channelId: args.beforeChannelId }) : null;
  const lower = after?.position ?? 0;
  // Validate adjacency against current storage, excluding the moving row. This
  // indexed range also participates in Convex's serializable conflict checks.
  const next = await args.ctx.db.query("communityChannels").withIndex(
    "by_community_status_position",
    (q: any) => q.eq("communityId", args.communityId).eq("status", "active").gt("position", lower),
  ).take(2);
  const neighbor = next.find((row: any) => normalizeIdValue(row._id) !== normalizeIdValue(channel._id));
  if (normalizeIdValue(neighbor?._id) !== normalizeIdValue(before?._id) || (before && before.position <= lower)) {
    throw new Error("community_channel_order_stale");
  }
  const position = before ? lower + (before.position - lower) / 2 : lower + 1;
  if (!Number.isFinite(position) || position <= lower || (before && position >= before.position)) {
    throw new Error("community_channel_order_space_exhausted");
  }
  await args.ctx.db.patch(channel._id, { position, updatedAt: args.nowMs ?? Date.now() });
  return { ...channel, position, updatedAt: args.nowMs ?? Date.now() };
}

type PinnableCommunityInteractionRoot = ChannelAddressableInteractionLike & {
  status: "live" | "hidden" | "deleted";
  actorType: StoredInteractionActorType;
};

async function insertChannelPinModerationEvent(args: {
  ctx: { db: any };
  communityId: any;
  rootId: any;
  eventType: "pin" | "unpin";
  actorUserId?: any;
  reason?: string;
  nowMs: number;
}): Promise<void> {
  await args.ctx.db.insert("communityInteractionModerationEvents" as any, {
    communityId: args.communityId,
    targetType: "root",
    rootId: args.rootId,
    eventType: args.eventType,
    actorType: args.actorUserId ? "human" : "system",
    ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
    ...(args.reason ? { reason: args.reason } : {}),
    createdAt: args.nowMs,
  });
}

export async function setActiveCommunityChannelPinnedRoot(args: {
  ctx: { db: any };
  communityId: any;
  channelId?: any;
  rootId: any | null;
  actorUserId: any;
  actor?: ChannelActor;
  nowMs?: number;
}): Promise<CommunityChannelLike> {
  const nowMs = args.nowMs ?? Date.now();
  const selection = {
    ctx: args.ctx,
    communityId: args.communityId,
    channelId: args.channelId,
    ensureGeneralForWrite: true,
    nowMs,
  };
  const channel = args.actor ? await resolveAuthorizedCommunityChannel({ ...selection, actor: args.actor, capability: "canManage" })
    : await resolveRequestedCommunityChannel(selection);
  const nextRootId = args.rootId ? normalizeIdValue(args.rootId) : "";
  const previousRootId = normalizeIdValue(channel.pinnedRootId);
  if (nextRootId === previousRootId) return channel;

  if (args.rootId) {
    const root = (await args.ctx.db.get(args.rootId)) as PinnableCommunityInteractionRoot | null;
    if (
      !root ||
      root.status !== "live" ||
      root.actorType === "system" ||
      !interactionIsChannelAddressable(root) ||
      normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId) ||
      !interactionBelongsToChannel(root, channel)
    ) {
      throw new Error("community_channel_pin_target_invalid");
    }
  }

  await args.ctx.db.patch(channel._id, {
    pinnedRootId: args.rootId ?? undefined,
    updatedAt: nowMs,
  });
  if (previousRootId) {
    await insertChannelPinModerationEvent({
      ctx: args.ctx,
      communityId: args.communityId,
      rootId: channel.pinnedRootId,
      eventType: "unpin",
      actorUserId: args.actorUserId,
      nowMs,
    });
  }
  if (args.rootId) {
    await insertChannelPinModerationEvent({
      ctx: args.ctx,
      communityId: args.communityId,
      rootId: args.rootId,
      eventType: "pin",
      actorUserId: args.actorUserId,
      nowMs,
    });
  }
  return {
    ...channel,
    pinnedRootId: args.rootId ?? undefined,
    updatedAt: nowMs,
  };
}

export async function clearPinnedRootIfMatches(args: {
  ctx: { db: any };
  root: ChannelAddressableInteractionLike;
  actorUserId?: any;
  reason: string;
  nowMs: number;
}): Promise<void> {
  const channel = args.root.channelId
    ? ((await args.ctx.db.get(args.root.channelId)) as CommunityChannelLike | null)
    : await getGeneralChannel(args.ctx, args.root.communityId);
  if (
    !channel ||
    normalizeIdValue(channel.communityId) !== normalizeIdValue(args.root.communityId) ||
    normalizeIdValue(channel.pinnedRootId) !== normalizeIdValue(args.root._id)
  ) {
    return;
  }
  await args.ctx.db.patch(channel._id, {
    pinnedRootId: undefined,
    updatedAt: args.nowMs,
  });
  await insertChannelPinModerationEvent({
    ctx: args.ctx,
    communityId: args.root.communityId,
    rootId: args.root._id,
    eventType: "unpin",
    actorUserId: args.actorUserId,
    reason: args.reason,
    nowMs: args.nowMs,
  });
}

export async function archiveActiveCommunityChannel(args: {
  ctx: { db: any };
  communityId: any;
  channelId: any;
  actorUserId?: any;
  nowMs?: number;
}): Promise<CommunityChannelLike> {
  const channel = await requireCustomCommunityChannelLineage(args);
  if (channel.status === "archived") return channel;
  const updatedAt = args.nowMs ?? Date.now();
  await args.ctx.db.patch(channel._id, {
    status: "archived",
    pinnedRootId: undefined,
    updatedAt,
  });
  if (channel.pinnedRootId) {
    await insertChannelPinModerationEvent({
      ctx: args.ctx,
      communityId: args.communityId,
      rootId: channel.pinnedRootId,
      eventType: "unpin",
      actorUserId: args.actorUserId,
      reason: "channel_archived",
      nowMs: updatedAt,
    });
  }
  return {
    ...channel,
    status: "archived",
    pinnedRootId: undefined,
    updatedAt,
  };
}

export async function requireChannelForAddressableRoot(args: {
  ctx: { db: any };
  root: ChannelAddressableInteractionLike;
  nowMs?: number;
  actor?: ChannelActor;
  capability?: keyof ChannelCapabilities;
}): Promise<CommunityChannelLike> {
  if (!interactionIsChannelAddressable(args.root)) {
    throw new Error("interaction_not_channel_addressable");
  }

  if (args.root.channelId) {
    const channel = (await args.ctx.db.get(
      args.root.channelId,
    )) as CommunityChannelLike | null;
    if (
      !channel ||
      normalizeIdValue(channel.communityId) !==
        normalizeIdValue(args.root.communityId) ||
      channel.status !== "active"
    ) {
      throw new Error("interaction_channel_invalid");
    }
    if (channel.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE) {
      assertGeneralChannelForCommunity(channel, args.root.communityId);
    }
    assertChannelForCommunity(channel, args.root.communityId);
    if (channel.accessMode === "restricted") {
      if (!args.actor) throw new Error("community_channel_unavailable");
      await requireCommunityChannelCapability({ ctx: args.ctx, channel, actor: args.actor, capability: args.capability ?? "canRead" });
    }
    return channel;
  }

  const channel = await ensureGeneralChannel({
    ctx: args.ctx,
    communityId: args.root.communityId,
    nowMs: args.nowMs,
  });
  await args.ctx.db.patch(args.root._id, { channelId: channel._id });
  args.root.channelId = channel._id;
  return channel;
}

export async function ensureReplyChannelMatchesRoot(args: {
  ctx: { db: any };
  root: ChannelAddressableInteractionLike;
  reply: { _id: any; communityId: any; rootId: any; channelId?: any };
  nowMs?: number;
  actor?: ChannelActor;
}): Promise<CommunityChannelLike> {
  if (
    normalizeIdValue(args.reply.communityId) !==
      normalizeIdValue(args.root.communityId) ||
    normalizeIdValue(args.reply.rootId) !== normalizeIdValue(args.root._id)
  ) {
    throw new Error("interaction_reply_root_mismatch");
  }
  const channel = await requireChannelForAddressableRoot({
    ctx: args.ctx,
    root: args.root,
    nowMs: args.nowMs,
    actor: args.actor,
  });
  if (
    args.reply.channelId &&
    normalizeIdValue(args.reply.channelId) !== normalizeIdValue(channel._id)
  ) {
    throw new Error("interaction_reply_channel_mismatch");
  }
  if (!args.reply.channelId) {
    await args.ctx.db.patch(args.reply._id, { channelId: channel._id });
    args.reply.channelId = channel._id;
  }
  return channel;
}

// Rolling-compatibility predicate. A missing channel is interpreted as
// General only until the bounded backfill reaches zero drift.
export function interactionBelongsToGeneralChannel(
  row: { channelId?: any },
  generalChannel: CommunityChannelLike | null,
): boolean {
  const rowChannelId = normalizeIdValue(row.channelId);
  if (!rowChannelId) return true;
  return Boolean(
    generalChannel &&
      rowChannelId === normalizeIdValue(generalChannel._id),
  );
}

export function interactionBelongsToChannel(
  row: { channelId?: any },
  channel: CommunityChannelLike,
): boolean {
  const rowChannelId = normalizeIdValue(row.channelId);
  if (!rowChannelId) {
    return channel.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE;
  }
  return rowChannelId === normalizeIdValue(channel._id);
}

export async function listChannelProjectionRows(args: {
  ctx: { db: any };
  tableName: "communityReadCursors" | "communityTypingPresence";
  communityId: any;
  channel: CommunityChannelLike;
  userId: any;
  streamKind?: "chat";
}): Promise<any[]> {
  assertChannelForCommunity(args.channel, args.communityId);
  if (args.channel.accessMode !== "all_members") throw new Error("community_channel_unavailable");
  if (args.channel.status !== "active") {
    throw new Error("community_channel_inactive");
  }
  if (args.tableName === "communityReadCursors" && args.streamKind !== "chat") {
    throw new Error("community_channel_projection_stream_required");
  }
  const channelIds = args.channel.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE
    ? [undefined, args.channel._id]
    : [args.channel._id];
  const batches = await Promise.all(
    channelIds.map(async (channelId) => {
      if (args.tableName === "communityReadCursors") {
        return await args.ctx.db
          .query("communityReadCursors" as any)
          .withIndex("by_community_channel_user_stream", (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("channelId", channelId)
              .eq("userId", args.userId)
              .eq("streamKind", args.streamKind),
          )
          .take(2);
      }
      return await args.ctx.db
        .query("communityTypingPresence" as any)
        .withIndex("by_community_channel_user", (q: any) =>
          q
            .eq("communityId", args.communityId)
            .eq("channelId", channelId)
            .eq("userId", args.userId),
        )
        .take(2);
    }),
  );
  return Array.from(
    new Map(
      batches
        .flat()
        .map((row: any) => [normalizeIdValue(row._id), row]),
    ).values(),
  );
}

// A cursor or typing lease is one semantic projection per user and General
// lane. Inspect both the rolling legacy lane and the canonical lane before any
// mutation so duplicate legacy rows cannot be upgraded by choosing a winner.
export async function listGeneralChannelProjectionRows(args: {
  ctx: { db: any };
  tableName: "communityReadCursors" | "communityTypingPresence";
  communityId: any;
  generalChannelId: any | null;
  userId: any;
  streamKind?: "chat";
}): Promise<any[]> {
  if (args.tableName === "communityReadCursors" && args.streamKind !== "chat") {
    throw new Error("community_channel_projection_stream_required");
  }
  const channelIds = args.generalChannelId
    ? [undefined, args.generalChannelId]
    : [undefined];
  const batches = await Promise.all(
    channelIds.map(async (channelId) => {
      if (args.tableName === "communityReadCursors") {
        return await args.ctx.db
          .query("communityReadCursors" as any)
          .withIndex("by_community_channel_user_stream", (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("channelId", channelId)
              .eq("userId", args.userId)
              .eq("streamKind", args.streamKind),
          )
          .take(2);
      }
      return await args.ctx.db
        .query("communityTypingPresence" as any)
        .withIndex("by_community_channel_user", (q: any) =>
          q
            .eq("communityId", args.communityId)
            .eq("channelId", channelId)
            .eq("userId", args.userId),
        )
        .take(2);
    }),
  );
  return Array.from(
    new Map(
      batches
        .flat()
        .map((row: any) => [normalizeIdValue(row._id), row]),
    ).values(),
  );
}

async function listReadableRowsForChannelIds<T extends GeneralChannelReadableRow>(args: {
  ctx: { db: any };
  tableName: "communityInteractionRoots" | "communityInteractionReplies";
  communityId: any;
  channelIds: any[];
  belongsToChannel: (row: T) => boolean;
  limit: number;
  beforeCreatedAt?: number | null;
  kind?: string | null;
}): Promise<T[]> {
  if (args.kind && args.tableName !== "communityInteractionRoots") {
    throw new Error("interaction_channel_kind_table_invalid");
  }
  const requestedLimit = Number(args.limit);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(200, Math.floor(requestedLimit))
      : 1;
  const visibilities = ["community", "public"] as const;
  const batches = await Promise.all(
    args.channelIds.flatMap((channelId) =>
      visibilities.map(async (visibilityScope) => {
        const indexName = args.kind
          ? "by_community_channel_kind_visibility_status_createdAt"
          : "by_community_channel_visibility_status_createdAt";
        return (await args.ctx.db
          .query(args.tableName as any)
          .withIndex(indexName, (q: any) => {
            let cursor = q
              .eq("communityId", args.communityId)
              .eq("channelId", channelId);
            if (args.kind) cursor = cursor.eq("kind", args.kind);
            cursor = cursor
              .eq("visibilityScope", visibilityScope)
              .eq("status", "live");
            return args.beforeCreatedAt == null
              ? cursor
              : cursor.lt("createdAt", args.beforeCreatedAt);
          })
          .order("desc")
          .take(limit)) as T[];
      }),
    ),
  );
  return Array.from(
    new Map(
      batches
        .flat()
        .filter(args.belongsToChannel)
        .map((row) => [normalizeIdValue(row._id), row]),
    ).values(),
  )
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit);
}

// Exact indexed visibility lanes prevent unrelated channels or private dock
// activity from starving the selected public/member-visible channel window.
// Only General admits the temporary unchanneled compatibility lane.
export async function listChannelReadableRows<
  T extends GeneralChannelReadableRow,
>(args: {
  ctx: { db: any };
  tableName: "communityInteractionRoots" | "communityInteractionReplies";
  communityId: any;
  channel: CommunityChannelLike;
  limit: number;
  beforeCreatedAt?: number | null;
  kind?: string | null;
  actor?: ChannelActor;
}): Promise<T[]> {
  assertChannelForCommunity(args.channel, args.communityId);
  if (args.channel.accessMode === "restricted") {
    if (!args.actor) throw new Error("community_channel_unavailable");
    await requireCommunityChannelCapability({ ctx: args.ctx, channel: args.channel, actor: args.actor, capability: "canRead" });
  }
  if (args.channel.status !== "active") {
    throw new Error("community_channel_inactive");
  }
  return await listReadableRowsForChannelIds<T>({
    ...args,
    channelIds: Array.from(
      new Set(
        args.channel.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE
          ? [args.channel._id, undefined]
          : [args.channel._id],
      ),
    ),
    belongsToChannel: (row) => interactionBelongsToChannel(row, args.channel),
  });
}

// Community-intelligence projections deliberately aggregate every active,
// all-member channel. The ten-shared-channel cap bounds this fanout while the
// selected-channel path above remains exact and independently pageable.
export async function listSharedChannelReadableRows<
  T extends GeneralChannelReadableRow,
>(args: {
  ctx: { db: any };
  tableName: "communityInteractionRoots" | "communityInteractionReplies";
  communityId: any;
  limit: number;
  beforeCreatedAt?: number | null;
  kind?: string | null;
}): Promise<T[]> {
  const requestedLimit = Number(args.limit);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(200, Math.floor(requestedLimit))
      : 1;
  const channels = await listSharedCommunityChannels({
    ctx: args.ctx,
    communityId: args.communityId,
  });
  const batches = await Promise.all(
    channels.map((channel) =>
      listChannelReadableRows<T>({
        ctx: args.ctx,
        tableName: args.tableName,
        communityId: args.communityId,
        channel,
        limit,
        beforeCreatedAt: args.beforeCreatedAt,
        kind: args.kind,
      }),
    ),
  );
  const rows = Array.from(
    new Map(
      batches
        .flat()
        .map((row) => [normalizeIdValue(row._id), row]),
    ).values(),
  )
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit);
  if (args.tableName === "communityInteractionRoots") return rows;
  const roots = new Map<string, GeneralChannelReadableRow | null>(await Promise.all(
    Array.from(new Set(rows.map((row) => normalizeIdValue(row.rootId)))).map(async (rootId) =>
      [rootId, rootId ? await args.ctx.db.get(rootId) : null] as const),
  ));
  return rows.filter((row) => {
    const root = roots.get(normalizeIdValue(row.rootId));
    if (!root || root.status !== "live") return false;
    try {
      const channel = requireSharedChannelForAddressableRow({ row: root, communityId: args.communityId, channels });
      return interactionBelongsToChannel(row, channel);
    } catch {
      return false;
    }
  });
}

// Rolling-deployment adapter for existing General-only call paths. New
// selected-channel reads should use listChannelReadableRows.
export async function listGeneralChannelReadableRows<
  T extends GeneralChannelReadableRow,
>(args: {
  ctx: { db: any };
  tableName: "communityInteractionRoots" | "communityInteractionReplies";
  communityId: any;
  generalChannel: CommunityChannelLike | null;
  limit: number;
  beforeCreatedAt?: number | null;
  kind?: string | null;
}): Promise<T[]> {
  if (args.generalChannel) {
    return await listChannelReadableRows<T>({
      ctx: args.ctx,
      tableName: args.tableName,
      communityId: args.communityId,
      channel: args.generalChannel,
      limit: args.limit,
      beforeCreatedAt: args.beforeCreatedAt,
      kind: args.kind,
    });
  }
  return await listReadableRowsForChannelIds<T>({
    ctx: args.ctx,
    tableName: args.tableName,
    communityId: args.communityId,
    channelIds: [undefined],
    belongsToChannel: (row) => interactionBelongsToGeneralChannel(row, null),
    limit: args.limit,
    beforeCreatedAt: args.beforeCreatedAt,
    kind: args.kind,
  });
}
