import { useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Globe, Lock, MapPin, Plus, Repeat, Users, X } from "lucide-react";
import { communityEventDisplayEnd, communityEventPhase, DEFAULT_COMMUNITY_EVENT_DURATION_MS } from "../../../../shared/communityEventLifecycle";
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
import type { CloudCommunityEventSavePayload } from "../../../../shared/cloudCommunityEventsGateway";
import { useWebCommunityFrame } from "../controllers/useWebCommunityFrame";

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
  /** The pod this is a call for; "" for everyone. */
  channel_id: string;
};

type EventDayGroup = {
  key: string;
  date: Date;
  events: CommunityEvent[];
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

function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function toMonthIso(date: Date): string {
  return startOfLocalMonth(date).toISOString();
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultEventDayForMonth(monthDate: Date): string {
  const today = new Date();
  if (today.getFullYear() === monthDate.getFullYear() && today.getMonth() === monthDate.getMonth()) {
    return toLocalDateKey(today);
  }
  return toLocalDateKey(startOfLocalMonth(monthDate));
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function isSameLocalMonth(date: Date, monthDate: Date): boolean {
  return date.getFullYear() === monthDate.getFullYear() && date.getMonth() === monthDate.getMonth();
}

function formatEventDay(date: Date): { weekday: string; day: string; full: string } {
  return {
    weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date).toUpperCase(),
    day: new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date),
    full: new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date),
  };
}

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

function formatRecurrenceLabel(event: CommunityEvent): string | null {
  if (event.recurrence_frequency === "none") return null;
  const eventTimeZone = normalizeCommunityEventTimeZone(event.timezone);
  const until = event.recurrence_until
    ? ` until ${new Date(event.recurrence_until).toLocaleDateString(undefined, { timeZone: eventTimeZone })}`
    : "";
  return `Repeats ${event.recurrence_frequency}${until}`;
}

export function makeDraft(dayKey: string | null, channelId = ""): EventDraft {
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
    channel_id: channelId,
  };
}

export function makeDraftFromEvent(event: CommunityEvent): EventDraft {
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
    channel_id: event.channel_id ?? "",
  };
}

/** The save payload for a draft, or what's wrong with it. */
export function eventDraftPayload(draft: EventDraft): { payload: CloudCommunityEventSavePayload } | { error: string } {
  const title = draft.title.trim();
  if (!title) return { error: "Title is required." };
  const timezone = normalizeCommunityEventTimeZone(draft.timezone);
  const startsAt = communityEventDateTimeInputToIso(draft.starts_at, timezone);
  if (!startsAt) {
    return { error: draft.starts_at ? "Start time is invalid in the selected timezone." : "Start time is required." };
  }
  const endsAt = draft.ends_at ? communityEventDateTimeInputToIso(draft.ends_at, timezone) : null;
  if (draft.ends_at && !endsAt) return { error: "End time is invalid." };
  const recurrenceUntil =
    draft.recurrence_frequency === "none"
      ? null
      : draft.recurrence_until
        ? communityEventDateTimeInputToIso(draft.recurrence_until, timezone)
        : null;
  if (draft.recurrence_frequency !== "none" && draft.recurrence_until && !recurrenceUntil) {
    return { error: "Repeat end date is invalid." };
  }
  return {
    payload: {
      title,
      description_md: draft.description_md.trim() || null,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone,
      location_type: draft.location_type,
      location_label: draft.location_label.trim() || null,
      url: draft.url.trim() || null,
      visibility: "members",
      channel_id: draft.channel_id || null,
      recurrence_frequency: draft.recurrence_frequency,
      recurrence_interval: 1,
      recurrence_until: recurrenceUntil,
    },
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

// Notion-style event sheet: the title is the heading, then one row per property with
// its icon and label on the left, choices as pills, and notes at the bottom.
export function EventModal(props: {
  draft: EventDraft;
  isSaving: boolean;
  error: string | null;
  title: string;
  /** Pods the call can be for; left out, there's no choice to make. */
  pods?: Array<{ id: string; name: string }>;
  onChange: (draft: EventDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { draft, isSaving, error, title, onChange, onClose, onSubmit } = props;
  const timezoneOptions = getUniqueTimeZoneOptions(draft.timezone);
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  const set = (patch: Partial<EventDraft>) => onChange({ ...draft, ...patch });
  const pill = (selected: boolean) => `community-event-pill${selected ? " is-selected" : ""}`;
  const pods = props.pods ?? [];
  // On the body the community's theme scope doesn't reach, so the sheet carries it.
  const themeScope = typeof document === "undefined" ? null
    : document.querySelector<HTMLElement>("[data-community-theme]")?.dataset.communityTheme ?? null;

  // On the body, so nothing in the page (a pod's composer, say) paints over it.
  return createPortal(
    <div className="modal-overlay community-event-sheet-overlay" role="presentation" onMouseDown={onClose} data-community-theme={themeScope ?? undefined}>
      <form
        className="modal community-event-modal community-event-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-event-modal-title"
        aria-busy={isSaving}
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="community-event-sheet-head">
          <span className="community-event-sheet-eyebrow" id="community-event-modal-title">{title}</span>
          <button className="community-event-sheet-close" type="button" onClick={onClose} aria-label="Close event editor">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="community-event-sheet-body">
          <input
            className="community-event-sheet-title"
            value={draft.title}
            onChange={(event) => set({ title: event.target.value })}
            placeholder="Untitled call"
            aria-label="Title"
            autoFocus
          />
          <div className="community-event-props">
            {pods.length > 0 ? (
              <div className="community-event-prop" role="group" aria-label="Who's invited">
                <span className="community-event-prop-label"><Users size={15} aria-hidden="true" /> Invited</span>
                <div className="community-event-pills">
                  <button type="button" className={pill(!draft.channel_id)} aria-pressed={!draft.channel_id} onClick={() => set({ channel_id: "" })}>
                    Everyone
                  </button>
                  {pods.map((pod) => (
                    <button key={pod.id} type="button" className={pill(draft.channel_id === pod.id)} aria-pressed={draft.channel_id === pod.id} onClick={() => set({ channel_id: pod.id })}>
                      <Lock size={12} aria-hidden="true" /> {pod.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="community-event-prop">
              <span className="community-event-prop-label"><CalendarDays size={15} aria-hidden="true" /> When</span>
              <div className="community-event-when">
                <input type="datetime-local" aria-label="Starts" value={draft.starts_at} onChange={(event) => set({ starts_at: event.target.value })} />
                <span aria-hidden="true">→</span>
                <input type="datetime-local" aria-label="Ends" value={draft.ends_at} onChange={(event) => set({ ends_at: event.target.value })} />
              </div>
            </div>
            <label className="community-event-prop">
              <span className="community-event-prop-label"><Globe size={15} aria-hidden="true" /> Time zone</span>
              <select
                className="community-event-quiet-field"
                value={normalizeCommunityEventTimeZone(draft.timezone)}
                onChange={(event) => set({ timezone: normalizeCommunityEventTimeZone(event.target.value) })}
              >
                {timezoneOptions.map((timeZone) => (
                  <option key={timeZone} value={timeZone}>{formatTimeZoneLabel(timeZone)}</option>
                ))}
              </select>
            </label>
            <div className="community-event-prop" role="group" aria-label="Location">
              <span className="community-event-prop-label"><MapPin size={15} aria-hidden="true" /> Where</span>
              <div className="community-event-where">
                <div className="community-event-pills">
                  {([["online", "Online"], ["physical", "In person"], ["tbd", "TBD"]] as const).map(([value, label]) => (
                    <button key={value} type="button" className={pill(draft.location_type === value)} aria-pressed={draft.location_type === value} onClick={() => set({ location_type: value })}>
                      {label}
                    </button>
                  ))}
                </div>
                {draft.location_type !== "tbd" ? (
                  <input
                    className="community-event-quiet-field"
                    aria-label="Location label"
                    value={draft.location_label}
                    onChange={(event) => set({ location_label: event.target.value })}
                    placeholder={draft.location_type === "online" ? "Zoom, Google Meet…" : "Address or venue"}
                  />
                ) : null}
                {draft.location_type === "online" ? (
                  <input
                    className="community-event-quiet-field"
                    aria-label="Link"
                    value={draft.url}
                    onChange={(event) => set({ url: event.target.value })}
                    placeholder="Paste the meeting link"
                  />
                ) : null}
              </div>
            </div>
            <div className="community-event-prop" role="group" aria-label="Repeats">
              <span className="community-event-prop-label"><Repeat size={15} aria-hidden="true" /> Repeats</span>
              <div className="community-event-where">
                <div className="community-event-pills">
                  {([["none", "Never"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]] as const).map(([value, label]) => (
                    <button key={value} type="button" className={pill(draft.recurrence_frequency === value)} aria-pressed={draft.recurrence_frequency === value} onClick={() => set({ recurrence_frequency: value })}>
                      {label}
                    </button>
                  ))}
                </div>
                {draft.recurrence_frequency !== "none" ? (
                  <label className="community-event-until">
                    <span>Until</span>
                    <input type="datetime-local" value={draft.recurrence_until} onChange={(event) => set({ recurrence_until: event.target.value })} />
                  </label>
                ) : null}
              </div>
            </div>
          </div>
          <textarea
            className="community-event-sheet-notes"
            aria-label="Description"
            value={draft.description_md}
            onChange={(event) => set({ description_md: event.target.value })}
            placeholder="Add a note: what to prepare, the agenda, who it's for."
            rows={4}
          />
          {error ? <div className="community-event-error" role="alert">{error}</div> : null}
        </div>
        <div className="community-event-sheet-footer">
          <button type="button" className="community-event-sheet-cancel" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className="community-event-sheet-save" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export function WebCommunityEventsSection(props: WebCommunityEventsSectionProps) {
  const { capabilities, state, actions } = props;
  // An owner can make any event one pod's own call.
  const pods = useWebCommunityFrame().pods?.pods.map((pod) => ({ id: pod.id, name: pod.name })) ?? [];
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasFocusedEvent, setHasFocusedEvent] = useState(false);
  // Do not move/remove the focused row or interrupt an open event editor.
  const now = useCommunityEventClock(state.events, Boolean(draft) || hasFocusedEvent);

  const monthDate = useMemo(() => startOfLocalMonth(new Date(state.visibleMonthIso)), [state.visibleMonthIso]);
  const visibleMonthEvents = useMemo(
    () =>
      state.events
        .filter((event) => {
          const startsAt = new Date(event.starts_at);
          const endsAt = communityEventDisplayEnd(event);
          return event.status !== "cancelled" && Number.isFinite(endsAt) &&
            (isSameLocalMonth(startsAt, monthDate) ||
              (startsAt < monthDate && endsAt > monthDate.getTime()));
        })
        .slice()
        .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id)),
    [monthDate, state.events],
  );
  const eventDayGroups = useMemo(() => {
    const grouped = new Map<string, EventDayGroup>();
    for (const event of visibleMonthEvents) {
      const date = new Date(event.starts_at);
      const key = toLocalDateKey(date);
      const existing = grouped.get(key);
      if (existing) {
        existing.events.push(event);
      } else {
        grouped.set(key, { key, date, events: [event] });
      }
    }
    return Array.from(grouped.values());
  }, [visibleMonthEvents]);
  const editingSourceEvent = useMemo(
    () =>
      editingEventId
        ? state.events.find((event) => event.parent_event_id === editingEventId) ?? null
        : null,
    [editingEventId, state.events],
  );
  const eventModalTitle = editingEventId
    ? isRecurringCommunityEvent(editingSourceEvent)
      ? "Edit series"
      : "Edit event"
    : "New event";
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

  const confirmCancelEvent = (event: CommunityEvent) => {
    const isRecurring = isRecurringCommunityEvent(event);
    const confirmed = window.confirm(
      isRecurring
        ? `Cancel "${event.title}" series? This will remove every occurrence from events.`
        : `Cancel "${event.title}"? This will remove it from events.`,
    );
    if (!confirmed) return;
    void actions.cancelEvent(event.parent_event_id, currentRange);
  };

  const showMonth = (date: Date) => {
    const nextMonth = startOfLocalMonth(date);
    actions.setVisibleMonthIso(toMonthIso(nextMonth));
  };

  const submitDraft = async () => {
    if (!draft) return;
    const checked = eventDraftPayload(draft);
    if ("error" in checked) {
      setLocalError(checked.error);
      return;
    }
    setIsSaving(true);
    const didSave = await actions.saveEvent(
      editingEventId,
      checked.payload,
      currentRange,
    );
    setIsSaving(false);
    if (didSave) {
      setDraft(null);
      setEditingEventId(null);
      setLocalError(null);
    }
  };

  return (
    <div className="community-panel community-events-panel">
      <div className="feed-header-row">
        <div className="feed-header-copy">
          <div className="resources-header">Events</div>
          <div className="feed-header-subtitle">
            Calls and community events for {capabilities.activeCommunityName ?? "this community"}.
          </div>
        </div>
        {capabilities.hasActiveCommunity && capabilities.canManageEvents ? (
          <button
            className="community-events-new-btn"
            type="button"
            onClick={() => openNewEvent(getDefaultEventDayForMonth(monthDate))}
          >
            <Plus size={16} aria-hidden="true" /> New event
          </button>
        ) : null}
      </div>

      <div className="community-events-month-nav" role="group" aria-label="Event month">
        <button
          className="community-events-month-btn"
          type="button"
          aria-label="Previous month"
          onClick={() => showMonth(addMonths(monthDate, -1))}
        >
          ‹
        </button>
        <div className="community-events-month-copy">
          <h2>{formatMonthLabel(monthDate)}</h2>
        </div>
        <button
          className="community-events-month-btn"
          type="button"
          aria-label="Next month"
          onClick={() => showMonth(addMonths(monthDate, 1))}
        >
          ›
        </button>
      </div>

      {state.eventsError ? (
        <div className="community-event-error" role="alert">
          <span>{state.eventsError}</span>
          <button type="button" onClick={() => void actions.reloadEvents(currentRange)}>Retry</button>
        </div>
      ) : null}

      <div className="community-events-content" aria-busy={state.isLoadingEvents}
        onFocusCapture={(event) => { if ((event.target as HTMLElement).closest(".community-events-item")) setHasFocusedEvent(true); }}
        onBlurCapture={(event) => { if (!(event.relatedTarget as HTMLElement | null)?.closest?.(".community-events-item")) setHasFocusedEvent(false); }}>
        {showInitialEventsLoading ? (
          <div className="community-events-state" role="status">Loading events…</div>
        ) : eventDayGroups.length === 0 && state.eventsError ? null : eventDayGroups.length === 0 ? (
          // One "New event" button is enough: the header already has it.
          <div className="community-events-state">
            <div>No events in {formatMonthLabel(monthDate)}.</div>
          </div>
        ) : (
          <div className="community-events-list">
            {eventDayGroups.map((group) => {
              const dayLabel = formatEventDay(group.date);
              return (
                <section key={group.key} className={`community-events-day-group${group.events.every((event) => communityEventPhase(event, now) === "past") ? " is-past" : ""}`} aria-label={dayLabel.full}>
                  <time className="community-events-date" dateTime={toLocalDateKey(group.date)}>
                    <span>{dayLabel.weekday}</span>
                    <strong>{dayLabel.day}</strong>
                  </time>
                  <div className="community-events-day-list">
                    {group.events.map((event) => {
                      const phase = communityEventPhase(event, now);
                      const isPast = phase === "past";
                      const isRecurring = isRecurringCommunityEvent(event);
                      const editLabel = isRecurring ? "Edit series" : "Edit event";
                      const cancelLabel = isRecurring ? "Cancel series" : "Cancel event";
                      const eventTimeLabel = formatEventTime(event);
                      const recurrenceLabel = formatRecurrenceLabel(event);
                      const eventLinkLabel = event.location_type === "online" ? "Join" : "Open event";
                      return (
                        <article key={event.id} id={`community-event-${event.id}`} className={`community-events-item${isPast ? " is-past" : ""}`} aria-label={isPast ? `${event.title}, past event` : undefined}>
                          <div className="community-events-item-copy">
                            <h3>{event.title}</h3>
                            {phase === "ongoing" ? <span className="community-events-phase">Happening now</span> : phase === "started" ? <span className="community-events-phase" title="No end time supplied; shown here for one hour after the start.">Started · end time not set</span> : null}
                            <div className="community-events-time">
                              <span>{eventTimeLabel.primary}</span>
                              {eventTimeLabel.secondary ? <span>{eventTimeLabel.secondary}</span> : null}
                            </div>
                            {event.location_label || recurrenceLabel ? (
                              <div className="community-events-meta">
                                {event.location_label ? <span>{event.location_label}</span> : null}
                                {recurrenceLabel ? <span>{recurrenceLabel}</span> : null}
                              </div>
                            ) : null}
                            {event.description_md ? (
                              <p className="community-events-description">{event.description_md}</p>
                            ) : null}
                          </div>
                          <div className="community-events-actions">
                            {event.url && !isPast ? (
                              <a
                                className="community-events-primary-link"
                                href={event.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {eventLinkLabel}
                              </a>
                            ) : null}
                            {!isPast ? <a
                              className="community-events-calendar-link"
                              href={buildGoogleCalendarUrl(event)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                className="community-events-google-calendar-icon"
                                src="/app-logos/google-calendar.svg"
                                alt=""
                                aria-hidden="true"
                              />
                              <span>Add to calendar</span>
                            </a> : null}
                            {capabilities.canManageEvents ? (
                              <>
                                <button
                                  type="button"
                                  aria-label={editLabel}
                                  title={editLabel}
                                  onClick={() => openEditEvent(event)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="is-danger"
                                  type="button"
                                  aria-label={cancelLabel}
                                  title={cancelLabel}
                                  onClick={() => confirmCancelEvent(event)}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {draft ? (
        <EventModal
          draft={draft}
          pods={pods}
          isSaving={isSaving}
          error={localError}
          title={eventModalTitle}
          onChange={setDraft}
          onClose={() => {
            if (isSaving) return;
            setDraft(null);
            setEditingEventId(null);
            setLocalError(null);
          }}
          onSubmit={submitDraft}
        />
      ) : null}
    </div>
  );
}
