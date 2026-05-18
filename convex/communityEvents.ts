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

function normalizeRecurrenceFrequency(raw: unknown): "none" | "daily" | "weekly" | "monthly" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "daily" || value === "weekly" || value === "monthly") return value;
  return "none";
}

function normalizeRecurrenceInterval(raw: unknown): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 1;
  return Math.max(1, Math.min(12, value));
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

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addMonthsClamped(date: Date, monthCount: number, preferredDayOfMonth: number): Date {
  const next = new Date(date);
  const targetMonth = date.getMonth() + monthCount;
  next.setDate(1);
  next.setMonth(targetMonth);
  next.setDate(Math.min(preferredDayOfMonth, daysInMonth(next.getFullYear(), next.getMonth())));
  return next;
}

function addRecurrenceStep(
  date: Date,
  frequency: "daily" | "weekly" | "monthly",
  interval: number,
  preferredDayOfMonth: number,
): Date {
  const next = new Date(date);
  if (frequency === "daily") next.setDate(next.getDate() + interval);
  if (frequency === "weekly") next.setDate(next.getDate() + interval * 7);
  if (frequency === "monthly") return addMonthsClamped(date, interval, preferredDayOfMonth);
  return next;
}

function findFirstOccurrenceOnOrAfter(params: {
  startsAt: number;
  rangeStart: number;
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
}): Date {
  const start = new Date(params.startsAt);
  const preferredDayOfMonth = start.getDate();
  if (params.rangeStart <= params.startsAt) return start;
  if (params.frequency === "daily" || params.frequency === "weekly") {
    const intervalMs = params.frequency === "daily"
      ? params.interval * 24 * 60 * 60 * 1000
      : params.interval * 7 * 24 * 60 * 60 * 1000;
    const intervalsElapsed = Math.max(
      0,
      Math.floor((params.rangeStart - params.startsAt) / intervalMs),
    );
    let candidate = new Date(params.startsAt + intervalsElapsed * intervalMs);
    if (candidate.getTime() < params.rangeStart) {
      candidate = addRecurrenceStep(
        candidate,
        params.frequency,
        params.interval,
        preferredDayOfMonth,
      );
    }
    return candidate;
  }
  const rangeStart = new Date(params.rangeStart);
  const monthsElapsed =
    (rangeStart.getFullYear() - start.getFullYear()) * 12 +
    (rangeStart.getMonth() - start.getMonth());
  const intervalsElapsed = Math.max(0, Math.floor(monthsElapsed / params.interval));
  let candidate = addMonthsClamped(
    start,
    intervalsElapsed * params.interval,
    preferredDayOfMonth,
  );
  if (candidate.getTime() < params.rangeStart) {
    candidate = addRecurrenceStep(
      candidate,
      params.frequency,
      params.interval,
      preferredDayOfMonth,
    );
  }
  return candidate;
}

function mapCommunityEventRow(row: CommunityEventLike, occurrenceStartsAt?: number) {
  const startsAt = occurrenceStartsAt ?? row.startsAt;
  const durationMs = typeof row.endsAt === "number" ? Math.max(0, row.endsAt - row.startsAt) : null;
  const recurrenceFrequency = normalizeRecurrenceFrequency(row.recurrenceFrequency);
  const parentId = normalizeIdValue(row._id);
  return {
    id: occurrenceStartsAt && occurrenceStartsAt !== row.startsAt ? `${parentId}:${occurrenceStartsAt}` : parentId,
    parent_event_id: parentId,
    community_id: normalizeIdValue(row.communityId),
    title: row.title,
    description_md: row.descriptionMd ?? null,
    starts_at: toIsoString(startsAt),
    ends_at: durationMs === null ? null : toIsoString(startsAt + durationMs),
    series_starts_at: toIsoString(row.startsAt),
    series_ends_at: typeof row.endsAt === "number" ? toIsoString(row.endsAt) : null,
    timezone: row.timezone,
    location_type: row.locationType,
    location_label: row.locationLabel ?? null,
    url: row.url ?? null,
    visibility: row.visibility,
    status: row.status,
    recurrence_frequency: recurrenceFrequency,
    recurrence_interval: normalizeRecurrenceInterval(row.recurrenceInterval),
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
}) {
  const expanded: ReturnType<typeof mapCommunityEventRow>[] = [];
  for (const row of params.rows) {
    if (!params.includeCancelled && row.status === "cancelled") continue;
    const frequency = normalizeRecurrenceFrequency(row.recurrenceFrequency);
    const interval = normalizeRecurrenceInterval(row.recurrenceInterval);
    const recurrenceUntil = typeof row.recurrenceUntil === "number" ? row.recurrenceUntil : null;
    if (frequency === "none") {
      if (row.startsAt >= params.startMs && row.startsAt <= params.endMs) {
        expanded.push(mapCommunityEventRow(row));
      }
      continue;
    }
    if (row.startsAt > params.endMs) continue;
    if (recurrenceUntil !== null && recurrenceUntil < params.startMs) continue;
    const preferredDayOfMonth = new Date(row.startsAt).getDate();
    let occurrence = findFirstOccurrenceOnOrAfter({
      startsAt: row.startsAt,
      rangeStart: params.startMs,
      frequency,
      interval,
    });
    let emittedForRow = 0;
    while (emittedForRow <= params.limit) {
      const occurrenceMs = occurrence.getTime();
      if (occurrenceMs > params.endMs) break;
      if (recurrenceUntil === null || occurrenceMs <= recurrenceUntil) {
        expanded.push(mapCommunityEventRow(row, occurrenceMs));
        emittedForRow += 1;
      }
      if (recurrenceUntil !== null && occurrenceMs >= recurrenceUntil) break;
      occurrence = addRecurrenceStep(occurrence, frequency, interval, preferredDayOfMonth);
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

async function listCommunityEventExpansionCandidates(params: {
  ctx: any;
  communityId: any;
  startMs: number;
  endMs: number;
  includeCancelled: boolean;
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
          .gte("startsAt", params.startMs)
          .lte("startsAt", params.endMs),
      )
      .take(MAX_EVENT_WINDOW_CANDIDATES_PER_STATUS)) as CommunityEventLike[];
    rows.push(...windowRows);

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
        .take(MAX_RECURRING_EVENT_CANDIDATES_PER_STATUS_FREQUENCY)) as CommunityEventLike[];
      rows.push(...recurringRows);
    }
  }

  return dedupeCommunityEventRows(rows);
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

    const rows = await listCommunityEventExpansionCandidates({
      ctx,
      communityId: args.communityId,
      startMs,
      endMs,
      includeCancelled,
    });

    return expandCommunityEventRows({ rows, startMs, endMs, includeCancelled, limit });
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
      const recurrenceFrequency = normalizeRecurrenceFrequency(
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
        recurrenceFrequency,
        recurrenceInterval:
          recurrenceFrequency === "none"
            ? 1
            : normalizeRecurrenceInterval(
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
    const recurrenceFrequency = normalizeRecurrenceFrequency(payload.recurrence_frequency);
    const recurrenceUntil = parseOptionalIsoMs(payload.recurrence_until, "community_event_recurrence_until_invalid");
    if (typeof endsAt === "number" && endsAt <= startsAt) {
      throw new Error("community_event_ends_at_invalid");
    }
    if (recurrenceFrequency !== "none" && typeof recurrenceUntil === "number" && recurrenceUntil < startsAt) {
      throw new Error("community_event_recurrence_until_invalid");
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
      recurrenceFrequency,
      recurrenceInterval: recurrenceFrequency === "none" ? 1 : normalizeRecurrenceInterval(payload.recurrence_interval),
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
