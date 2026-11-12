// Design system v1: the command palette (the mock's, behind "Search or ask"
// and ⌘K). Where to go, what to ask the guide, and the other communities;
// typing narrows them and Enter on the last row asks the guide as typed.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { paletteItems, paletteSections, type PaletteCommunity, type PaletteItem, type PalettePlace } from "../../../../shared/commandPalette";
import { askGuide, registerCommandPalette } from "../components/guideSearch";
import { cx, Icon, KitApp } from "./kit";

export type PaletteActions = {
  openPlace: (id: string) => void;
  openCommunity: (id: string) => void;
};

export function KitCommandPalette(props: {
  places: PalettePlace[];
  suggestions: string[];
  communities: PaletteCommunity[];
  actions: PaletteActions;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hot, setHot] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => registerCommandPalette(() => setOpen((current) => !current)), []);
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setHot(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => returnFocusRef.current?.focus?.();
  }, [open]);

  const sections = useMemo(
    () => paletteSections({ query, places: props.places, suggestions: props.suggestions, communities: props.communities }),
    [query, props.places, props.suggestions, props.communities],
  );
  const items = useMemo(() => paletteItems(sections), [sections]);
  useEffect(() => { setHot(0); }, [query]);

  if (!open) return null;

  const close = () => setOpen(false);
  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    close();
    if (item.kind === "place") props.actions.openPlace(item.id);
    else if (item.kind === "community") props.actions.openCommunity(item.id);
    else askGuide(item.question);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setHot((index) => (items.length ? (index + 1) % items.length : 0)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setHot((index) => (items.length ? (index - 1 + items.length) % items.length : 0)); }
    else if (event.key === "Enter") { event.preventDefault(); run(items[hot]); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
  };

  let index = -1;
  return createPortal(
    <KitApp view="home" part="palette">
      <div className={cx("veil")} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div className={cx("pal")} role="dialog" aria-modal="true" aria-label="Search or ask your guide" onKeyDown={onKeyDown}>
          <div className={cx("q")}>
            <Icon name="search" />
            <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search or ask your guide" aria-label="Search or ask your guide"
              role="combobox" aria-expanded="true" aria-controls="kit-palette-list"
              aria-activedescendant={items[hot] ? `kit-palette-${items[hot].id}` : undefined} />
          </div>
          <div className={cx("res")} id="kit-palette-list" role="listbox">
            {sections.map((section) => (
              <div key={section.key} className={cx("g")} role="group" aria-label={section.label}>
                <span className={cx("lab")}>{section.label}</span>
                {section.items.map((item) => {
                  index += 1;
                  const position = index;
                  return (
                    <button key={item.id} type="button" id={`kit-palette-${item.id}`} role="option" aria-selected={position === hot}
                      className={cx("opt", item.kind === "ask" && "askg", position === hot && "hot")}
                      onMouseEnter={() => setHot(position)} onClick={() => run(item)}>
                      {item.kind === "place" ? <Icon name={item.icon} /> : null}
                      {item.kind === "ask" ? <Icon name="spark" /> : null}
                      {item.kind === "community" ? <span className={cx("mark", "pal-mark")}>{item.initials}</span> : null}
                      <span className={cx("opt-label")}>{item.kind === "ask" && section.items.length === 1 && query.trim() ? <>Ask: <b>{item.label}</b></> : item.label}</span>
                      {item.kind !== "ask" && item.hint ? <em>{item.hint}</em> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className={cx("foot")}><span><kbd>↵</kbd>open</span><span><kbd>↑↓</kbd>move</span><span><kbd>esc</kbd>close</span></div>
        </div>
      </div>
    </KitApp>,
    document.body,
  );
}
