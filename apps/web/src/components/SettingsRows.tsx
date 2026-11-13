import type { ReactNode } from "react";

// One Settings page (design v1), after Linear's settings: plain groups with a
// small label, and rows with the name (and at most one short line) on the left
// and the control on the right. No cards inside cards, no repeated titles.
export function SettingsGroup(props: { label?: string; tone?: "danger"; children: ReactNode }) {
  return (
    <section className={`settings-v1-group${props.tone === "danger" ? " is-danger" : ""}`}>
      {props.label ? <div className="settings-v1-group-label">{props.label}</div> : null}
      <div className="settings-v1-rows">{props.children}</div>
    </section>
  );
}

// `stacked` puts the control under the text (a long text box).
export function SettingsRow(props: { label: string; help?: ReactNode; stacked?: boolean; htmlFor?: string; children?: ReactNode }) {
  return (
    <div className={`settings-v1-row${props.stacked ? " is-stacked" : ""}`}>
      <div className="settings-v1-row-text">
        {props.htmlFor
          ? <label className="settings-v1-row-label" htmlFor={props.htmlFor}>{props.label}</label>
          : <div className="settings-v1-row-label">{props.label}</div>}
        {props.help ? <div className="settings-v1-row-help">{props.help}</div> : null}
      </div>
      {props.children !== undefined ? <div className="settings-v1-row-control">{props.children}</div> : null}
    </div>
  );
}

export function SettingsSwitch(props: { checked: boolean; label: string; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      className={`settings-v1-switch${props.checked ? " is-on" : ""}`}
      onClick={() => props.onChange(!props.checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}

// "Saving…" / "Saved" / an error, beside the page title.
export function SettingsSaveStatus(props: { saving: boolean; dirty: boolean; error?: string | null }) {
  const text = props.error ? props.error : props.saving ? "Saving…" : props.dirty ? "Unsaved" : "Saved";
  return <span className={`settings-v1-status${props.error ? " is-error" : ""}`} role="status" aria-live="polite">{text}</span>;
}

// The page's one title, with an optional status (Saved…) at its right.
export function SettingsPageHead(props: { title: string; status?: ReactNode }) {
  return (
    <div className="settings-page-head">
      <h1 className="settings-page-title">{props.title}</h1>
      {props.status ?? null}
    </div>
  );
}

// A short line under a group (a fee note, an empty state).
export function SettingsNote(props: { children: ReactNode; tone?: "error" }) {
  return <p className={`settings-v1-note${props.tone === "error" ? " is-error" : ""}`} role={props.tone === "error" ? "alert" : undefined}>{props.children}</p>;
}
