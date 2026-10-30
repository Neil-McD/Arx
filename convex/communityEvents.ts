import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_COMMUNITY_EVENT_DURATION_MS } from "../shared/communityEventLifecycle";
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
import { resolveAuthorizedCommunityChannel } from "./communityChannelCore";
import { resolveCommunityChannelActor } from "./communityChannelAccess";
import {
  formatCommunityEventZonedDateTime,
  getCommunityEventOccurrenceStartsInRange,
  isValidCommunityEventTimeZone,
  normalizeCommunityEventRecurrenceFrequency,
  normalizeCommunityEventRecurrenceInterval,
  normalizeCommunityEventTimeZone,
} from "../shared/communityEventTime";

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
  channelId?: any;
  status: "live" | "cancelled";
  recurrenceFrequency?: "none" | "daily" | "weekly" | "monthly";
  recurrenceInterval?: number;
  recurrenceUntil?: number;
  createdAt: number;
  updatedAt: number;
};

const COMMUNITY_EVENT_LIST_STATUSES = ["live", "cancelled"] as const;
const COMMUNITY_EVENT_RECURRING_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
const MAX_EVENT_WINDOW_CANDIDATES_PER_STATUS = 1000;
const MAX_RECURRING_EVENT_CANDIDATES_PER_STATUS_FREQUENCY = 1000;

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

function requireCommunityEventTimeZone(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "UTC";
  if (!isValidCommunityEventTimeZone(value)) {
    throw new Error("community_event_timezone_invalid");
  }
  return value;
}

function mapCommunityEventRow(row: CommunityEventLike, occurrenceStartsAt?: number) {
  const startsAt = occurrenceStartsAt ?? row.startsAt;
  const durationMs = typeof row.endsAt === "number" ? Math.max(0, row.endsAt - row.startsAt) : null;
  const endsAt = durationMs === null ? null : startsAt + durationMs;
  const timeZone = normalizeCommunityEventTimeZone(row.timezone);
  const recurrenceFrequency = normalizeCommunityEventRecurrenceFrequency(row.recurrenceFrequency);
  const parentId = normalizeIdValue(row._id);
  return {
    id: occurrenceStartsAt && occurrenceStartsAt !== row.startsAt ? `${parentId}:${occurrenceStartsAt}` : parentId,
    parent_event_id: parentId,
    community_id: normalizeIdValue(row.communityId),
    title: row.title,
    description_md: row.descriptionMd ?? null,
    starts_at: toIsoString(startsAt),
    ends_at: endsAt === null ? null : toIsoString(endsAt),
    starts_at_zoned: formatCommunityEventZonedDateTime(startsAt, timeZone),
    ends_at_zoned:
      endsAt === null
        ? null
        : formatCommunityEventZonedDateTime(endsAt, timeZone),
    series_starts_at: toIsoString(row.startsAt),
    series_ends_at: typeof row.endsAt === "number" ? toIsoString(row.endsAt) : null,
    timezone: timeZone,
    location_type: row.locationType,
    location_label: row.locationLabel ?? null,
    url: row.url ?? null,
    visibility: row.visibility,
    channel_id: row.channelId ? normalizeIdValue(row.channelId) : null,
    status: row.status,
    recurrence_frequency: recurrenceFrequency,
    recurrence_interval: normalizeCommunityEventRecurrenceInterval(row.recurrenceInterval),
    recurrence_until: typeof row.recurrenceUntil === "number" ? toIsoString(row.recurrenceUntil) : null,
    is_recurring_instance: Boolean(occurrenceStartsAt && occurrenceStartsAt !== row.startsAt),
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function expandCommunityEventRows(params: {
  rows: CommunityEventLike[];
  startMs: number;
  endMs: number;
  includeCancelled: boolean;
  limit: number;
  overlap?: boolean;
}) {
  const expanded: ReturnType<typeof mapCommunityEventRow>[] = [];
  for (const row of params.rows) {
    if (!params.includeCancelled && row.status === "cancelled") continue;
    const frequency = normalizeCommunityEventRecurrenceFrequency(row.recurrenceFrequency);
    const interval = normalizeCommunityEventRecurrenceInterval(row.recurrenceInterval);
    const recurrenceUntil = typeof row.recurrenceUntil === "number" ? row.recurrenceUntil : null;
    const occurrenceStarts = getCommunityEventOccurrenceStartsInRange({
      startsAt: row.startsAt,
      rangeStart: params.overlap
        ? params.startMs - (typeof row.endsAt === "number" ? Math.max(0, row.endsAt - row.startsAt) : DEFAULT_COMMUNITY_EVENT_DURATION_MS) + 1
        : params.startMs,
      rangeEnd: params.overlap ? params.endMs - 1 : params.endMs,
      frequency,
      interval,
      recurrenceUntil,
      timeZone: row.timezone,
      limit: Math.max(1, params.limit - expanded.length + (params.overlap ? 1 : 0)),
    });
    for (const occurrenceStartsAt of occurrenceStarts) {
      expanded.push(mapCommunityEventRow(row, occurrenceStartsAt));
      if (params.overlap && expanded.length > params.limit) {
        throw new Error("Too many events in this range. Select a narrower range.");
      }
      if (!params.overlap && expanded.length >= params.limit) break;
    }
  }
  return expanded
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, params.limit);
}

function listStatusesForEventQuery(includeCancelled: boolean): CommunityEventLike["status"][] {
  return includeCancelled ? [...COMMUNITY_EVENT_LIST_STATUSES] : ["live"];
}

function dedupeCommunityEventRows(rows: CommunityEventLike[]): CommunityEventLike[] {
  const rowsById = new Map<string, CommunityEventLike>();
  for (const row of rows) {
    rowsById.set(normalizeIdValue(row._id), row);
  }
  return [...rowsById.values()];
}

// A pod's call is seen only by people who can open the pod; everyone else's
// list leaves it out. One check per pod per request.
async function eventReadFilter(ctx: any, communityId: any, userId: any) {
  const actor = await resolveCommunityChannelActor({ ctx, communityId, userId });
  const readable = new Map<string, boolean>();
  return async (row: CommunityEventLike) => {
    if (!row.channelId) return true;
    const key = normalizeIdValue(row.channelId);
    if (!readable.has(key)) {
      try {
        await resolveAuthorizedCommunityChannel({ ctx, communityId, channelId: row.channelId, actor, capability: "canRead" });
        readable.set(key, true);
      } catch {
        readable.set(key, false);
      }
    }
    return readable.get(key)!;
  };
}

async function filterReadableEvents(ctx: any, communityId: any, userId: any, rows: CommunityEventLike[], channelId?: any) {
  const canRead = await eventReadFilter(ctx, communityId, userId);
  const kept: CommunityEventLike[] = [];
  for (const row of rows) {
    if (channelId && normalizeIdValue(row.channelId) !== normalizeIdValue(channelId)) continue;
    if (await canRead(row)) kept.push(row);
  }
  return kept;
}

// channel_id on save: a pod (invite-only channel) in this community, or null.
async function resolveEventChannel(ctx: any, communityId: any, raw: unknown) {
  if (raw === null || raw === undefined || raw === "") return null;
  const channelId = ctx.db.normalizeId("communityChannels", String(raw));
  const channel = channelId ? await ctx.db.get(channelId) : null;
  if (!channel || normalizeIdValue(channel.communityId) !== normalizeIdValue(communityId)
    || channel.status !== "active" || channel.accessMode !== "restricted") {
    throw new Error("community_event_channel_invalid");
  }
  return channel._id;
}

async function listCommunityEventExpansionCandidates(params: {
  ctx: any;
  communityId: any;
  startMs: number;
  endMs: number;
  includeCancelled: boolean;
  overlap?: boolean;
}): Promise<CommunityEventLike[]> {
  if (params.startMs > params.endMs) return [];

  const rows: CommunityEventLike[] = [];
  for (const status of listStatusesForEventQuery(params.includeCancelled)) {
    const windowRows = (await params.ctx.db
      .query("communityEvents" as any)
      .withIndex("by_community_status_startsAt", (q: any) =>
        q
          .eq("communityId", params.communityId)
          .eq("status", status)
          .gte("startsAt", params.startMs - (params.overlap ? DEFAULT_COMMUNITY_EVENT_DURATION_MS : 0))
          .lte("startsAt", params.endMs),
      )
      .take(MAX_EVENT_WINDOW_CANDIDATES_PER_STATUS + (params.overlap ? 1 : 0))) as CommunityEventLike[];
    if (params.overlap && windowRows.length > MAX_EVENT_WINDOW_CANDIDATES_PER_STATUS) {
      throw new Error("Too many events in this range. Select a narrower range.");
    }
    rows.push(...windowRows);

    if (params.overlap) {
      const carryOver = await params.ctx.db.query("communityEvents")
        .withIndex("by_community_status_endsAt", (q: any) => q
          .eq("communityId", params.communityId).eq("status", status).gt("endsAt", params.startMs))
        .take(MAX_EVENT_WINDOW_CANDIDATES_PER_STATUS + 1) as CommunityEventLike[];
      if (carryOver.length > MAX_EVENT_WINDOW_CANDIDATES_PER_STATUS) {
        throw new Error("Event coverage exceeds the display limit. Contact the community team.");
      }
      rows.push(...carryOver.filter((row) => row.startsAt < params.startMs));
    }

    for (const frequency of COMMUNITY_EVENT_RECURRING_FREQUENCIES) {
      const recurringRows = (await params.ctx.db
        .query("communityEvents" as any)
        .withIndex("by_community_status_recurrenceFrequency_startsAt", (q: any) =>
          q
            .eq("communityId", params.communityId)
            .eq("status", status)
            .eq("recurrenceFrequency", frequency)
            .lte("startsAt", params.endMs),
        )
        .order("desc")
        .take(MAX_RECURRING_EVENT_CANDIDATES_PER_STATUS_FREQUENCY + (params.overlap ? 1 : 0))) as CommunityEventLike[];
      if (params.overlap && recurringRows.length > MAX_RECURRING_EVENT_CANDIDATES_PER_STATUS_FREQUENCY) {
        throw new Error("Recurring event coverage exceeds the display limit. Contact the community team.");
      }
      rows.push(...recurringRows);
    }
  }

  return dedupeCommunityEventRows(rows);
}

export const listCommunityEventsForSemanticRepositoryInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    cursor: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const requestedLimit = Math.floor(Number(args.limit));
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(2, Math.min(50, requestedLimit))
      : 20;
    const cursorStartMs = args.cursor ? Number(args.cursor) : Date.now();
    if (!Number.isSafeInteger(cursorStartMs) || cursorStartMs < 0) {
      throw new Error("community_event_list_cursor_invalid");
    }
    const rows = await filterReadableEvents(ctx, args.communityId, args.userId, await listCommunityEventExpansionCandidates({
      ctx,
      communityId: args.communityId,
      startMs: cursorStartMs,
      endMs: Number.MAX_SAFE_INTEGER,
      includeCancelled: false,
    }));
    const expanded = expandCommunityEventRows({
      rows,
      startMs: cursorStartMs,
      endMs: Number.MAX_SAFE_INTEGER,
      includeCancelled: false,
      limit: limit + 1,
    });
    const events = expanded.slice(0, limit);
    const hasMore = expanded.length > limit;
    const lastStartsAt = events.length
      ? Date.parse(String(events[events.length - 1]?.starts_at ?? ""))
      : Number.NaN;
    return {
      events,
      truncated: hasMore,
      next_cursor:
        hasMore && Number.isSafeInteger(lastStartsAt)
          ? String(lastStartsAt + 1)
          : null,
    };
  },
});

export const readCommunityEventForSemanticRepositoryInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    eventId: v.string(),
    occurrenceStartsAt: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const eventId = ctx.db.normalizeId("communityEvents", args.eventId);
    const row = eventId
      ? ((await ctx.db.get(eventId)) as CommunityEventLike | null)
      : null;
    if (
      !row ||
      normalizeIdValue(row.communityId) !== normalizeIdValue(args.communityId) ||
      !(await (await eventReadFilter(ctx, args.communityId, args.userId))(row))
    ) {
      throw new Error("community_event_not_found");
    }
    const occurrenceStarts = getCommunityEventOccurrenceStartsInRange({
      startsAt: row.startsAt,
      rangeStart: args.occurrenceStartsAt,
      rangeEnd: args.occurrenceStartsAt,
      frequency: normalizeCommunityEventRecurrenceFrequency(
        row.recurrenceFrequency,
      ),
      interval: normalizeCommunityEventRecurrenceInterval(
        row.recurrenceInterval,
      ),
      recurrenceUntil:
        typeof row.recurrenceUntil === "number" ? row.recurrenceUntil : null,
      timeZone: row.timezone,
      limit: 1,
    });
    if (!occurrenceStarts.includes(args.occurrenceStartsAt)) {
      throw new Error("community_event_occurrence_not_found");
    }
    return mapCommunityEventRow(row, args.occurrenceStartsAt);
  },
});

export const listCommunityEvents = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    startIso: v.optional(v.union(v.string(), v.null())),
    endIso: v.optional(v.union(v.string(), v.null())),
    includeCancelled: v.optional(v.boolean()),
    overlap: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    /** Only this pod's calls. */
    channelId: v.optional(v.id("communityChannels")),
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
    const overlap = args.overlap === true;
    if (overlap && (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs - startMs > 62 * 86400000)) {
      throw new Error("Event display range must be between one instant and 62 days.");
    }

    const rows = await filterReadableEvents(ctx, args.communityId, userId, await listCommunityEventExpansionCandidates({
      ctx,
      communityId: args.communityId,
      startMs,
      endMs,
      includeCancelled,
      overlap,
    }), args.channelId);

    return expandCommunityEventRows({ rows, startMs, endMs, includeCancelled, limit, overlap });
  },
});

export const saveCommunityEvent = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    // Set by an owner's agent, which is mounted on one community: events are
    // created there, and only that community's events can be changed.
    communityId: v.optional(v.id("communities")),
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
      if (!existing || (args.communityId && normalizeIdValue(existing.communityId) !== normalizeIdValue(args.communityId))) {
        throw new Error("community_event_not_found");
      }
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
      const recurrenceFrequency = normalizeCommunityEventRecurrenceFrequency(
        Object.prototype.hasOwnProperty.call(payload, "recurrence_frequency")
          ? payload.recurrence_frequency
          : existing.recurrenceFrequency,
      );
      const recurrenceUntil = Object.prototype.hasOwnProperty.call(payload, "recurrence_until")
        ? parseOptionalIsoMs(payload.recurrence_until, "community_event_recurrence_until_invalid")
        : existing.recurrenceUntil;
      if (typeof endsAt === "number" && endsAt <= startsAt) {
        throw new Error("community_event_ends_at_invalid");
      }
      if (recurrenceFrequency !== "none" && typeof recurrenceUntil === "number" && recurrenceUntil < startsAt) {
        throw new Error("community_event_recurrence_until_invalid");
      }
      const channelId = Object.prototype.hasOwnProperty.call(payload, "channel_id")
        ? await resolveEventChannel(ctx, existing.communityId, payload.channel_id)
        : existing.channelId ?? null;
      await ctx.db.patch(existing._id as any, {
        title,
        channelId: channelId ?? undefined,
        descriptionMd: normalizeOptionalText(
          Object.prototype.hasOwnProperty.call(payload, "description_md")
            ? payload.description_md
            : existing.descriptionMd,
          10_000,
        ),
        startsAt,
        endsAt: endsAt ?? undefined,
        timezone: Object.prototype.hasOwnProperty.call(payload, "timezone")
          ? requireCommunityEventTimeZone(payload.timezone)
          : normalizeCommunityEventTimeZone(existing.timezone),
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
        // A pod's call is never public.
        visibility: channelId ? "members" : normalizeVisibility(
          Object.prototype.hasOwnProperty.call(payload, "visibility") ? payload.visibility : existing.visibility,
        ),
        status: normalizeStatus(
          Object.prototype.hasOwnProperty.call(payload, "status") ? payload.status : existing.status,
        ),
        recurrenceFrequency,
        recurrenceInterval:
          recurrenceFrequency === "none"
            ? 1
            : normalizeCommunityEventRecurrenceInterval(
                Object.prototype.hasOwnProperty.call(payload, "recurrence_interval")
                  ? payload.recurrence_interval
                  : existing.recurrenceInterval,
              ),
        recurrenceUntil: recurrenceFrequency === "none" ? undefined : recurrenceUntil ?? undefined,
        updatedAt: nowMs,
      });
      const updated = (await ctx.db.get(existing._id as any)) as CommunityEventLike | null;
      if (!updated) throw new Error("community_event_not_found");
      return mapCommunityEventRow(updated);
    }

    const communityId = (args.communityId ?? payload.community_id) as any;
    if (!communityId) throw new Error("community_id_required");
    if (args.communityId && payload.community_id && normalizeIdValue(payload.community_id) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_forbidden");
    }
    const { community } = await requireCommunityManager({
      ctx,
      communityId,
      userId,
    });
    const title = normalizeName(payload.title);
    const startsAt = requireIsoMs(payload.starts_at, "community_event_starts_at_invalid");
    const endsAt = parseOptionalIsoMs(payload.ends_at, "community_event_ends_at_invalid");
    const recurrenceFrequency = normalizeCommunityEventRecurrenceFrequency(payload.recurrence_frequency);
    const recurrenceUntil = parseOptionalIsoMs(payload.recurrence_until, "community_event_recurrence_until_invalid");
    if (typeof endsAt === "number" && endsAt <= startsAt) {
      throw new Error("community_event_ends_at_invalid");
    }
    if (recurrenceFrequency !== "none" && typeof recurrenceUntil === "number" && recurrenceUntil < startsAt) {
      throw new Error("community_event_recurrence_until_invalid");
    }

    const channelId = await resolveEventChannel(ctx, community._id, payload.channel_id);
    const id = await ctx.db.insert("communityEvents" as any, {
      communityId: community._id,
      ...(channelId ? { channelId } : {}),
      createdByUserId: userId,
      title,
      descriptionMd: normalizeOptionalText(payload.description_md, 10_000),
      startsAt,
      endsAt: endsAt ?? undefined,
      timezone: requireCommunityEventTimeZone(payload.timezone),
      locationType: normalizeLocationType(payload.location_type),
      locationLabel: normalizeOptionalText(payload.location_label, 500),
      url: normalizeOptionalUrl(payload.url),
      visibility: channelId ? "members" : normalizeVisibility(payload.visibility),
      status: "live",
      recurrenceFrequency,
      recurrenceInterval: recurrenceFrequency === "none" ? 1 : normalizeCommunityEventRecurrenceInterval(payload.recurrence_interval),
      recurrenceUntil: recurrenceFrequency === "none" ? undefined : recurrenceUntil ?? undefined,
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
    communityId: v.optional(v.id("communities")),
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
    if (args.communityId && normalizeIdValue(event.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_event_not_found");
    }
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
