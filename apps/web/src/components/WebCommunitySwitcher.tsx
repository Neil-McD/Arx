import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, Compass, Plus } from "lucide-react";
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
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

  const menu = isOpen ? (
        <div className="community-switcher-popover" id={menuId} role="menu" aria-label="Your communities">
          {props.communities.map((community) => {
            const isCurrent = String(community.slug ?? "") === props.selectedCommunitySlug;
            return (
              <button
                key={community.id}
                className="community-switcher-item"
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
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
          <div className="community-switcher-separator" role="separator" />
          <button className="community-switcher-item" type="button" role="menuitem" onClick={() => choose(props.onOpenDiscover)}>
            <span className="community-switcher-icon" aria-hidden="true"><Compass size={16} /></span>
            <span className="community-switcher-item-name">Discover communities</span>
          </button>
          <button className="community-switcher-item" type="button" role="menuitem" onClick={() => choose(props.onCreateCommunity)}>
            <span className="community-switcher-icon" aria-hidden="true"><Plus size={16} /></span>
            <span className="community-switcher-item-name">Start a community</span>
          </button>
        </div>
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
