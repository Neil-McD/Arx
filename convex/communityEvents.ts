import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  normalizeName,
  normalizeOptionalText,
  normalizeOptionalUrl,
  parseIsoMs,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

type CommunityEventLike = {
  _id: any;
  communityId: any;
  createdByUserId: any;
  title: string;
  descriptionMd?: string;
  startsAt: number;
  endsAt?: number;
  timezone: string;
  locationType: "online" | "physical" | "tbd";
  locationLabel?: string;
  url?: string;
  visibility: "members" | "public";
  status: "live" | "cancelled";
  createdAt: number;
  updatedAt: number;
};

function normalizeTimezone(raw: unknown): string {
  const value = String(raw ?? "").trim();
  return value || "UTC";
}

function normalizeLocationType(raw: unknown): "online" | "physical" | "tbd" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "online" || value === "physical") return value;
  return "tbd";
}

function normalizeVisibility(raw: unknown): "members" | "public" {
  return String(raw ?? "").trim().toLowerCase() === "public" ? "public" : "members";
}

function normalizeStatus(raw: unknown): "live" | "cancelled" {
  return String(raw ?? "").trim().toLowerCase() === "cancelled" ? "cancelled" : "live";
}

function requireIsoMs(raw: unknown, code: string): number {
  const parsed = parseIsoMs(raw);
  if (parsed === null) throw new Error(code);
  return parsed;
}

function parseOptionalIsoMs(raw: unknown, code: string): number | null {
  if (raw === null || typeof raw === "undefined") return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const parsed = parseIsoMs(raw);
  if (parsed === null) throw new Error(code);
  return parsed;
}

function mapCommunityEventRow(row: CommunityEventLike) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    title: row.title,
    description_md: row.descriptionMd ?? null,
    starts_at: toIsoString(row.startsAt),
    ends_at: typeof row.endsAt === "number" ? toIsoString(row.endsAt) : null,
    timezone: row.timezone,
    location_type: row.locationType,
    location_label: row.locationLabel ?? null,
    url: row.url ?? null,
    visibility: row.visibility,
    status: row.status,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export const listCommunityEvents = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    startIso: v.optional(v.union(v.string(), v.null())),
    endIso: v.optional(v.union(v.string(), v.null())),
    includeCancelled: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });

    const startMs = parseIsoMs(args.startIso) ?? 0;
    const endMs = parseIsoMs(args.endIso) ?? Number.MAX_SAFE_INTEGER;
    const limit = Math.max(1, Math.min(1000, Math.floor(args.limit ?? 200)));
    const includeCancelled = Boolean(args.includeCancelled);

    const rows = (await ctx.db
      .query("communityEvents" as any)
      .withIndex("by_community_startsAt", (q: any) =>
        q.eq("communityId", args.communityId).gte("startsAt", startMs).lte("startsAt", endMs),
      )
      .collect()) as CommunityEventLike[];

    return rows
      .filter((row) => includeCancelled || row.status !== "cancelled")
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, limit)
      .map(mapCommunityEventRow);
  },
});

export const saveCommunityEvent = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    eventId: v.optional(v.union(v.string(), v.null())),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const eventId = String(args.eventId ?? "").trim();
    const nowMs = Date.now();

    if (eventId) {
      const existing = (await ctx.db.get(eventId as any)) as CommunityEventLike | null;
      if (!existing) throw new Error("community_event_not_found");
      await requireCommunityManager({
        ctx,
        communityId: existing.communityId,
        userId,
      });
      const title = normalizeName(
        Object.prototype.hasOwnProperty.call(payload, "title") ? payload.title : existing.title,
      );
      const startsAt = Object.prototype.hasOwnProperty.call(payload, "starts_at")
        ? requireIsoMs(payload.starts_at, "community_event_starts_at_invalid")
        : existing.startsAt;
      const endsAt = Object.prototype.hasOwnProperty.call(payload, "ends_at")
        ? parseOptionalIsoMs(payload.ends_at, "community_event_ends_at_invalid")
        : existing.endsAt;
      if (typeof endsAt === "number" && endsAt <= startsAt) {
        throw new Error("community_event_ends_at_invalid");
      }
      await ctx.db.patch(existing._id as any, {
        title,
        descriptionMd: normalizeOptionalText(
          Object.prototype.hasOwnProperty.call(payload, "description_md")
            ? payload.description_md
            : existing.descriptionMd,
          10_000,
        ),
        startsAt,
        endsAt: endsAt ?? undefined,
        timezone: normalizeTimezone(
          Object.prototype.hasOwnProperty.call(payload, "timezone") ? payload.timezone : existing.timezone,
        ),
        locationType: normalizeLocationType(
          Object.prototype.hasOwnProperty.call(payload, "location_type")
            ? payload.location_type
            : existing.locationType,
        ),
        locationLabel: normalizeOptionalText(
          Object.prototype.hasOwnProperty.call(payload, "location_label")
            ? payload.location_label
            : existing.locationLabel,
          500,
        ),
        url: normalizeOptionalUrl(
          Object.prototype.hasOwnProperty.call(payload, "url") ? payload.url : existing.url,
        ),
        visibility: normalizeVisibility(
          Object.prototype.hasOwnProperty.call(payload, "visibility") ? payload.visibility : existing.visibility,
        ),
        status: normalizeStatus(
          Object.prototype.hasOwnProperty.call(payload, "status") ? payload.status : existing.status,
        ),
        updatedAt: nowMs,
      });
      const updated = (await ctx.db.get(existing._id as any)) as CommunityEventLike | null;
      if (!updated) throw new Error("community_event_not_found");
      return mapCommunityEventRow(updated);
    }

    const communityId = payload.community_id as any;
    if (!communityId) throw new Error("community_id_required");
    const { community } = await requireCommunityManager({
      ctx,
      communityId,
      userId,
    });
    const title = normalizeName(payload.title);
    const startsAt = requireIsoMs(payload.starts_at, "community_event_starts_at_invalid");
    const endsAt = parseOptionalIsoMs(payload.ends_at, "community_event_ends_at_invalid");
    if (typeof endsAt === "number" && endsAt <= startsAt) {
      throw new Error("community_event_ends_at_invalid");
    }

    const id = await ctx.db.insert("communityEvents" as any, {
      communityId: community._id,
      createdByUserId: userId,
      title,
      descriptionMd: normalizeOptionalText(payload.description_md, 10_000),
      startsAt,
      endsAt: endsAt ?? undefined,
      timezone: normalizeTimezone(payload.timezone),
      locationType: normalizeLocationType(payload.location_type),
      locationLabel: normalizeOptionalText(payload.location_label, 500),
      url: normalizeOptionalUrl(payload.url),
      visibility: normalizeVisibility(payload.visibility),
      status: "live",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityEventLike | null;
    if (!created) throw new Error("community_event_create_failed");
    return mapCommunityEventRow(created);
  },
});

export const cancelCommunityEvent = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const event = (await ctx.db.get(args.eventId as any)) as CommunityEventLike | null;
    if (!event) return { ok: true };
    await requireCommunityManager({
      ctx,
      communityId: event.communityId,
      userId,
    });
    await ctx.db.patch(event._id as any, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
