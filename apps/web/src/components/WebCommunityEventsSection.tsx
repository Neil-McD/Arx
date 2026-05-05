import { useMemo, useState, type FormEvent } from "react";
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
  location_type: "online" | "physical" | "tbd";
  location_label: string;
  url: string;
  recurrence_frequency: "none" | "daily" | "weekly" | "monthly";
  recurrence_until: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

function getDefaultSelectedDayForMonth(monthDate: Date): string {
  const today = new Date();
  if (today.getFullYear() === monthDate.getFullYear() && today.getMonth() === monthDate.getMonth()) {
    return toLocalDateKey(today);
  }
  return toLocalDateKey(startOfLocalMonth(monthDate));
}

function toLocalDateTimeInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseInputDateTime(value: string): string | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function formatEventTime(event: CommunityEvent): string {
  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const startLabel = `${dateFormatter.format(startsAt)} at ${timeFormatter.format(startsAt)}`;
  if (!endsAt) return startLabel;
  return `${startLabel} - ${timeFormatter.format(endsAt)}`;
}

function buildCalendarDays(monthDate: Date): Date[] {
  const monthStart = startOfLocalMonth(monthDate);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(gridStart.getTime() + index * DAY_MS));
}

function makeDraft(dayKey: string | null): EventDraft {
  const base = dayKey ? new Date(`${dayKey}T12:00:00`) : new Date(Date.now() + DAY_MS);
  return {
    title: "",
    description_md: "",
    starts_at: toLocalDateTimeInputValue(base),
    ends_at: "",
    location_type: "online",
    location_label: "",
    url: "",
    recurrence_frequency: "none",
    recurrence_until: "",
  };
}

function makeDraftFromEvent(event: CommunityEvent): EventDraft {
  return {
    title: event.title,
    description_md: event.description_md ?? "",
    starts_at: toLocalDateTimeInputValue(new Date(event.series_starts_at)),
    ends_at: event.series_ends_at ? toLocalDateTimeInputValue(new Date(event.series_ends_at)) : "",
    location_type: event.location_type,
    location_label: event.location_label ?? "",
    url: event.url ?? "",
    recurrence_frequency: event.recurrence_frequency,
    recurrence_until: event.recurrence_until
      ? toLocalDateTimeInputValue(new Date(event.recurrence_until))
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
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <form
        className="modal community-event-modal"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close event editor">
            x
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
            <label>
              <span>Repeats until</span>
              <input
                type="datetime-local"
                value={draft.recurrence_until}
                disabled={draft.recurrence_frequency === "none"}
                onChange={(event) => onChange({ ...draft, recurrence_until: event.target.value })}
              />
            </label>
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
  const [selectedDayKey, setSelectedDayKey] = useState(() => toLocalDateKey(new Date()));
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const monthDate = useMemo(() => startOfLocalMonth(new Date(state.visibleMonthIso)), [state.visibleMonthIso]);
  const days = useMemo(() => buildCalendarDays(monthDate), [monthDate]);
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CommunityEvent[]>();
    for (const event of state.events) {
      const key = toLocalDateKey(new Date(event.starts_at));
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    for (const events of grouped.values()) {
      events.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    }
    return grouped;
  }, [state.events]);
  const selectedEvents = eventsByDay.get(selectedDayKey) ?? [];
  const currentRange = actions.getVisibleRange(state.visibleMonthIso);

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
    const confirmed = window.confirm(`Cancel "${event.title}"? This will remove it from the calendar.`);
    if (!confirmed) return;
    void actions.cancelEvent(event.parent_event_id, currentRange);
  };

  const showMonth = (date: Date) => {
    const nextMonth = startOfLocalMonth(date);
    actions.setVisibleMonthIso(toMonthIso(nextMonth));
    setSelectedDayKey(getDefaultSelectedDayForMonth(nextMonth));
  };

  const submitDraft = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) {
      setLocalError("Title is required.");
      return;
    }
    const startsAt = parseInputDateTime(draft.starts_at);
    if (!startsAt) {
      setLocalError("Start time is required.");
      return;
    }
    const endsAt = draft.ends_at ? parseInputDateTime(draft.ends_at) : null;
    if (draft.ends_at && !endsAt) {
      setLocalError("End time is invalid.");
      return;
    }
    const recurrenceUntil =
      draft.recurrence_frequency === "none"
        ? null
        : draft.recurrence_until
          ? parseInputDateTime(draft.recurrence_until)
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
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
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
            Calls, launches, and community moments for {capabilities.activeCommunityName ?? "this community"}.
          </div>
        </div>
        <div className="feed-header-actions">
          <button
            className="community-events-month-btn"
            type="button"
            onClick={() => showMonth(addMonths(monthDate, -1))}
          >
            Prev
          </button>
          <div className="feed-header-badge" aria-label={`${state.events.length} events`}>
            {state.events.length}
          </div>
          <button
            className="community-events-month-btn"
            type="button"
            onClick={() => showMonth(addMonths(monthDate, 1))}
          >
            Next
          </button>
          {capabilities.hasActiveCommunity && capabilities.canManageEvents ? (
            <button className="resources-add-btn" type="button" onClick={() => openNewEvent(selectedDayKey)}>
              +
            </button>
          ) : null}
        </div>
      </div>

      {state.eventsSuccess ? <div className="success-toast">Event saved.</div> : null}
      {state.eventsError ? <div className="community-event-error">{state.eventsError}</div> : null}

      <div className="community-events-shell">
        <section className="community-events-calendar" aria-label={formatMonthLabel(monthDate)}>
          <div className="community-events-calendar-header">
            <h3>{formatMonthLabel(monthDate)}</h3>
            <button type="button" onClick={() => void actions.reloadEvents(currentRange)}>
              Refresh
            </button>
          </div>
          <div className="community-events-weekdays" aria-hidden="true">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="community-events-grid">
            {days.map((day) => {
              const dayKey = toLocalDateKey(day);
              const dayEvents = eventsByDay.get(dayKey) ?? [];
              const isCurrentMonth = day.getMonth() === monthDate.getMonth();
              return (
                <button
                  key={dayKey}
                  type="button"
                  className={[
                    "community-events-day",
                    isCurrentMonth ? "" : "is-muted",
                    selectedDayKey === dayKey ? "is-selected" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => setSelectedDayKey(dayKey)}
                >
                  <span className="community-events-day-number">{day.getDate()}</span>
                  {dayEvents.slice(0, 2).map((event) => (
                    <span key={event.id} className="community-events-day-pill">
                      {event.title}
                    </span>
                  ))}
                  {dayEvents.length > 2 ? (
                    <span className="community-events-day-more">+{dayEvents.length - 2}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="community-events-agenda">
          <div className="community-events-agenda-header">
            <div>
              <div className="community-events-agenda-title">Agenda</div>
              <div className="community-events-agenda-date">{selectedDayKey}</div>
            </div>
          </div>
          {state.isLoadingEvents ? (
            <div className="community-events-muted">Loading events...</div>
          ) : selectedEvents.length === 0 ? (
            <div className="community-events-empty">
              {capabilities.canManageEvents ? "No events yet. Add one for this day." : "No events scheduled."}
            </div>
          ) : (
            <div className="community-events-agenda-list">
              {selectedEvents.map((event) => (
                <article key={event.id} className="community-events-agenda-item">
                  <div className="community-events-agenda-item-top">
                    <h4>{event.title}</h4>
                    {capabilities.canManageEvents ? (
                      <div className="community-events-agenda-actions">
                        <button type="button" onClick={() => openEditEvent(event)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmCancelEvent(event)}
                        >
                          Cancel event
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="community-events-agenda-meta">{formatEventTime(event)}</div>
                  {event.recurrence_frequency !== "none" ? (
                    <div className="community-events-agenda-meta">
                      Repeats {event.recurrence_frequency}
                      {event.recurrence_until ? ` until ${new Date(event.recurrence_until).toLocaleDateString()}` : ""}
                    </div>
                  ) : null}
                  {event.location_label || event.url ? (
                    <div className="community-events-agenda-meta community-events-agenda-location-row">
                      {event.location_label ? <span>{event.location_label}</span> : null}
                      {event.url ? (
                        <a className="community-events-open-link" href={event.url} target="_blank" rel="noreferrer">
                          Open link
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {event.description_md ? (
                    <p className="community-events-agenda-description">{event.description_md}</p>
                  ) : null}
                  <a
                    className="community-events-google-calendar-link"
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
                    <span>Add to Google Calendar</span>
                  </a>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>

      {draft ? (
        <EventModal
          draft={draft}
          isSaving={isSaving}
          error={localError}
          title={editingEventId ? "Edit event" : "New event"}
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
