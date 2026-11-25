import { CommunityPageHeader, CommunityPageRail } from "./CommunityPageHeader";
import { EventListSkeleton } from "./WebLoadingSkeleton";
import { KitEventsList } from "../v1/KitEventsList";
import { resilientImport } from "../lib/resilientLazy";
import { announceCommunityEventsChanged } from "../../../../shared/communityEventsChanged";
import { splitCommunityEvents } from "./communityEventsList";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

const KitEventForm = lazy(() =>
  resilientImport(() => import("../v1/KitEventForm")).then((module) => ({ default: module.KitEventForm })),
);
import { DEFAULT_COMMUNITY_EVENT_DURATION_MS } from "../../../../shared/communityEventLifecycle";
import { useCommunityEventClock } from "../../../../shared/useCommunityEventClock";
import {
  communityEventDateTimeInputToIso,
  getCommunityEventViewerTimeZone,
  normalizeCommunityEventTimeZone,
  toCommunityEventDateTimeInputValue,
} from "../../../../shared/communityEventTime";
import type {
  CommunityEvent,
  CommunityEventsActions,
  CommunityEventsCapabilities,
  CommunityEventsState,
} from "./communityEventsContracts";

type WebCommunityEventsSectionProps = {
  capabilities: CommunityEventsCapabilities;
  state: CommunityEventsState;
  actions: CommunityEventsActions;
};

export type EventDraft = {
  title: string;
  description_md: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location_type: "online" | "physical" | "tbd";
  location_label: string;
  url: string;
  recurrence_frequency: "none" | "daily" | "weekly" | "monthly";
  recurrence_until: string;
  // Members only, or also on the community's public page.
  visibility: "members" | "public";
  // Every week, or every second week: kept as the event has it (the form
  // has no field for it, and saving must not change the dates).
  recurrence_interval: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EVENT_TIME_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function getUniqueTimeZoneOptions(currentTimeZone: string): string[] {
  const viewerTimeZone = getCommunityEventViewerTimeZone();
  return [currentTimeZone, viewerTimeZone, ...DEFAULT_EVENT_TIME_ZONES]
    .map((timeZone) => normalizeCommunityEventTimeZone(timeZone))
    .filter((timeZone, index, all) => all.indexOf(timeZone) === index);
}

function formatTimeZoneLabel(timeZone: string, referenceDate: Date = new Date()): string {
  const normalized = normalizeCommunityEventTimeZone(timeZone);
  const displayName = normalized.split("/").pop()?.replace(/_/g, " ") ?? normalized;
  const shortName = new Intl.DateTimeFormat(undefined, {
    timeZone: normalized,
    timeZoneName: "short",
  })
    .formatToParts(referenceDate)
    .find((part) => part.type === "timeZoneName")?.value;
  return shortName ? `${displayName} (${shortName})` : displayName;
}

function formatEventTimeInZone(event: CommunityEvent, timeZone: string, includeZoneName: boolean): string {
  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: includeZoneName ? "short" : undefined,
  });
  const startLabel = timeFormatter.format(startsAt);
  if (!endsAt) return startLabel;
  return `${startLabel} – ${timeFormatter.format(endsAt)}`;
}

function formatEventTime(event: CommunityEvent): { primary: string; secondary: string | null } {
  const viewerTimeZone = getCommunityEventViewerTimeZone();
  const eventTimeZone = normalizeCommunityEventTimeZone(event.timezone);
  if (eventTimeZone === viewerTimeZone) {
    return {
      primary: formatEventTimeInZone(event, viewerTimeZone, true),
      secondary: null,
    };
  }
  return {
    primary: `${formatEventTimeInZone(event, viewerTimeZone, true)} · your time`,
    secondary: `Event time: ${formatEventTimeInZone(event, eventTimeZone, true)}`,
  };
}

function makeDraft(dayKey: string | null): EventDraft {
  const timezone = getCommunityEventViewerTimeZone();
  const base = dayKey ? new Date(`${dayKey}T12:00:00`) : new Date(Date.now() + DAY_MS);
  return {
    title: "",
    description_md: "",
    starts_at: toCommunityEventDateTimeInputValue(base, timezone),
    ends_at: "",
    timezone,
    location_type: "online",
    location_label: "",
    url: "",
    recurrence_frequency: "none",
    recurrence_until: "",
    visibility: "members",
    recurrence_interval: 1,
  };
}

function makeDraftFromEvent(event: CommunityEvent): EventDraft {
  const timezone = normalizeCommunityEventTimeZone(event.timezone);
  return {
    title: event.title,
    description_md: event.description_md ?? "",
    starts_at: toCommunityEventDateTimeInputValue(new Date(event.series_starts_at), timezone),
    ends_at: event.series_ends_at ? toCommunityEventDateTimeInputValue(new Date(event.series_ends_at), timezone) : "",
    timezone,
    location_type: event.location_type,
    location_label: event.location_label ?? "",
    url: event.url ?? "",
    recurrence_frequency: event.recurrence_frequency,
    recurrence_until: event.recurrence_until
      ? toCommunityEventDateTimeInputValue(new Date(event.recurrence_until), timezone)
      : "",
    visibility: event.visibility === "public" ? "public" : "members",
    recurrence_interval: event.recurrence_interval || 1,
  };
}

function buildGoogleCalendarUrl(event: CommunityEvent): string {
  const start = new Date(event.starts_at);
  const end = event.ends_at
    ? new Date(event.ends_at)
    : new Date(start.getTime() + DEFAULT_COMMUNITY_EVENT_DURATION_MS);
  const formatGoogleDate = (date: Date) =>
    date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const details = [event.description_md, event.url].filter(Boolean).join("\n\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatGoogleDate(start)}/${formatGoogleDate(end)}`,
    details,
    location: event.location_label ?? event.url ?? "",
    ctz: normalizeCommunityEventTimeZone(event.timezone),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function isRecurringCommunityEvent(event: CommunityEvent | null): boolean {
  return !!event && event.recurrence_frequency !== "none";
}

export function WebCommunityEventsSection(props: WebCommunityEventsSectionProps) {
  const { capabilities, state, actions } = props;
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Do not interrupt an open event editor.
  const paused = Boolean(draft);
  const now = useCommunityEventClock(state.events, paused);
  // The featured card counts down by the minute in the hour before an event,
  // which the event clock (starts, ends, month changes) does not tick for.
  const [minuteNow, setMinuteNow] = useState(() => Date.now());
  const nextStart = useMemo(() => {
    const upcoming = state.events
      .filter((event) => event.status !== "cancelled" && Date.parse(event.starts_at) > Date.now())
      .map((event) => Date.parse(event.starts_at));
    return upcoming.length ? Math.min(...upcoming) : null;
  }, [state.events]);
  useEffect(() => {
    if (paused || nextStart === null) return;
    const untilCountdown = nextStart - 60 * 60_000 - Date.now();
    const tick = () => setMinuteNow(Date.now());
    if (untilCountdown > 0) {
      const timer = window.setTimeout(tick, Math.min(untilCountdown + 500, 2_147_000_000));
      return () => window.clearTimeout(timer);
    }
    // One step at a time: the effect runs again after each tick.
    const timer = window.setTimeout(tick, 30_000);
    return () => window.clearTimeout(timer);
  }, [paused, nextStart, minuteNow]);
  const listNow = paused ? now : Math.max(now, minuteNow);

  const editingSourceEvent = useMemo(
    () =>
      editingEventId
        ? state.events.find((event) => event.parent_event_id === editingEventId) ?? null
        : null,
    [editingEventId, state.events],
  );
  const currentRange = actions.getVisibleRange(state.visibleMonthIso);
  const showInitialEventsLoading =
    !state.eventsError && state.events.length === 0 &&
    (state.isLoadingEvents || state.hasLoadedVisibleRange === false);

  const openNewEvent = (dayKey: string | null) => {
    setLocalError(null);
    setEditingEventId(null);
    setDraft(makeDraft(dayKey));
  };

  const openEditEvent = (event: CommunityEvent) => {
    setLocalError(null);
    setEditingEventId(event.parent_event_id);
    setDraft(makeDraftFromEvent(event));
  };

  // Saves one draft; what is wrong with it shows in the open form.
  const saveEventDraft = async (nextDraft: EventDraft, eventId: string | null): Promise<boolean> => {
    const title = nextDraft.title.trim();
    if (!title) {
      setLocalError("Title is required.");
      return false;
    }
    const timezone = normalizeCommunityEventTimeZone(nextDraft.timezone);
    const startsAt = communityEventDateTimeInputToIso(nextDraft.starts_at, timezone);
    if (!startsAt) {
      setLocalError(
        nextDraft.starts_at
          ? "Start time is invalid in the selected timezone."
          : "Start time is required.",
      );
      return false;
    }
    const endsAt = nextDraft.ends_at ? communityEventDateTimeInputToIso(nextDraft.ends_at, timezone) : null;
    if (nextDraft.ends_at && !endsAt) {
      setLocalError("End time is invalid.");
      return false;
    }
    const recurrenceUntil =
      nextDraft.recurrence_frequency === "none"
        ? null
        : nextDraft.recurrence_until
          ? communityEventDateTimeInputToIso(nextDraft.recurrence_until, timezone)
          : null;
    if (nextDraft.recurrence_frequency !== "none" && nextDraft.recurrence_until && !recurrenceUntil) {
      setLocalError("Repeat end date is invalid.");
      return false;
    }
    setIsSaving(true);
    const didSave = await actions.saveEvent(
      eventId,
      {
        title,
        description_md: nextDraft.description_md.trim() || null,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone,
        location_type: nextDraft.location_type,
        location_label: nextDraft.location_label.trim() || null,
        url: nextDraft.url.trim() || null,
        visibility: nextDraft.visibility,
        recurrence_frequency: nextDraft.recurrence_frequency,
        recurrence_interval: nextDraft.recurrence_interval,
        recurrence_until: recurrenceUntil,
      },
      currentRange,
    );
    setIsSaving(false);
    if (didSave) announceCommunityEventsChanged();
    return didSave;
  };

  const closeDraft = () => {
    if (isSaving) return;
    setDraft(null);
    setEditingEventId(null);
    setLocalError(null);
  };

  const submitDraft = async () => {
    if (!draft) return;
    if (await saveEventDraft(draft, editingEventId)) {
      setDraft(null);
      setEditingEventId(null);
      setLocalError(null);
    }
  };

  const listParts = splitCommunityEvents(state.events, listNow);
  const eventForm = draft ? (
    <Suspense fallback={null}>
      <KitEventForm
        key={editingEventId ?? "new"}
        draft={draft}
        isNew={!editingEventId}
        isSeries={isRecurringCommunityEvent(editingSourceEvent)}
        canBePublic={!editingSourceEvent?.pod_channel_id}
        communityName={capabilities.activeCommunityName}
        isSaving={isSaving}
        error={localError ?? (isSaving ? null : state.eventsError)}
        timeZones={getUniqueTimeZoneOptions(draft.timezone).map((zone) => ({
          value: zone,
          label: formatTimeZoneLabel(zone),
        }))}
        onChange={setDraft}
        onClose={closeDraft}
        onSubmit={() => void submitDraft()}
      />
    </Suspense>
  ) : null;

  return (
    <div className="community-panel community-events-panel">
      <CommunityPageHeader title="Events" actions={null}>
        <div className="feed-header-row">
          <div className="feed-header-copy">
            <div className="resources-header">Events</div>
            <div className="feed-header-subtitle">
              Calls and community events for {capabilities.activeCommunityName ?? "this community"}.
            </div>
          </div>
        </div>
      </CommunityPageHeader>

      {state.eventsError ? (
        <div className="community-event-error" role="alert">
          <span>{state.eventsError}</span>
          <button type="button" onClick={() => void actions.reloadEvents(currentRange)}>Retry</button>
        </div>
      ) : null}

      <div className="community-events-content" aria-busy={state.isLoadingEvents}>
        {showInitialEventsLoading ? (
          <EventListSkeleton />
        ) : state.eventsError && state.events.length === 0 ? null : (
          <KitEventsList
            featured={listParts.featured}
            comingUp={listParts.comingUp}
            cancelled={listParts.cancelled}
            past={listParts.past}
            now={listNow}
            canManage={capabilities.hasActiveCommunity && capabilities.canManageEvents}
            communityName={capabilities.activeCommunityName}
            timeLabel={formatEventTime}
            calendarUrl={buildGoogleCalendarUrl}
            form={eventForm}
            onCloseForm={closeDraft}
            editingId={editingEventId}
            onNew={() => openNewEvent(null)}
            onEdit={openEditEvent}
            onCancel={async (event, options) => {
              if (await actions.cancelEvent(event.parent_event_id, currentRange, options)) {
                announceCommunityEventsChanged();
              }
            }}
            onRestore={
              actions.restoreEvent
                ? async (event) => {
                    const restoreOptions =
                      event.cancellation_scope === "occurrence"
                        ? { occurrenceStartsAtIso: event.starts_at }
                        : undefined;
                    if (await actions.restoreEvent!(event.parent_event_id, currentRange, restoreOptions)) {
                      announceCommunityEventsChanged();
                    }
                  }
                : undefined
            }
            onSetPublic={(event, isPublic) =>
              saveEventDraft(
                { ...makeDraftFromEvent(event), visibility: isPublic ? "public" : "members" },
                event.parent_event_id,
              )
            }
            renderRail={(rail) => <CommunityPageRail label="This event">{rail}</CommunityPageRail>}
          />
        )}
      </div>
    </div>
  );
}
