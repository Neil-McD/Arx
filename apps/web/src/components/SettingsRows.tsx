import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode, SelectHTMLAttributes } from "react";

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

// Buttons: at most one primary on a page; secondary for everything else;
// quiet for small things (Remove); danger only in the Danger zone.
export type SettingsButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export function settingsButtonClass(variant: SettingsButtonVariant = "secondary") {
  return `settings-v1-button${variant === "secondary" ? "" : ` is-${variant}`}`;
}
export function SettingsButton({ variant, className, type, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: SettingsButtonVariant }) {
  return <button {...rest} type={type ?? "button"} className={`${settingsButtonClass(variant)}${className ? ` ${className}` : ""}`} />;
}

// One of 2–4 short options, all worth seeing at once (Theme; Free / Monthly / Annual).
export function SettingsSegmented<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { id: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  // A radio group's keyboard: one tab stop (the selected option), arrows and
  // Home/End move and select, skipping disabled options.
  const enabled = props.options.filter((option) => !option.disabled);
  const tabStop = enabled.some((option) => option.id === props.value) ? props.value : enabled[0]?.id;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = enabled.findIndex((option) => option.id === props.value);
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? enabled[(at + 1) % enabled.length]
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? enabled[(at - 1 + enabled.length) % enabled.length]
      : event.key === "Home" ? enabled[0] : event.key === "End" ? enabled[enabled.length - 1] : null;
    if (!next) return;
    event.preventDefault();
    if (next.id !== props.value) props.onChange(next.id);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-segment="${next.id}"]`)?.focus();
  };
  return (
    <div className="settings-v1-segmented" role="radiogroup" aria-label={props.label} onKeyDown={onKeyDown}>
      {props.options.map((option) => (
        <button key={option.id} type="button" role="radio" data-segment={option.id} aria-checked={props.value === option.id} disabled={option.disabled}
          tabIndex={option.id === tabStop ? 0 : -1}
          className={`settings-v1-segment${props.value === option.id ? " is-on" : ""}`}
          onClick={() => { if (props.value !== option.id) props.onChange(option.id); }}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

// One of many (5+), or long labels: a native select, drawn like the inputs.
export function SettingsSelect({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={`settings-v1-input settings-v1-select${className ? ` ${className}` : ""}`} />;
}

// Several from a list (a plan's pods).
export function SettingsCheckbox(props: { checked: boolean; label: ReactNode; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`settings-v1-checkbox${props.disabled ? " is-disabled" : ""}`}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(event) => props.onChange(event.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}
