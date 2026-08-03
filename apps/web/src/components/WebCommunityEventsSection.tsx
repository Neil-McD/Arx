import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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

type EventDraft = {
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
  };
}

function buildGoogleCalendarUrl(event: CommunityEvent): string {
  const start = new Date(event.starts_at);
  const end = event.ends_at
    ? new Date(event.ends_at)
    : new Date(start.getTime() + 60 * 60 * 1000);
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

function EventModal(props: {
  draft: EventDraft;
  isSaving: boolean;
  error: string | null;
  title: string;
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

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <form
        className="modal community-event-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-event-modal-title"
        aria-busy={isSaving}
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title" id="community-event-modal-title">{title}</div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close event editor">
            ×
          </button>
        </div>
        <div className="modal-body community-event-form">
          <label>
            <span>Title</span>
            <input
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              placeholder="Weekly call"
              autoFocus
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              value={draft.description_md}
              onChange={(event) => onChange({ ...draft, description_md: event.target.value })}
              placeholder="What members should know before joining."
              rows={4}
            />
          </label>
          <div className="community-event-form-grid">
            <label>
              <span>Starts</span>
              <input
                type="datetime-local"
                value={draft.starts_at}
                onChange={(event) => onChange({ ...draft, starts_at: event.target.value })}
              />
            </label>
            <label>
              <span>Ends</span>
              <input
                type="datetime-local"
                value={draft.ends_at}
                onChange={(event) => onChange({ ...draft, ends_at: event.target.value })}
              />
            </label>
          </div>
          <label>
            <span>Event timezone</span>
            <select
              value={normalizeCommunityEventTimeZone(draft.timezone)}
              onChange={(event) => onChange({ ...draft, timezone: normalizeCommunityEventTimeZone(event.target.value) })}
            >
              {timezoneOptions.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {formatTimeZoneLabel(timeZone)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Location</span>
            <select
              value={draft.location_type}
              onChange={(event) =>
                onChange({ ...draft, location_type: event.target.value as EventDraft["location_type"] })
              }
            >
              <option value="online">Online</option>
              <option value="physical">In person</option>
              <option value="tbd">TBD</option>
            </select>
          </label>
          <label>
            <span>Location label</span>
            <input
              value={draft.location_label}
              onChange={(event) => onChange({ ...draft, location_label: event.target.value })}
              placeholder="Zoom, Discord, NYC, or TBD"
            />
          </label>
          <label>
            <span>Link</span>
            <input
              value={draft.url}
              onChange={(event) => onChange({ ...draft, url: event.target.value })}
              placeholder="https://..."
            />
          </label>
          <div className="community-event-form-grid">
            <label>
              <span>Repeats</span>
              <select
                value={draft.recurrence_frequency}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    recurrence_frequency: event.target.value as EventDraft["recurrence_frequency"],
                  })
                }
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            {draft.recurrence_frequency !== "none" ? (
              <label>
                <span>Repeats until</span>
                <input
                  type="datetime-local"
                  value={draft.recurrence_until}
                  onChange={(event) => onChange({ ...draft, recurrence_until: event.target.value })}
                />
              </label>
            ) : null}
          </div>
          {error ? <div className="community-event-error">{error}</div> : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save event"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function WebCommunityEventsSection(props: WebCommunityEventsSectionProps) {
  const { capabilities, state, actions } = props;
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const wasLoadingEventsRef = useRef(false);
  const hasCompletedEventsLoadRef = useRef(false);

  const monthDate = useMemo(() => startOfLocalMonth(new Date(state.visibleMonthIso)), [state.visibleMonthIso]);
  const visibleMonthEvents = useMemo(
    () =>
      state.events
        .filter((event) => {
          const startsAt = new Date(event.starts_at);
          return Number.isFinite(startsAt.getTime()) && isSameLocalMonth(startsAt, monthDate);
        })
        .slice()
        .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
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
  useEffect(() => {
    if (!state.isLoadingEvents && wasLoadingEventsRef.current) {
      hasCompletedEventsLoadRef.current = true;
    }
    wasLoadingEventsRef.current = state.isLoadingEvents;
  }, [state.isLoadingEvents]);
  const showInitialEventsLoading =
    state.isLoadingEvents && state.events.length === 0 && !hasCompletedEventsLoadRef.current;

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
    const title = draft.title.trim();
    if (!title) {
      setLocalError("Title is required.");
      return;
    }
    const timezone = normalizeCommunityEventTimeZone(draft.timezone);
    const startsAt = communityEventDateTimeInputToIso(draft.starts_at, timezone);
    if (!startsAt) {
      setLocalError("Start time is required.");
      return;
    }
    const endsAt = draft.ends_at ? communityEventDateTimeInputToIso(draft.ends_at, timezone) : null;
    if (draft.ends_at && !endsAt) {
      setLocalError("End time is invalid.");
      return;
    }
    const recurrenceUntil =
      draft.recurrence_frequency === "none"
        ? null
        : draft.recurrence_until
          ? communityEventDateTimeInputToIso(draft.recurrence_until, timezone)
          : null;
    if (draft.recurrence_frequency !== "none" && draft.recurrence_until && !recurrenceUntil) {
      setLocalError("Repeat end date is invalid.");
      return;
    }
    setIsSaving(true);
    const didSave = await actions.saveEvent(
      editingEventId,
      {
        title,
        description_md: draft.description_md.trim() || null,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone,
        location_type: draft.location_type,
        location_label: draft.location_label.trim() || null,
        url: draft.url.trim() || null,
        visibility: "members",
        recurrence_frequency: draft.recurrence_frequency,
        recurrence_interval: 1,
        recurrence_until: recurrenceUntil,
      },
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
            New event
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

      <div className="community-events-content" aria-busy={state.isLoadingEvents}>
        {showInitialEventsLoading ? (
          <div className="community-events-state" role="status">Loading events…</div>
        ) : eventDayGroups.length === 0 ? (
          <div className="community-events-state">
            <div>No events in {formatMonthLabel(monthDate)}.</div>
            {capabilities.hasActiveCommunity && capabilities.canManageEvents ? (
              <button
                type="button"
                onClick={() => openNewEvent(getDefaultEventDayForMonth(monthDate))}
              >
                New event
              </button>
            ) : null}
          </div>
        ) : (
          <div className="community-events-list">
            {eventDayGroups.map((group) => {
              const dayLabel = formatEventDay(group.date);
              return (
                <section key={group.key} className="community-events-day-group" aria-label={dayLabel.full}>
                  <time className="community-events-date" dateTime={group.key}>
                    <span>{dayLabel.weekday}</span>
                    <strong>{dayLabel.day}</strong>
                  </time>
                  <div className="community-events-day-list">
                    {group.events.map((event) => {
                      const isRecurring = isRecurringCommunityEvent(event);
                      const editLabel = isRecurring ? "Edit series" : "Edit event";
                      const cancelLabel = isRecurring ? "Cancel series" : "Cancel event";
                      const eventTimeLabel = formatEventTime(event);
                      const recurrenceLabel = formatRecurrenceLabel(event);
                      const eventLinkLabel = event.location_type === "online" ? "Join" : "Open event";
                      return (
                        <article key={event.id} id={`community-event-${event.id}`} className="community-events-item">
                          <div className="community-events-item-copy">
                            <h3>{event.title}</h3>
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
                            {event.url ? (
                              <a
                                className="community-events-primary-link"
                                href={event.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {eventLinkLabel}
                              </a>
                            ) : null}
                            <a
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
                            </a>
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
