import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Compass, Plus, Search } from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { CommunityLike } from "./webShellChromeShared";
import { Icon, KitApp, cx } from "../v1/kit";

export type WebCommunitySwitcherProps = {
  activeCommunityName: string;
  // The community's own mark, shown before its name (the mock's 28px tile).
  mark?: ReactNode;
  communities: CommunityLike[];
  selectedCommunitySlug: string | null;
  attentionById: Record<string, boolean>;
  onSelectCommunity: (community: CommunityLike) => void;
  onOpenDiscover: () => void;
  onCreateCommunity: () => void;
  // Design system v1, a community's own left column: the switcher is the
  // mock's banner card (docs/design/hifi-mock .cover), the banner behind the
  // name with the dark fade. Without a banner it is the mock's bare card.
  cover?: { bannerUrl: string | null; focusX?: number | null; focusY?: number | null } | null;
};

// Design system v1: the community's name on its banner is also how you move
// between communities. It replaces the rail of community icons: your
// communities (a dot where something is new), Discover, and starting one.
export function WebCommunitySwitcher(props: WebCommunitySwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The menu floats above the page, pinned under the switcher, so a menu
  // wider than the left column never makes the column scroll (Nov 13).
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  // A long list gets a search box; it takes focus when the menu opens.
  const searchable = props.communities.length > 6;
  useEffect(() => {
    if (!isOpen) { setAnchor(null); return; }
    const place = () => {
      const box = rootRef.current?.getBoundingClientRect();
      if (!box) return;
      // A collapsed left column is only an icon wide: open beside it instead.
      setAnchor(box.width < 120
        ? { top: box.top, left: box.right + 8, width: 264 }
        : { top: box.bottom + 2, left: box.left + 6, width: box.width - 12 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) { setQuery(""); return; }
    const frame = requestAnimationFrame(() => {
      if (searchRef.current) searchRef.current.focus();
      else popoverRef.current?.querySelector<HTMLButtonElement>(".community-switcher-item")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // The community you're in comes first; the rest keep their order.
  const listed = useMemo(() => {
    const current = props.communities.filter((community) => String(community.slug ?? "") === props.selectedCommunitySlug);
    const others = props.communities.filter((community) => String(community.slug ?? "") !== props.selectedCommunitySlug);
    const needle = query.trim().toLowerCase();
    const ordered = [...current, ...others];
    return needle ? ordered.filter((community) => String(community.name ?? "").toLowerCase().includes(needle)) : ordered;
  }, [props.communities, props.selectedCommunitySlug, query]);

  // Arrow keys move through the search box and every item; Enter picks.
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
      if (event.key === "Enter" && event.target === searchRef.current && listed[0]) {
        event.preventDefault();
        const first = listed[0];
        choose(() => props.onSelectCommunity(first));
      }
      return;
    }
    const stops = [
      ...(searchRef.current ? [searchRef.current] : []),
      ...Array.from(popoverRef.current?.querySelectorAll<HTMLButtonElement>(".community-switcher-item") ?? []),
    ];
    if (!stops.length) return;
    event.preventDefault();
    const at = stops.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? stops.length - 1
      : event.key === "ArrowDown" ? (at + 1) % stops.length
      : (at - 1 + stops.length) % stops.length;
    stops[next]?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const choose = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  const cover = props.cover ?? null;
  const percent = (value: number | null | undefined) => `${Math.round((Number.isFinite(value) ? Number(value) : 0.5) * 100)}%`;
  const trigger = cover ? (
    <button
      ref={triggerRef}
      className={`${cx("cover", !cover.bannerUrl && "bare")} community-switcher-cover${isOpen ? " is-open" : ""}`}
      type="button"
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-controls={isOpen ? menuId : undefined}
      title="Switch community"
      onClick={() => setIsOpen((open) => !open)}
    >
      {props.mark ? <span className={cx("mark")} aria-hidden="true">{props.mark}</span> : null}
      <span className="community-switcher-name">{props.activeCommunityName}</span>
      <span className={cx("sw")}><Icon name="updown" /></span>
    </button>
  ) : null;

  const menu = isOpen && anchor ? createPortal(
        <div className="community-switcher-popover is-floating" id={menuId} ref={popoverRef} onKeyDown={onMenuKeyDown}
          style={{ top: anchor.top, left: anchor.left, width: Math.max(264, anchor.width) }}>
          {searchable ? (
            <label className="community-switcher-search">
              <Search size={14} aria-hidden="true" />
              <input ref={searchRef} type="text" value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a community" aria-label="Find a community" autoComplete="off" spellCheck={false} />
            </label>
          ) : null}
          <div className="community-switcher-list" role="menu" aria-label="Your communities">
            {listed.map((community) => {
              const isCurrent = String(community.slug ?? "") === props.selectedCommunitySlug;
              return (
                <button
                  key={community.id}
                  className="community-switcher-item"
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  title={community.name}
                  onClick={() => choose(() => props.onSelectCommunity(community))}
                >
                  <CommunityAvatar
                    communityId={community.id}
                    visualIdentity={community.visual_identity}
                    className="community-switcher-avatar"
                    imageUrl={community.avatar_url}
                    focusX={community.avatar_focus_x}
                    focusY={community.avatar_focus_y}
                    zoom={community.avatar_zoom}
                    name={community.name}
                  />
                  <span className="community-switcher-item-name">{community.name}</span>
                  {isCurrent ? (
                    <Check size={15} aria-hidden="true" />
                  ) : props.attentionById[community.id] ? (
                    <span className="community-switcher-dot" aria-label="Something new" />
                  ) : null}
                </button>
              );
            })}
            {listed.length === 0 ? <p className="community-switcher-empty">No community matches “{query.trim()}”.</p> : null}
          </div>
          <div className="community-switcher-foot" role="menu" aria-label="More">
            <button className="community-switcher-item" type="button" role="menuitem" onClick={() => choose(props.onOpenDiscover)}>
              <span className="community-switcher-icon" aria-hidden="true"><Compass size={16} /></span>
              <span className="community-switcher-item-name">Discover communities</span>
            </button>
            <button className="community-switcher-item" type="button" role="menuitem" onClick={() => choose(props.onCreateCommunity)}>
              <span className="community-switcher-icon" aria-hidden="true"><Plus size={16} /></span>
              <span className="community-switcher-item-name">Start a community</span>
            </button>
          </div>
        </div>,
        document.body,
  ) : null;

  if (cover) {
    return (
      <KitApp
        view="home"
        part="cover"
        banner={cover.bannerUrl}
        bannerPosition={`${percent(cover.focusX)} ${percent(cover.focusY)}`}
      >
        <div className="community-switcher is-cover" ref={rootRef}>
          {trigger}
          {menu}
        </div>
      </KitApp>
    );
  }

  return (
    <div className="community-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        className={`community-switcher-trigger${isOpen ? " is-open" : ""}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        title="Switch community"
        onClick={() => setIsOpen((open) => !open)}
      >
        {props.mark ? <span className="community-switcher-mark" aria-hidden="true">{props.mark}</span> : null}
        <span className="community-switcher-name">{props.activeCommunityName}</span>
        <ChevronsUpDown size={15} aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}
