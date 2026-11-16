// Events (Nov 16 mock): a host adds or changes an event with a plain form,
// in the right column where the event you pick shows (a narrow window gives
// it the page). No sentence to type and no pop-up: a name, when, how often,
// where, what to know, and whether the public page shows it.
import { type FormEvent } from "react";
import type { EventDraft } from "../components/WebCommunityEventsSection";
import { cx } from "./kit";

type Choice<T extends string> = { value: T; label: string };
function Seg<T extends string>(props: { label: string; value: T; choices: Array<Choice<T>>; onChange: (value: T) => void }) {
  return (
    <div className={cx("evseg")} role="radiogroup" aria-label={props.label}>
      {props.choices.map((choice) => (
        <button key={choice.value} type="button" role="radio" aria-checked={props.value === choice.value} className={cx(props.value === choice.value && "on")}
          onClick={() => props.onChange(choice.value)}>{choice.label}</button>
      ))}
    </div>
  );
}

export function KitEventForm(props: {
  draft: EventDraft;
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
  const submit = (event: FormEvent) => { event.preventDefault(); if (!props.isSaving) props.onSubmit(); };
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => onChange({ ...draft, [key]: value });
  const heading = props.isNew ? "Add an event" : props.isSeries ? "Change every date" : "Change this event";

  return (
    <form className={cx("evp")} aria-label={heading} aria-busy={props.isSaving}
      onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape" && !props.isSaving) { event.stopPropagation(); props.onClose(); } }}>
      <header><span className={cx("lab")}>{props.isNew ? "New event" : props.isSeries ? "A repeating event" : "Event"}</span><h2>{heading}</h2></header>
      <div className={cx("evparts one")}>
        <label><span>Name</span><input value={draft.title} onChange={(event) => set("title", event.target.value)} placeholder="Weekly call" autoFocus /></label>
        <label><span>Starts</span><input type="datetime-local" value={draft.starts_at} onChange={(event) => set("starts_at", event.target.value)} /></label>
        <label><span>Ends</span><input type="datetime-local" value={draft.ends_at} onChange={(event) => set("ends_at", event.target.value)} /></label>
        <label><span>Time zone</span>
          <select value={draft.timezone} onChange={(event) => set("timezone", event.target.value)}>
            {props.timeZones.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
          </select>
        </label>
        <div className={cx("evfield")}><span>Repeats</span>
          <Seg label="Repeats" value={draft.recurrence_frequency} onChange={(value) => onChange({ ...draft, recurrence_frequency: value, recurrence_until: value === "none" ? "" : draft.recurrence_until })}
            choices={[{ value: "none", label: "Once" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
        </div>
        {draft.recurrence_frequency !== "none" ? (
          <label><span>Last date (leave empty to keep going)</span><input type="datetime-local" value={draft.recurrence_until} onChange={(event) => set("recurrence_until", event.target.value)} /></label>
        ) : null}
        <div className={cx("evfield")}><span>Where</span>
          {/* Not decided: the place named before goes too, or members would still see it. */}
          <Seg label="Where" value={draft.location_type} onChange={(value) => onChange({ ...draft, location_type: value, location_label: value === "tbd" ? "" : draft.location_label })}
            choices={[{ value: "online", label: "Online" }, { value: "physical", label: "A place" }, { value: "tbd", label: "To be decided" }]} />
        </div>
        {draft.location_type !== "tbd" ? (
          <label><span>{draft.location_type === "physical" ? "Address or place" : "What it's on"}</span>
            <input value={draft.location_label} onChange={(event) => set("location_label", event.target.value)} placeholder={draft.location_type === "physical" ? "The Foundry, 12 Mill St" : "Zoom"} /></label>
        ) : null}
        <label><span>{draft.location_type === "online" ? "Link to join" : "Link (if there is one)"}</span><input value={draft.url} onChange={(event) => set("url", event.target.value)} placeholder="https://" /></label>
        <label><span>What to know</span><textarea rows={3} value={draft.description_md} onChange={(event) => set("description_md", event.target.value)} placeholder="What should people bring or expect?" /></label>
        {props.canBePublic ? (
          <div className={cx("evswitch")}>
            <span>On {props.communityName ?? "the community"}'s public page<small>Visitors see the name, day and place. The link to join stays with members.</small></span>
            <button type="button" role="switch" aria-checked={draft.visibility === "public"} aria-label="Show on the public page"
              className={cx("evsw", draft.visibility === "public" && "on")} onClick={() => set("visibility", draft.visibility === "public" ? "members" : "public")}><i /></button>
          </div>
        ) : null}
      </div>
      {props.error ? <div className={cx("everr")} role="alert">{props.error}</div> : null}
      <div className={cx("evp-foot")}>
        <div className={cx("two")}>
          <button type="submit" className={cx("btn go")} disabled={props.isSaving || !draft.title.trim()}>{props.isSaving ? "Saving…" : props.isNew ? "Add event" : "Save"}</button>
          <button type="button" className={cx("btn")} disabled={props.isSaving} onClick={props.onClose}>Cancel</button>
        </div>
        <span className={cx("evp-note")}>Members see it in their own time zone.</span>
      </div>
    </form>
  );
}
