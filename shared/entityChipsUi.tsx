import { createContext, useContext, useMemo, type MouseEvent, type ReactNode } from "react";
import { resolveAuthSubject, type AuthSessionLike } from "./authSession";
import { useLiveQuery } from "./liveQuery";
import { buildEntityNameIndex, matchEntityName, type EntityKind, type EntityNameRow, type EntityTarget } from "./entityChips";

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

export function EntityChip(props: { target: EntityTarget; label: ReactNode; navigate: (path: string) => void }) {
  const { target } = props;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    props.navigate(target.path);
  };
  return (
    <a className={`entity-chip is-${target.kind}`} href={target.path} onClick={onClick} data-entity-kind={target.kind}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[target.kind]}
      </svg>
      <span className="entity-chip-name">{props.label}</span>
    </a>
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
