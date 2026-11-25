import { isPodEvent, podEventRecipientIds } from "./communityEventAudience";
import { isEventCancellationActive } from "./communityEvents";
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
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { logStructuredError } from "./errorLogging";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKAHEAD_MS = 20 * 60 * 1000;
// Events read per run (per kind); hitting it is logged, never silent.
const DEFAULT_EVENT_SCAN_LIMIT = 2000;
// Every member is reminded: recipients go out in batches of this many.
const RECIPIENTS_PER_BATCH = 500;
const ENQUEUE_CHUNK_SIZE = 100;

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
  podChannelId?: any;
  status: "live" | "cancelled";
  cancelledOccurrences?: Array<{
    startsAt: number;
    cancelledAt: number;
    cancelledByUserId?: any;
    note?: string;
  }>;
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
  const cancelledSet = new Set(
    (row.cancelledOccurrences ?? [])
      .map((entry) => entry?.startsAt)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );
  return getCommunityEventOccurrenceStartsInRange({
    startsAt: row.startsAt,
    rangeStart: windowStart,
    rangeEnd: windowEnd,
    frequency: normalizeCommunityEventRecurrenceFrequency(row.recurrenceFrequency),
    interval: normalizeCommunityEventRecurrenceInterval(row.recurrenceInterval),
    recurrenceUntil,
    timeZone: row.timezone,
    limit: 10,
  }).filter((startsAt) => !cancelledSet.has(startsAt));
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
      // A pod's call reminds the pod only.
      const podRecipients = isPodEvent(event) ? await podEventRecipientIds(ctx, event) : null;
      const eligibleRecipientUserIds = podRecipients
        ? recipientUserIds.filter((userId) => podRecipients.has(String(userId)))
        : recipientUserIds;
      if (eligibleRecipientUserIds.length === 0) continue;

      for (const occurrenceStartsAt of occurrenceStarts) for (let first = 0; first < eligibleRecipientUserIds.length; first += RECIPIENTS_PER_BATCH) {
        batches.push({
          communityId: String(community._id),
          communityName: String(community.name ?? communitySlug).trim() || "your community",
          communitySlug,
          eventId: String(event._id),
          eventTitle: String(event.title ?? "").trim() || "Your event",
          eventTimezone: String(event.timezone ?? "").trim() || "UTC",
          occurrenceStartsAt,
          recipientUserIds: eligibleRecipientUserIds.slice(first, first + RECIPIENTS_PER_BATCH),
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
        actionUrl: buildEventsActionUrl(batch.communitySlug),
        footerNote: "You can change event reminder emails from account settings.",
      };
      for (let start = 0; start < batch.recipientUserIds.length; start += ENQUEUE_CHUNK_SIZE) {
        const chunk = batch.recipientUserIds.slice(start, start + ENQUEUE_CHUNK_SIZE);
        const batchResult = (await ctx.runMutation(
          (internal as any).email.enqueueEmailJobsBatchInternal,
          {
            jobs: chunk.map((userId) => ({
              kind: "event_reminder_24h",
              recipientUserId: userId,
              templateKey: "event_reminder",
              payload,
              dedupeKey: `event_reminder_24h:${batch.eventId}:${batch.occurrenceStartsAt}:${String(userId)}`,
              nowMs,
            })),
          },
        )) as { enqueued?: number; deduped?: number; suppressed?: number } | null;
        enqueued += Number(batchResult?.enqueued ?? 0);
        deduped += Number(batchResult?.deduped ?? 0);
        suppressed += Number(batchResult?.suppressed ?? 0);
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

type EventCancellationTarget = {
  communityId: any;
  communityName: string;
  communitySlug: string;
  communityLifecycleGeneration: number;
  eventTitle: string;
  eventTimezone: string;
  isRecurring: boolean;
  recipientUserIds: any[];
};

export const buildEventCancellationTargetInternal = internalQuery({
  args: {
    eventId: v.id("communityEvents"),
    scope: v.union(v.literal("occurrence"), v.literal("series")),
    occurrenceStartsAt: v.number(),
    cancelledAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<EventCancellationTarget | null> => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const event = (await ctx.db.get(args.eventId)) as (CommunityEventRow & { cancelledAt?: number }) | null;
    if (
      !event ||
      isPodEvent(event) ||
      !isEventCancellationActive(event as any, {
        scope: args.scope,
        occurrenceStartsAt: args.occurrenceStartsAt,
        cancelledAt: args.cancelledAt,
      })
    ) {
      return null;
    }
    const community = (await ctx.db.get(event.communityId)) as (CommunityRow & {
      archivedAt?: number;
      lifecycleGeneration?: number;
    }) | null;
    if (!community || typeof community.archivedAt === "number") return null;
    const communitySlug = String(community.slug ?? "").trim();
    if (!communitySlug) return null;

    const recipientUserIds = await listActiveCommunityRecipientUserIds(ctx, {
      communityId: community._id,
      communityOwnerId: community.ownerId,
      nowMs,
      limit: Number.MAX_SAFE_INTEGER,
    });
    if (recipientUserIds.length === 0) return null;

    const frequency = normalizeCommunityEventRecurrenceFrequency(event.recurrenceFrequency);
    return {
      communityId: community._id,
      communityName: String(community.name ?? communitySlug).trim() || "your community",
      communitySlug,
      communityLifecycleGeneration:
        typeof community.lifecycleGeneration === "number" ? community.lifecycleGeneration : 0,
      eventTitle: String(event.title ?? "").trim() || "Your event",
      eventTimezone: String(event.timezone ?? "").trim() || "UTC",
      isRecurring: frequency !== "none",
      recipientUserIds,
    };
  },
});

export const enqueueEventCancellationEmailsInternal = internalAction({
  args: {
    eventId: v.id("communityEvents"),
    scope: v.union(v.literal("occurrence"), v.literal("series")),
    occurrenceStartsAt: v.number(),
    occurrenceEndsAt: v.optional(v.number()),
    cancelledAt: v.number(),
    note: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const effectiveEndMs = Number.isFinite(args.occurrenceEndsAt)
      ? Math.floor(args.occurrenceEndsAt as number)
      : args.occurrenceStartsAt;
    if (effectiveEndMs <= nowMs) {
      return { ok: true, skipped: "past_event", enqueued: 0, deduped: 0, suppressed: 0 };
    }
    const target = (await ctx.runQuery(
      (internal as any).eventReminders.buildEventCancellationTargetInternal,
      {
        eventId: args.eventId,
        scope: args.scope,
        occurrenceStartsAt: args.occurrenceStartsAt,
        cancelledAt: args.cancelledAt,
        nowMs,
      },
    )) as EventCancellationTarget | null;
    if (!target) {
      return { ok: true, skipped: "no_target", enqueued: 0, deduped: 0, suppressed: 0 };
    }

    const startLabel = formatEventStartLabel(args.occurrenceStartsAt, target.eventTimezone);
    const trimmedNote = typeof args.note === "string" ? args.note.trim() : "";
    const noteSuffix = trimmedNote ? ` Note from the host: "${trimmedNote}"` : "";
    const intro =
      args.scope === "occurrence"
        ? `The ${startLabel} session of ${target.eventTitle} has been cancelled. Future sessions remain on the calendar.${noteSuffix}`
        : target.isRecurring
          ? `All upcoming sessions of ${target.eventTitle} (next scheduled ${startLabel}) have been cancelled.${noteSuffix}`
          : `${target.eventTitle} scheduled for ${startLabel} has been cancelled.${noteSuffix}`;

    const payload = {
      eventId: String(args.eventId),
      cancellationScope: args.scope,
      occurrenceStartsAt: args.occurrenceStartsAt,
      cancelledAt: args.cancelledAt,
      communityName: target.communityName,
      eventTitle: target.eventTitle,
      title:
        args.scope === "occurrence"
          ? `Cancelled: ${target.eventTitle} (${startLabel})`
          : `Cancelled: ${target.eventTitle}`,
      subtitle: target.communityName,
      intro,
      actionUrl: buildEventsActionUrl(target.communitySlug),
      footerNote: "You can change event emails from account settings.",
    };

    let enqueued = 0;
    let deduped = 0;
    let suppressed = 0;
    for (let start = 0; start < target.recipientUserIds.length; start += ENQUEUE_CHUNK_SIZE) {
      const chunk = target.recipientUserIds.slice(start, start + ENQUEUE_CHUNK_SIZE);
      const batchResult = (await ctx.runMutation(
        (internal as any).email.enqueueEmailJobsBatchInternal,
        {
          jobs: chunk.map((userId) => ({
            kind: "event_cancelled",
            communityId: target.communityId,
            communityLifecycleGeneration: target.communityLifecycleGeneration,
            recipientUserId: userId,
            templateKey: "event_cancelled",
            payload,
            dedupeKey: `event_cancelled:${String(args.eventId)}:${args.scope}:${args.occurrenceStartsAt}:${args.cancelledAt}:${String(userId)}`,
            nowMs,
          })),
        },
      )) as { enqueued?: number; deduped?: number; suppressed?: number } | null;
      enqueued += Number(batchResult?.enqueued ?? 0);
      deduped += Number(batchResult?.deduped ?? 0);
      suppressed += Number(batchResult?.suppressed ?? 0);
    }

    if (enqueued > 0) {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).email.processPendingEmailOutboxInternal,
        { limit: 25 },
      );
    }

    return {
      ok: true,
      recipients: target.recipientUserIds.length,
      enqueued,
      deduped,
      suppressed,
    };
  },
});
