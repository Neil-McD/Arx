// Design system v1 kit: the hi-fi mock (docs/design/hifi-mock) as React
// components. Markup and class names follow the mock exactly, and the styles
// are the mock's own stylesheet turned into a CSS Module
// (scripts/design/build_v1_kit_css.py), so nothing in the app's older CSS can
// reach these elements and nothing here can leak out.
import { forwardRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import k from "./kit.module.css";

export function cx(...names: Array<string | false | null | undefined>): string {
  return names
    .filter((name): name is string => Boolean(name))
    .flatMap((name) => name.split(" "))
    .map((name) => k[name] ?? name)
    .join(" ");
}

// The mock's icon set (docs/design/hifi-mock/lib.py), drawn the same way.
const ICON_PATHS: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  stars: '<circle cx="6" cy="7" r="1.6"/><circle cx="17" cy="5" r="1.6"/><circle cx="12" cy="13" r="2"/><circle cx="5" cy="18" r="1.6"/><circle cx="19" cy="17" r="1.6"/><path d="M7.3 8.1 10.5 11.6M15.8 6.2 13.3 11.4M10.5 14.4 6.4 17.1M13.9 14 17.6 16.4"/>',
  cal: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  spark: '<path d="M12 2.5 14.1 9.4 21 11.5l-6.9 2.1L12 20.5l-2.1-6.9L3 11.5l6.9-2.1z"/>',
  updown: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
  up: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  mic: '<rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5 10.5v.5a7 7 0 0 0 14 0v-.5M12 18v3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 1.5 3.5 1.5 3.5-1.5 3.5-1.5M9 9.5h.01M15 9.5h.01"/>',
  sliders: '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  check: '<path d="M5 12.5 10 17.5 19 7"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21a2 2 0 0 1 2-2h13v2H6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};

export type IconName = keyof typeof ICON_PATHS;

export function Icon(props: { name: IconName; extra?: string }) {
  return (
    <svg
      className={cx("ic", props.extra)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      // Constant paths from the mock's icon set; no outside input.
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[props.name] }}
    />
  );
}

export function PolynetMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
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

// ---------- the frame ----------

// The app's theme (shared/theme.ts sets data-theme on <html>), read live so a
// part of a page follows the theme when it changes.
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
function readLightTheme() {
  return document.documentElement.getAttribute("data-theme") === "light";
}
export function useAppLightTheme(): boolean {
  return useSyncExternalStore(subscribeToTheme, readLightTheme, () => false);
}

// True while the window is at least `px` wide (the app's desktop is 721).
export function useMinWidth(px: number): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(`(min-width: ${px}px)`);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(`(min-width: ${px}px)`).matches,
    () => false,
  );
}

export type KitView = "home" | "inbox" | "wins" | "know" | "events" | "members" | "guide" | "manage";

export function KitApp(props: {
  view: KitView;
  host?: boolean;
  light?: boolean;
  banner?: string | null;
  bannerPosition?: string;
  aura?: number;
  // The mock is drawn 900px tall; in the app the frame fills the window.
  fillWindow?: boolean;
  // Design lab only: draw everything this many times larger, to try sizes.
  scale?: number;
  // One part of a page (its middle, or its right column) inside the app's
  // own frame, rather than the mock's whole window.
  part?: "main" | "rail" | "flow" | "cover" | "palette";
  // The guide conversation is open on Home (the mock's "Talk it over").
  talking?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const appLight = useAppLightTheme();
  // A part of a page takes the app's theme unless told otherwise.
  const light = props.light ?? (props.part ? appLight : false);
  const style: CSSProperties & Record<string, string> = {};
  if (props.fillWindow) style.height = props.scale && props.scale !== 1 ? `calc(100vh / ${props.scale})` : "100vh";
  if (props.scale && props.scale !== 1) style.zoom = String(props.scale);
  if (props.banner) style["--banner"] = `url(${props.banner})`;
  if (props.bannerPosition) style["--bpos"] = props.bannerPosition;
  if (props.aura !== undefined) style["--aura"] = String(props.aura);
  return (
    <div
      className={[
        cx("app", `on-v-${props.view}`, props.host && "host", light && "light", props.part && "part", props.part === "rail" && "rail-part", props.part === "flow" && "flow-part", props.part === "cover" && "cover-part", props.part === "palette" && "palette-part", props.talking && "on-t-on"),
        props.className,
      ].filter(Boolean).join(" ")}
      style={style}
    >
      {props.children}
    </div>
  );
}

// ---------- the left column ----------

export function Side(props: { children: ReactNode }) {
  return <nav className={cx("side")} aria-label="Community">{props.children}</nav>;
}

export function Cover(props: { name: string; mark?: ReactNode; bare?: boolean; onSwitch?: () => void }) {
  return (
    <button type="button" className={cx("cover", props.bare && "bare")} onClick={props.onSwitch} aria-label={`${props.name}, switch community`}>
      <span className={cx("mark")}>{props.mark ?? <PolynetMark />}</span>
      <span>{props.name}</span>
      <span className={cx("sw")}><Icon name="updown" /></span>
    </button>
  );
}

export function Spacer(props: { height: number }) {
  return <div style={{ height: props.height }} />;
}

export function NavRow(props: {
  icon: IconName;
  label: string;
  view?: KitView;
  unread?: boolean;
  add?: boolean;
  hostOnly?: boolean;
  hint?: string;
  count?: number;
  dot?: boolean;
  live?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={cx("row", props.view && `n-${props.view}`, props.unread && "unread", props.add && "add", props.hostOnly && "h-only")}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
      {props.label}
      {props.count ? <span className={cx("count")}>{props.count}</span> : null}
      {props.hint ? <span className={cx("hint")}>{props.hint}</span> : null}
      {props.dot ? <span className={cx("dot")} /> : null}
      {props.live ? <span className={cx("live")}><i />{props.live}</span> : null}
    </button>
  );
}

export function Group(props: { children: ReactNode }) {
  return <div className={cx("grp")}>{props.children}</div>;
}

export function Foot(props: { children: ReactNode }) {
  return <div className={cx("foot")}>{props.children}</div>;
}

export function Me(props: { name: string; role: string; avatar: ReactNode; tone?: string; memberOnly?: boolean; hostOnly?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={cx("me", props.memberOnly && "m-only", props.hostOnly && "h-only")} onClick={props.onClick}>
      <span className={cx("av s", props.tone ?? "a2")}>{props.avatar}</span>
      <div><b>{props.name}</b><span>{props.role}</span></div>
      <span className={cx("sw")}><Icon name="updown" /></span>
    </button>
  );
}

// ---------- the middle ----------

export function Main(props: { children: ReactNode }) {
  return <main className={cx("main")}>{props.children}</main>;
}

// The page's header bar names it; Search or ask lives at the top of the left
// column (Linear-style), not here.
export function Top(props: { title?: ReactNode; titleView?: number }) {
  return (
    <>
      <header className={cx("top")}>
        {props.title ? <h1 className={cx(`t${props.titleView ?? 1}`)}>{props.title}</h1> : null}
      </header>
      <div className={cx("hline")} />
    </>
  );
}

export function View(props: { index: number; children: ReactNode }) {
  return <section className={cx("view", `v${props.index}`)}>{props.children}</section>;
}

export function HomeBody(props: { hostOnly?: boolean; memberOnly?: boolean; children: ReactNode }) {
  return <div className={cx("home", props.hostOnly && "h-only", props.memberOnly && "m-only")}>{props.children}</div>;
}

// `plain`: a community without its agent; just its name and the time.
export function Eyebrow(props: { community: string; time?: string; plain?: boolean }) {
  return (
    <div className={cx("eyebrow")}>
      {props.plain ? null : <Icon name="spark" />}{props.community}{props.plain ? "" : ", your guide"}{props.time ? <> <em>· {props.time}</em></> : null}
    </div>
  );
}

export function Hello(props: { greeting: string; line: string }) {
  return <p className={cx("hello")}>{props.greeting}<span>{props.line}</span></p>;
}

export function Since(props: { label: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={cx("since")} style={props.style}>
      <span className={cx("lab")}>{props.label}</span>
      {props.children}
    </div>
  );
}

export function SinceItem(props: { kind: string; learned?: boolean; title: string; detail: string; onOpen?: () => void; still?: boolean }) {
  const body = (
    <>
      <span className={cx("k", props.learned && "learn")}>{props.learned ? <Icon name="spark" /> : null}{props.kind}</span>
      <span><b>{props.title}</b>{props.detail ? <span className={cx("s")}>{props.detail}</span> : null}</span>
      {props.still ? <span /> : <span className={cx("go")}><Icon name="arrow" /></span>}
    </>
  );
  // A row that opens nothing is not a button (still).
  return props.still
    ? <div className={cx("item")}>{body}</div>
    : <button type="button" className={cx("item")} onClick={props.onOpen}>{body}</button>;
}

// The part of a page that scrolls (the kit's part mode).
export const Scroll = forwardRef<HTMLDivElement, { children: ReactNode }>(function Scroll(props, ref) {
  return <div className={cx("scroll")} ref={ref}>{props.children}</div>;
});

// The one thing that needs you, on Home.
export function Card(props: { label: string; note?: ReactNode; title: string; say: string; children?: ReactNode }) {
  return (
    <div className={cx("card")}>
      <div className={cx("meta")}><span>{props.label}</span>{props.note ? <span>{props.note}</span> : null}</div>
      <h2>{props.title}</h2>
      <p className={cx("say")}>{props.say}</p>
      {props.children ? <div className={cx("acts")}>{props.children}</div> : null}
    </div>
  );
}

// The conversation with the guide, on Home (shown while talking).
export function Talk(props: { children: ReactNode }) {
  return <div className={cx("talk")}>{props.children}</div>;
}

export function Mine(props: { children: ReactNode }) {
  return <div className={cx("mine")}>{props.children}</div>;
}

export function Theirs(props: { children: ReactNode }) {
  return (
    <div className={cx("theirs")}>
      <span className={cx("av s guide")}><Icon name="spark" /></span>
      <div>{props.children}</div>
    </div>
  );
}

export function Dock(props: { children: ReactNode }) {
  return <div className={cx("dock")}>{props.children}</div>;
}

export function Chips(props: { chips: string[]; hostOnly?: boolean; memberOnly?: boolean; onChip?: (chip: string) => void }) {
  return (
    <div className={cx("chips", props.hostOnly && "h-only", props.memberOnly && "m-only")}>
      {props.chips.map((chip) => (
        <button type="button" key={chip} className={cx("chip")} onClick={() => props.onChip?.(chip)}>{chip}</button>
      ))}
    </div>
  );
}

export function Ask(props: { placeholder: string; value?: string; onChange?: (value: string) => void; onSend?: () => void; guide?: boolean }) {
  return (
    <form className={cx("ask")} onSubmit={(event) => { event.preventDefault(); props.onSend?.(); }}>
      {props.guide ? <Icon name="spark" extra="sp" /> : null}
      <input type="text" placeholder={props.placeholder} value={props.value} onChange={(event) => props.onChange?.(event.target.value)} aria-label={props.placeholder} />
      <span className={cx("ib")}><Icon name="mic" /></span>
      <button type="submit" className={cx("send")} aria-label="Send"><Icon name="up" /></button>
    </form>
  );
}

// ---------- the right column ----------

export function Rail(props: { index: number | "T"; hostOnly?: boolean; memberOnly?: boolean; label: string; children: ReactNode }) {
  return (
    <aside className={cx("rail", `r${props.index}`, props.hostOnly && "h-only", props.memberOnly && "m-only")} aria-label={props.label}>
      {props.children}
    </aside>
  );
}

export function Figs(props: { figures: Array<{ label: string; value: string; note: string }> }) {
  return (
    <div className={cx("figs")}>
      {props.figures.map((figure) => (
        <div className={cx("fig")} key={figure.label}><span>{figure.label}</span><b>{figure.value}</b><em>{figure.note || " "}</em></div>
      ))}
    </div>
  );
}

export function Sep() {
  return <div className={cx("sep")} />;
}

export function Sec(props: { label?: string; children: ReactNode }) {
  return (
    <div className={cx("sec")}>
      {props.label ? <span className={cx("lab")}>{props.label}</span> : null}
      {props.children}
    </div>
  );
}

export function Btn(props: { children: ReactNode; go?: boolean; txt?: boolean; small?: boolean; disabled?: boolean; style?: CSSProperties; onClick?: () => void }) {
  return (
    <button type="button" className={cx("btn", props.go && "go", props.txt && "txt", props.small && "sm")} style={props.style} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

export function TextLink(props: { children: ReactNode; style?: CSSProperties; onClick?: () => void }) {
  return (
    <button type="button" className={cx("link")} style={props.style} onClick={props.onClick}>
      {props.children} <Icon name="arrow" />
    </button>
  );
}
