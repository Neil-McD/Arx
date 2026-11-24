import { createContext, useContext, useMemo, type MouseEvent, type ReactNode } from "react";
import type React from "react";
import { Boxes, CalendarDays, House, Inbox, Library, Users } from "lucide-react";
import { resolveAuthSubject, type AuthSessionLike } from "./authSession";
import { useLiveQuery } from "./liveQuery";
import { buildEntityNameIndex, cardAction, cardLines, chipFact, matchEntityName, type EntityKind, type EntityNameRow, type EntityTarget, type PageId } from "./entityChips";
import { useHoverIntent } from "./useHoverIntent";

// Chips in the guide's replies (docs/specs/guide-chips-end-state.md, slice 1).
// The app holds one list of what the reader can open in the community they
// are in; text the guide wrote is marked with <GuideVoice>; inside it, a bold
// phrase that names exactly one of those things renders as a chip.

type EntityIndexValue = {
  index: ReadonlyMap<string, EntityTarget>;
  navigate: (path: string) => void;
};

const EntityIndexContext = createContext<EntityIndexValue | null>(null);
const GuideVoiceContext = createContext(false);
// Whether a chip may open its card here. Off where the text around it clips
// what sticks out (a folded brief), so a card is never shown cut off.
const ChipCardsContext = createContext(true);
export function ChipCards(props: { on: boolean; children: ReactNode }) {
  return <ChipCardsContext.Provider value={props.on}>{props.children}</ChipCardsContext.Provider>;
}

export function EntityNamesProvider(props: {
  session: unknown;
  communityId: string | null | undefined;
  communitySlug: string | null | undefined;
  navigate: (path: string) => void;
  children: ReactNode;
}) {
  const subject = props.session ? resolveAuthSubject(props.session as AuthSessionLike) : null;
  const communityId = String(props.communityId ?? "").trim();
  const { data } = useLiveQuery<{ entries: EntityNameRow[] }>(
    props.session,
    "communityEntityNames:listEntityNamesForViewer",
    subject && communityId ? { authSubject: subject, communityId } : null,
  );
  const { navigate } = props;
  const value = useMemo<EntityIndexValue | null>(() => {
    const index = buildEntityNameIndex(props.communitySlug, data?.entries);
    return index.size ? { index, navigate } : null;
  }, [data, props.communitySlug, navigate]);
  return <EntityIndexContext.Provider value={value}>{props.children}</EntityIndexContext.Provider>;
}

// The same, for an index already in hand (tests, the design lab).
export function EntityIndexProvider(props: { index: ReadonlyMap<string, EntityTarget>; navigate: (path: string) => void; children: ReactNode }) {
  const { index, navigate } = props;
  const value = useMemo<EntityIndexValue | null>(() => (index.size ? { index, navigate } : null), [index, navigate]);
  return <EntityIndexContext.Provider value={value}>{props.children}</EntityIndexContext.Provider>;
}

// Wraps text the guide wrote. Only there do bold names become chips.
export function GuideVoice(props: { children: ReactNode }) {
  return <GuideVoiceContext.Provider value>{props.children}</GuideVoiceContext.Provider>;
}

// The words of a bold run, when they are plain text.
export function plainTextOf(children: ReactNode): string | null {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) {
    const parts = children.map(plainTextOf);
    return parts.every((part) => part !== null) ? parts.join("") : null;
  }
  return null;
}

const ICONS: Record<EntityKind, ReactNode> = {
  course: <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
  lesson: <><circle cx="12" cy="12" r="10" /><path d="m10 8 6 4-6 4z" /></>,
  channel: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  pod: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  event: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  page: <path d="M9 18l6-6-6-6" />,
};

// A page's chip carries the icon that page has in the left column.
const PAGE_ICONS: Record<PageId, typeof House> = {
  home: House,
  inbox: Inbox,
  knowledge: Library,
  events: CalendarDays,
  pods: Boxes,
  members: Users,
};

const CHIP_SCROLL_AREAS = ".community-interaction-feed-scroll, .community-interaction-drawer-scroll, .community-agent-dock-transcript";

export function EntityChip(props: { target: EntityTarget; label: ReactNode; navigate: (path: string) => void }) {
  const { target } = props;
  // Placed against the scrolling area the reply sits in (channel feed, thread,
  // Home chat), so the card never opens where that area cuts it off.
  const cards = useContext(ChipCardsContext);
  const hover = useHoverIntent<HTMLSpanElement>({ enabled: cards, maxCardHeight: 240, viewportSelector: CHIP_SCROLL_AREAS });
  const go = (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    hover.closeNow();
    props.navigate(path);
  };
  const lines = cardLines(target);
  const PageIcon = target.kind === "page" && target.page ? PAGE_ICONS[target.page] : null;
  const action = cardAction(target);
  const progress = target.kind === "course" && (target.facts?.lessons ?? 0) > 0
    ? Math.round(100 * Math.min(target.facts?.done ?? 0, target.facts?.lessons ?? 0) / (target.facts?.lessons ?? 1))
    : null;
  return (
    <span
      className="entity-chip-wrap"
      ref={hover.anchorRef}
      onMouseEnter={hover.openHover}
      onMouseLeave={hover.scheduleClose}
      // Keyboard: the card stays open while focus is anywhere inside it (the
      // chip or the card's action) and closes when focus leaves both.
      onFocus={hover.openHover}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hover.scheduleClose();
      }}
      onKeyDown={(event) => { if (event.key === "Escape") hover.closeNow(); }}
    >
      <a
        className={`entity-chip is-${target.kind}`}
        href={target.path}
        onClick={go(target.path)}
        data-entity-kind={target.kind}
      >
        {PageIcon ? <PageIcon aria-hidden="true" strokeWidth={2} /> : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[target.kind]}
          </svg>
        )}
        <span className="entity-chip-name">{props.label}</span>
      </a>
      <span
          ref={hover.cardRef as unknown as React.Ref<HTMLSpanElement>}
          className={`entity-card${hover.open ? " is-open" : ""}`}
          data-placement={hover.placement}
          style={{ left: hover.shift }}
          role="group"
          aria-label={`${target.name} preview`}
          onMouseEnter={hover.openHover}
          onMouseLeave={hover.scheduleClose}
        >
          <span className="entity-card-name">{target.name}</span>
          {lines.map((line, index) => <span key={index} className="entity-card-line">{line}</span>)}
          {progress !== null ? (
            <span className="entity-card-bar" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>
          ) : null}
          {target.kind === "course" && progress !== null ? (
            <span className="entity-card-line">{`${Math.min(target.facts?.done ?? 0, target.facts?.lessons ?? 0)} of ${target.facts?.lessons} done`}</span>
          ) : null}
          {target.items?.length ? (
            <span className="entity-card-items">
              {target.items.map((item) => {
                const itemFact = chipFact(item);
                return (
                  <a key={item.path} className="entity-card-item" href={item.path} onClick={go(item.path)} tabIndex={hover.open ? 0 : -1}>
                    <span className="entity-card-item-name">{item.name}</span>
                    {itemFact ? <span className="entity-card-item-fact">{itemFact}</span> : null}
                  </a>
                );
              })}
            </span>
          ) : null}
          <a className="entity-card-action" href={action.path} onClick={go(action.path)} tabIndex={hover.open ? 0 : -1}>{action.label} →</a>
      </span>
    </span>
  );
}

// Bold text: a chip when the guide named one thing the reader can open,
// otherwise the bold words as they were.
export function StrongOrChip(props: { text: string | null; children: ReactNode }) {
  const guide = useContext(GuideVoiceContext);
  const entities = useContext(EntityIndexContext);
  const target = guide && entities && props.text !== null ? matchEntityName(entities.index, props.text) : null;
  if (!target || !entities) return <strong>{props.children}</strong>;
  return <EntityChip target={target} label={String(props.text ?? "").replace(/^#\s*/, "").trim()} navigate={entities.navigate} />;
}
