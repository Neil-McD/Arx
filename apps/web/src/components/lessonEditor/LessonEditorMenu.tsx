import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

// A small menu under a button: the toolbar's menus and a callout's type switch.
export type ToolbarMenu = { key: string; rect: DOMRect } | null;

export function ToolbarMenuList(props: {
  menu: NonNullable<ToolbarMenu>;
  items: { key: string; title: string; hint?: string; icon: ReactNode; active?: boolean; run: () => void }[];
  host: HTMLElement | null;
  label: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && ref.current?.contains(event.target as Node)) return;
      props.onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", close);
    };
  });
  // Below the button, or above it when there isn't room, and never off screen.
  const [top, setTop] = useState(props.menu.rect.bottom + 6);
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    const below = props.menu.rect.bottom + 6;
    const above = props.menu.rect.top - 6 - height;
    const fits = below + height <= window.innerHeight - 8;
    setTop(fits || above < 8 ? Math.max(8, Math.min(below, window.innerHeight - 8 - height)) : above);
  }, [props.menu.rect, props.items.length]);
  const style = {
    left: Math.max(8, Math.min(props.menu.rect.left, window.innerWidth - 268)),
    top,
  };
  return createPortal(
    <div ref={ref} className="lesson-editor-menu lesson-editor-toolbar-menu" style={style} role="menu" aria-label={props.label}>
      {props.items.map((item) => (
        <button
          key={item.key}
          type="button"
          role={item.active === undefined ? "menuitem" : "menuitemradio"}
          aria-checked={item.active}
          className={`lesson-editor-menu-item${item.hint ? "" : " is-compact"}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            item.run();
            props.onClose();
          }}
        >
          <span className="lesson-editor-menu-icon" aria-hidden="true">{item.icon}</span>
          <span className="lesson-editor-menu-text">
            <strong>{item.title}</strong>
            {item.hint ? <small>{item.hint}</small> : null}
          </span>
          {item.active ? <Check className="lesson-editor-menu-check" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>,
    props.host?.closest<HTMLElement>("[data-community-theme]") ?? document.body,
  );
}
