import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { buildCommunityTabPath } from "../shared/webAppRouteState";
import {
  getCommunityEventOccurrenceStartsInRange,
  normalizeCommunityEventRecurrenceFrequency,
  normalizeCommunityEventRecurrenceInterval,
} from "../shared/communityEventTime";
import { listActiveCommunityRecipientUserIds } from "./communityRecipientCore";
import { communitySitePageUrl } from "./communitySites";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { logStructuredError } from "./errorLogging";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKAHEAD_MS = 20 * 60 * 1000;
// Events read per run (per kind); hitting it is logged, never silent.
const DEFAULT_EVENT_SCAN_LIMIT = 2000;
// Every member is reminded: recipients go out in batches of this many.
const RECIPIENTS_PER_BATCH = 500;

type EventReminderBatch = {
  communityId: string;
  communityName: string;
  communitySlug: string;
  eventId: string;
  eventTitle: string;
  eventTimezone: string;
  occurrenceStartsAt: number;
  recipientUserIds: any[];
  // This occurrence's page on the community's own site, where it has one.
  siteEventUrl?: string | null;
};

type CommunityRow = {
  _id: any;
  ownerId: any;
  slug: string;
  name: string;
};

type CommunityEventRow = {
  _id: any;
  communityId: any;
  title: string;
  startsAt: number;
  endsAt?: number;
  timezone: string;
  status: "live" | "cancelled";
  recurrenceFrequency?: "none" | "daily" | "weekly" | "monthly";
  recurrenceInterval?: number;
  recurrenceUntil?: number;
};

function normalizePositiveLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function normalizePositiveMs(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function getEventOccurrenceStartsInWindow(row: CommunityEventRow, windowStart: number, windowEnd: number): number[] {
  if (row.status !== "live") return [];
  const recurrenceUntil = typeof row.recurrenceUntil === "number" ? row.recurrenceUntil : null;
  return getCommunityEventOccurrenceStartsInRange({
    startsAt: row.startsAt,
    rangeStart: windowStart,
    rangeEnd: windowEnd,
    frequency: normalizeCommunityEventRecurrenceFrequency(row.recurrenceFrequency),
    interval: normalizeCommunityEventRecurrenceInterval(row.recurrenceInterval),
    recurrenceUntil,
    timeZone: row.timezone,
    limit: 10,
  });
}

function buildAppUrl(path: string): string {
  return new URL(path, `${readCanonicalPublicAppOrigin()}/`).toString();
}

function buildEventsActionUrl(communitySlug: string): string {
  return buildAppUrl(buildCommunityTabPath(communitySlug, "events") ?? "/discover");
}

function formatEventStartLabel(startsAt: number, timezone: string): string {
  const timeZone = String(timezone ?? "").trim() || "UTC";
  const format = (resolvedTimeZone: string) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: resolvedTimeZone,
      timeZoneName: "short",
    }).format(new Date(startsAt));
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}

export const buildEventReminderBatchesInternal = internalQuery({
  args: {
    nowMs: v.optional(v.number()),
    lookaheadMs: v.optional(v.number()),
    limitEvents: v.optional(v.number()),
    limitRecipientsPerEvent: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<EventReminderBatch[]> => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const lookaheadMs = normalizePositiveMs(args.lookaheadMs, DEFAULT_LOOKAHEAD_MS, 2 * 60 * 60 * 1000);
    const limitEvents = normalizePositiveLimit(args.limitEvents, DEFAULT_EVENT_SCAN_LIMIT, 2000);
    const limitRecipientsPerEvent = typeof args.limitRecipientsPerEvent === "number"
      ? normalizePositiveLimit(args.limitRecipientsPerEvent, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
    const windowStart = nowMs + DAY_MS;
    const windowEnd = windowStart + lookaheadMs;

    const oneOffRows = (await ctx.db
      .query("communityEvents" as any)
      .withIndex("by_status_startsAt", (q: any) =>
        q.eq("status", "live").gte("startsAt", windowStart).lte("startsAt", windowEnd),
      )
      .take(limitEvents)) as CommunityEventRow[];
    const truncated: string[] = oneOffRows.length >= limitEvents ? ["one_off"] : [];

    const recurringRows: CommunityEventRow[] = [];
    for (const frequency of ["daily", "weekly", "monthly"] as const) {
      const rows = (await ctx.db
        .query("communityEvents" as any)
        .withIndex("by_status_recurrenceFrequency_startsAt", (q: any) =>
          q.eq("status", "live").eq("recurrenceFrequency", frequency).lte("startsAt", windowEnd),
        )
        .take(limitEvents)) as CommunityEventRow[];
      if (rows.length >= limitEvents) truncated.push(frequency);
      recurringRows.push(...rows);
    }
    // More events than one run reads: say so (some reminders would be missed).
    if (truncated.length) {
      logStructuredError("event_reminder_scan_truncated", { error: new Error("event_reminder_scan_truncated"), limitEvents, truncated });
    }

    const rowsById = new Map<string, CommunityEventRow>();
    for (const row of [...oneOffRows, ...recurringRows]) {
      rowsById.set(String(row._id), row);
    }

    const batches: EventReminderBatch[] = [];
    for (const event of [...rowsById.values()]) {
      const occurrenceStarts = getEventOccurrenceStartsInWindow(event, windowStart, windowEnd);
      if (occurrenceStarts.length === 0) continue;

      const community = (await ctx.db.get(event.communityId)) as CommunityRow | null;
      if (!community) continue;
      const communitySlug = String(community.slug ?? "").trim();
      if (!communitySlug) continue;
      const recipientUserIds = await listActiveCommunityRecipientUserIds(ctx, {
        communityId: community._id,
        communityOwnerId: community.ownerId,
        nowMs,
        limit: limitRecipientsPerEvent,
      });
      if (recipientUserIds.length === 0) continue;

      for (const occurrenceStartsAt of occurrenceStarts) for (let first = 0; first < recipientUserIds.length; first += RECIPIENTS_PER_BATCH) {
        batches.push({
          communityId: String(community._id),
          communityName: String(community.name ?? communitySlug).trim() || "your community",
          communitySlug,
          eventId: String(event._id),
          eventTitle: String(event.title ?? "").trim() || "Your event",
          eventTimezone: String(event.timezone ?? "").trim() || "UTC",
          occurrenceStartsAt,
          recipientUserIds: recipientUserIds.slice(first, first + RECIPIENTS_PER_BATCH),
          siteEventUrl: await communitySitePageUrl(ctx, community, `/events/${encodeURIComponent(String(event._id))}~${occurrenceStartsAt}`),
        });
      }
    }

    return batches.sort((a, b) => a.occurrenceStartsAt - b.occurrenceStartsAt);
  },
});

export const enqueueEventReminderEmailsInternal = internalAction({
  args: {
    nowMs: v.optional(v.number()),
    lookaheadMs: v.optional(v.number()),
    limitEvents: v.optional(v.number()),
    limitRecipientsPerEvent: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const batches = (await ctx.runQuery(
      (internal as any).eventReminders.buildEventReminderBatchesInternal,
      {
        nowMs,
        lookaheadMs: args.lookaheadMs,
        limitEvents: args.limitEvents,
        limitRecipientsPerEvent: args.limitRecipientsPerEvent,
      },
    )) as EventReminderBatch[];

    let enqueued = 0;
    let deduped = 0;
    let suppressed = 0;
    for (const batch of batches) {
      const startLabel = formatEventStartLabel(batch.occurrenceStartsAt, batch.eventTimezone);
      const payload = {
        communityName: batch.communityName,
        eventTitle: batch.eventTitle,
        title: `${batch.eventTitle} is tomorrow`,
        subtitle: batch.communityName,
        intro: `Starts ${startLabel}.`,
        actionUrl: batch.siteEventUrl ?? buildEventsActionUrl(batch.communitySlug),
        footerNote: "You can change event reminder emails from account settings.",
      };
      for (const userId of batch.recipientUserIds) {
        const result = (await ctx.runMutation(
          (internal as any).email.enqueueEmailJobInternal,
          {
            kind: "event_reminder_24h",
            recipientUserId: userId,
            templateKey: "event_reminder",
            payload,
            dedupeKey: `event_reminder_24h:${batch.eventId}:${batch.occurrenceStartsAt}:${String(userId)}`,
            nowMs,
          },
        )) as { deduped?: boolean; status?: string } | null;
        if (result?.deduped) {
          deduped += 1;
        } else if (result?.status === "suppressed") {
          suppressed += 1;
        } else {
          enqueued += 1;
        }
      }
    }

    return {
      ok: true,
      events: batches.length,
      recipients: batches.reduce((count, batch) => count + batch.recipientUserIds.length, 0),
      enqueued,
      deduped,
      suppressed,
    };
  },
});
