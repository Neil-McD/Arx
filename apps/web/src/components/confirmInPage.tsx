import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// A Polynet confirm in place of window.confirm: same question, the
// community's own look (it carries the theme), Escape or Cancel says no.
export function confirmInPage(options: { title: string; body: string; confirmLabel: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    const theme = document.querySelector<HTMLElement>("[data-community-theme]")?.dataset.communityTheme;
    if (theme) host.dataset.communityTheme = theme;
    host.className = "confirm-in-page-host";
    document.body.appendChild(host);
    const root = createRoot(host);
    const finish = (answer: boolean) => {
      root.unmount();
      host.remove();
      resolve(answer);
    };
    root.render(<ConfirmDialog {...options} onAnswer={finish} />);
  });
}

function ConfirmDialog(props: { title: string; body: string; confirmLabel: string; onAnswer: (answer: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onAnswer(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [props]);
  return (
    <div className="community-channel-modal-backdrop confirm-in-page" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onAnswer(false); }}>
      <div className="community-channel-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-in-page-title" aria-describedby="confirm-in-page-body">
        <div className="community-channel-modal-header">
          <div>
            <h2 id="confirm-in-page-title">{props.title}</h2>
            <p id="confirm-in-page-body">{props.body}</p>
          </div>
        </div>
        <div className="community-channel-modal-actions">
          <button type="button" onClick={() => props.onAnswer(false)}>Cancel</button>
          <button type="button" className="is-primary" ref={confirmRef} onClick={() => props.onAnswer(true)}>{props.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// A short note at the bottom of the page ("Pinned to pod"), gone after a
// moment. One at a time: a new note replaces the last.
let toastHost: HTMLDivElement | null = null;
let toastTimer = 0;
export function toastInPage(message: string): void {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "app-toast toast-in-page";
    toastHost.setAttribute("role", "status");
    toastHost.setAttribute("aria-live", "polite");
    document.body.appendChild(toastHost);
  }
  const theme = document.querySelector<HTMLElement>("[data-community-theme]")?.dataset.communityTheme;
  if (theme) toastHost.dataset.communityTheme = theme;
  const inner = document.createElement("div");
  inner.className = "app-toast-inner";
  inner.textContent = message;
  toastHost.replaceChildren(inner);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastHost?.remove();
    toastHost = null;
  }, 2200);
}
