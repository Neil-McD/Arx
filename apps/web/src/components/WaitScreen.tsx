// Every in-between moment looks the same (Neil, Nov 26): the page's own
// colour, the Polynet mark, and one short line. Waiting, the mark breathes
// ("Opening Polynet…", "Taking you to sign in…"). Something failed, the line
// says what in plain words and there is one button. Styled in base.css, so it
// works before the rest of the app has loaded.

export function WaitMark() {
  return (
    <svg className="wait-mark" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="M12 11.5 7 6.5M12 11.5 17.5 6M12 11.5 5 16M12 11.5 19.5 14.5M12 11.5 13.5 19.5M17.5 6 19.5 14.5 13.5 19.5M7 6.5 5 16" />
      </g>
      <g fill="currentColor">
        <circle cx="12" cy="11.5" r="2.7" />
        <circle cx="7" cy="6.5" r="2" />
        <circle cx="17.5" cy="6" r="2" />
        <circle cx="5" cy="16" r="2" />
        <circle cx="19.5" cy="14.5" r="2" />
        <circle cx="13.5" cy="19.5" r="2" />
      </g>
    </svg>
  );
}

export function WaitScreen(props: {
  // One short line. Empty while the app is first loading: the mark alone.
  line?: string;
  // Something went wrong: the line is the problem, this is the one way on.
  action?: { label: string; onClick: () => void };
  // Over the app (it stays drawn, dimmed, behind) instead of a page of its own.
  overlay?: boolean;
  // Inside one part of the app (a page that didn't load), not the whole window.
  inline?: boolean;
  // Only shows if the wait lasts more than a moment, so fast loads never flash.
  delayed?: boolean;
}) {
  const failed = Boolean(props.action);
  return (
    <div
      className={["wait-screen", props.overlay ? "is-overlay" : "", props.inline ? "is-inline" : "", props.delayed ? "is-delayed" : "", failed ? "is-failed" : ""].filter(Boolean).join(" ")}
      role={failed ? "alert" : "status"}
      aria-live="polite"
      aria-busy={!failed}
    >
      <WaitMark />
      {props.line ? <p className="wait-line">{props.line}</p> : null}
      {props.action ? (
        <button type="button" className="wait-action" onClick={props.action.onClick}>{props.action.label}</button>
      ) : null}
    </div>
  );
}
