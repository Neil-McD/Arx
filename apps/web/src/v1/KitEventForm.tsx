// Events, Nov 14: adding or changing an event happens in the page, where the
// event will sit, not in a pop-up. A new event starts as one line ("Office
// hours every Tuesday 3pm"); the page shows how it read the line, and every
// part can be changed by hand. Changing an event opens straight on the parts.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { eventLinePlaceIsOnline, eventLineTimes, readEventLine } from "../../../../shared/communityEventLine";
import { getZonedCommunityEventTimeParts, parseCommunityEventDateTimeInputValue } from "../../../../shared/communityEventTime";
import type { EventDraft } from "../components/WebCommunityEventsSection";
import { cx, Icon } from "./kit";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clockWord(hour: number, minute: number): string {
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

// How the page says back what the fields hold: "Tue, Dec 1", "3:00 to 4:00 pm", "Every Tuesday".
export function eventDraftWords(draft: Pick<EventDraft, "starts_at" | "ends_at" | "recurrence_frequency" | "location_type" | "location_label">): { day: string; time: string; repeats: string | null; where: string } {
  const start = parseCommunityEventDateTimeInputValue(draft.starts_at);
  const end = draft.ends_at ? parseCommunityEventDateTimeInputValue(draft.ends_at) : null;
  const weekday = start ? new Date(Date.UTC(start.year, start.month - 1, start.day)).getUTCDay() : 0;
  const startWord = start ? clockWord(start.hour, start.minute) : "";
  const endWord = end ? clockWord(end.hour, end.minute) : "";
  const sameHalf = Boolean(start && end && (start.hour < 12) === (end.hour < 12));
  return {
    day: start ? `${WEEKDAYS[weekday].slice(0, 3)}, ${MONTHS[start.month - 1]} ${start.day}` : "No day yet",
    time: !start ? "No time yet" : end ? `${sameHalf ? startWord.replace(/ (am|pm)$/, "") : startWord} to ${endWord}` : startWord,
    repeats: draft.recurrence_frequency === "weekly" ? `Every ${WEEKDAYS[weekday]}`
      : draft.recurrence_frequency === "daily" ? "Every day"
      : draft.recurrence_frequency === "monthly" ? "Every month" : null,
    where: draft.location_type === "online" ? (draft.location_label ? `Online · ${draft.location_label}` : "Online")
      : draft.location_type === "physical" ? (draft.location_label || "In person") : "Place to come",
  };
}

export function KitEventForm(props: {
  draft: EventDraft;
  // A new event starts from one line; an existing one opens on its parts.
  isNew: boolean;
  isSeries: boolean;
  // A pod's call is only ever for that pod.
  canBePublic: boolean;
  communityName: string | null;
  isSaving: boolean;
  error: string | null;
  timeZones: Array<{ value: string; label: string }>;
  onChange: (draft: EventDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { draft, onChange } = props;
  const [line, setLine] = useState("");
  const [parts, setParts] = useState(!props.isNew);
  const box = useRef<HTMLFormElement | null>(null);
  useEffect(() => { box.current?.scrollIntoView({ block: "nearest" }); }, []);

  const typeLine = (text: string) => {
    setLine(text);
    const now = getZonedCommunityEventTimeParts(Date.now(), draft.timezone);
    const read = readEventLine(text, now);
    const online = eventLinePlaceIsOnline(read.place);
    onChange({
      ...draft,
      title: read.title,
      ...eventLineTimes(read, now),
      recurrence_frequency: read.repeats,
      recurrence_until: read.repeats === "none" ? "" : draft.recurrence_until,
      location_type: online ? "online" : "physical",
      location_label: read.place ?? "",
    });
  };

  const submit = (event: FormEvent) => { event.preventDefault(); if (!props.isSaving) props.onSubmit(); };
  const words = eventDraftWords(draft);
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => onChange({ ...draft, [key]: value });
  const showRead = props.isNew && !parts && line.trim().length > 0;

  return (
    <form ref={box} className={cx("kadd", "evadd")} aria-label={props.isNew ? "Add an event" : props.isSeries ? "Change this series" : "Change this event"} aria-busy={props.isSaving}
      onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape" && !props.isSaving) { event.stopPropagation(); props.onClose(); } }}>
      {props.isNew ? (
        <input className={cx("evline")} autoFocus value={line} onChange={(event) => typeLine(event.target.value)} aria-label="Add an event" placeholder="Office hours every Tuesday 3pm" />
      ) : (
        <div className={cx("evhead")}>{props.isSeries ? "Change every date of this series" : "Change this event"}</div>
      )}
      {showRead ? (
        <>
          <div className={cx("evnote")}>Read as</div>
          <div className={cx("evread")}>
            <button type="button" onClick={() => setParts(true)}>{draft.title || "No name yet"}</button>
            <button type="button" onClick={() => setParts(true)}><Icon name="cal" />{words.day}</button>
            <button type="button" onClick={() => setParts(true)}>{words.time}</button>
            <button type="button" onClick={() => setParts(true)}>{words.repeats ?? "Once"}</button>
            <button type="button" onClick={() => setParts(true)}>{words.where}</button>
          </div>
        </>
      ) : null}
      {parts ? (
        <div className={cx("evparts")}>
          <label className={cx("wide")}><span>Name</span><input value={draft.title} onChange={(event) => set("title", event.target.value)} placeholder="Weekly call" autoFocus={!props.isNew} /></label>
          <label><span>Starts</span><input type="datetime-local" value={draft.starts_at} onChange={(event) => set("starts_at", event.target.value)} /></label>
          <label><span>Ends</span><input type="datetime-local" value={draft.ends_at} onChange={(event) => set("ends_at", event.target.value)} /></label>
          <label><span>Time zone</span>
            <select value={draft.timezone} onChange={(event) => set("timezone", event.target.value)}>
              {props.timeZones.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
            </select>
          </label>
          <label><span>Repeats</span>
            <select value={draft.recurrence_frequency} onChange={(event) => set("recurrence_frequency", event.target.value as EventDraft["recurrence_frequency"])}>
              <option value="none">Once</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </label>
          {draft.recurrence_frequency !== "none" ? (
            <label className={cx("wide")}><span>Last date (leave empty to keep going)</span><input type="datetime-local" value={draft.recurrence_until} onChange={(event) => set("recurrence_until", event.target.value)} /></label>
          ) : null}
          <label><span>Where</span>
            <select value={draft.location_type} onChange={(event) => set("location_type", event.target.value as EventDraft["location_type"])}>
              <option value="online">Online</option>
              <option value="physical">In person</option>
              <option value="tbd">Not decided</option>
            </select>
          </label>
          <label><span>{draft.location_type === "physical" ? "Address or place" : "What it's on"}</span><input value={draft.location_label} onChange={(event) => set("location_label", event.target.value)} placeholder={draft.location_type === "physical" ? "Where to go" : "Zoom, Discord"} /></label>
          <label className={cx("wide")}><span>Link to join</span><input value={draft.url} onChange={(event) => set("url", event.target.value)} placeholder="https://" /></label>
          <label className={cx("wide")}><span>What to know before it</span><textarea rows={3} value={draft.description_md} onChange={(event) => set("description_md", event.target.value)} /></label>
          {props.canBePublic ? (
            <label className={cx("wide", "evpublic")}>
              <input type="checkbox" checked={draft.visibility === "public"} onChange={(event) => set("visibility", event.target.checked ? "public" : "members")} />
              <span>Show it on {props.communityName ?? "the community"}'s public page<small>Visitors see the name, day and place. The link to join stays with members.</small></span>
            </label>
          ) : null}
        </div>
      ) : null}
      {props.error ? <div className={cx("everr")} role="alert">{props.error}</div> : null}
      <div className={cx("evfoot")}>
        {props.isNew && !parts ? <span>{line.trim() ? "Tap a part to change it. Members see it in their own time." : "Say what, when and how often. Day and time can be changed after."}</span> : <span />}
        <button type="button" className={cx("btn sm")} disabled={props.isSaving} onClick={props.onClose}>Cancel</button>
        <button type="submit" className={cx("btn sm go")} disabled={props.isSaving || !draft.title.trim()}>{props.isSaving ? "Saving" : props.isNew ? "Add event" : "Save"}</button>
      </div>
    </form>
  );
}
