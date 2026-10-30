import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const STORAGE_PREFIX = "pn-your-settings-fold:";

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + id);
    return stored === null ? fallback : stored === "1";
  } catch {
    return fallback;
  }
}

// A settings card that folds shut, like the grouped sections on Substack's
// settings page: the title and a one-line summary stay, the controls hide.
// Each fold remembers on this device whether it was left open.
export function WebSettingsFold(props: {
  id: string;
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(props.id, props.defaultOpen ?? false));
  const bodyId = useId();
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_PREFIX + props.id, next ? "1" : "0");
    } catch {
      // Private windows: the fold still works, it just isn't remembered.
    }
  };
  return (
    <section className={`settings-section pn-settings-card pn-settings-fold${open ? " is-open" : ""}`}>
      <button type="button" className="pn-settings-fold-head" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
        <span className="pn-settings-fold-text">
          <span className="settings-section-title">{props.title}</span>
          {props.summary ? <span className="pn-settings-fold-summary">{props.summary}</span> : null}
        </span>
        <ChevronDown className="pn-settings-fold-chevron" size={18} aria-hidden="true" />
      </button>
      <div id={bodyId} className="pn-settings-fold-body" hidden={!open}>
        {props.children}
      </div>
    </section>
  );
}
