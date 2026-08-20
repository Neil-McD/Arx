import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Check, Compass, Plus } from "lucide-react";

import { CommunityAvatar } from "./CommunityAvatar";
import type { CommunityShellCommunity } from "./communityTypes";

export type CommunitySwitcherSupplementalAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
};

type CommunitySwitcherMenuProps = {
  presentation: "desktop" | "mobile";
  communities: CommunityShellCommunity[];
  selectedCommunitySlug: string | null;
  attentionByCommunityId?: Record<string, boolean>;
  isLoading?: boolean;
  onOpenDiscover: () => void;
  onOpenCreate: () => void;
  onSelectCommunity: (community: CommunityShellCommunity) => boolean | void;
  onDismiss?: () => void;
  supplementalActions?: CommunitySwitcherSupplementalAction[];
};

function moveMenuFocus(
  event: KeyboardEvent<HTMLDivElement>,
  direction: -1 | 1 | "first" | "last",
) {
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not([disabled])',
    ),
  );
  if (items.length === 0) return;
  const activeIndex = items.indexOf(
    document.activeElement as HTMLButtonElement,
  );
  const nextIndex =
    direction === "first"
      ? 0
      : direction === "last"
        ? items.length - 1
        : activeIndex < 0
          ? direction === 1
            ? 0
            : items.length - 1
          : (activeIndex + direction + items.length) % items.length;
  event.preventDefault();
  items[nextIndex]?.focus();
}

export function CommunitySwitcherMenu({
  presentation,
  communities,
  selectedCommunitySlug,
  attentionByCommunityId = {},
  isLoading = false,
  onOpenDiscover,
  onOpenCreate,
  onSelectCommunity,
  onDismiss,
  supplementalActions = [],
}: CommunitySwitcherMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isMobile = presentation === "mobile";

  useEffect(() => {
    if (isMobile) return;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile]);

  const selectAndDismiss = (action: () => void) => {
    onDismiss?.();
    action();
  };

  const itemClassName = isMobile
    ? "community-switcher-item mobile-community-selector-item"
    : "community-switcher-item";
  const actionItemClassName = isMobile
    ? `${itemClassName} mobile-community-selector-item-action`
    : `${itemClassName} community-switcher-action`;
  const iconClassName = isMobile
    ? "community-switcher-action-icon mobile-community-selector-action-avatar"
    : "community-switcher-action-icon";
  const nameClassName = isMobile
    ? "community-switcher-name mobile-community-selector-name"
    : "community-switcher-name";

  return (
    <div
      ref={menuRef}
      className={`community-switcher-content${
        isMobile ? " mobile-community-selector" : " community-switcher-desktop"
      }`}
      role="menu"
      aria-label="Communities"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") moveMenuFocus(event, 1);
        else if (event.key === "ArrowUp") moveMenuFocus(event, -1);
        else if (event.key === "Home") moveMenuFocus(event, "first");
        else if (event.key === "End") moveMenuFocus(event, "last");
        else if (event.key === "Escape") {
          event.preventDefault();
          onDismiss?.();
        }
      }}
    >
      <div
        className={`community-switcher-actions${
          isMobile ? " mobile-community-selector-actions" : ""
        }`}
      >
        <button
          type="button"
          role="menuitem"
          className={actionItemClassName}
          onClick={() => selectAndDismiss(onOpenDiscover)}
        >
          <span className={iconClassName} aria-hidden="true">
            <Compass size={18} strokeWidth={1.8} />
          </span>
          <span className={nameClassName}>Discover</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={actionItemClassName}
          onClick={() => selectAndDismiss(onOpenCreate)}
        >
          <span className={iconClassName} aria-hidden="true">
            <Plus size={18} strokeWidth={1.8} />
          </span>
          <span className={nameClassName}>Create</span>
        </button>
        {supplementalActions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            className={actionItemClassName}
            onClick={() => selectAndDismiss(action.onSelect)}
          >
            <span className={iconClassName} aria-hidden="true">
              {action.icon}
            </span>
            <span className={nameClassName}>{action.label}</span>
          </button>
        ))}
      </div>

      <div
        className={`community-switcher-section${
          isMobile ? " mobile-community-selector-section" : ""
        }`}
      >
        <div
          className={`community-switcher-divider${
            isMobile ? " mobile-community-selector-divider" : ""
          }`}
          aria-hidden="true"
        />
        <div
          className={`community-switcher-section-label${
            isMobile ? " mobile-community-selector-section-label" : ""
          }`}
        >
          My communities
        </div>
      </div>

      {isLoading && communities.length === 0 ? (
        <div className="community-switcher-empty" role="status">
          Loading communities…
        </div>
      ) : communities.length > 0 ? (
        <div
          className={`community-switcher-list${
            isMobile ? " mobile-community-selector-list" : ""
          }`}
        >
          {communities.map((community) => {
            const communitySlug = String(community.slug ?? "").trim();
            const isActive = communitySlug === selectedCommunitySlug;
            return (
              <button
                key={community.id}
                type="button"
                role="menuitem"
                className={`${itemClassName}${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  const selected = onSelectCommunity(community);
                  if (selected !== false) onDismiss?.();
                }}
              >
                <span className="community-switcher-avatar-wrap">
                  <CommunityAvatar
                    communityId={community.id}
                    visualIdentity={community.visual_identity}
                    className={
                      isMobile
                        ? "community-switcher-avatar mobile-community-selector-avatar"
                        : "community-switcher-avatar"
                    }
                    imageUrl={community.avatar_url}
                    focusX={community.avatar_focus_x}
                    focusY={community.avatar_focus_y}
                    zoom={community.avatar_zoom}
                    name={community.name}
                    fallbackClassName={
                      isMobile
                        ? "mobile-community-selector-initials"
                        : undefined
                    }
                  />
                  {attentionByCommunityId[community.id] ? (
                    <span
                      className="community-switcher-attention"
                      aria-label="Updates available"
                    />
                  ) : null}
                </span>
                <span className={nameClassName}>{community.name}</span>
                {isActive ? (
                  <span
                    className={
                      isMobile
                        ? "community-switcher-check mobile-community-selector-check"
                        : "community-switcher-check"
                    }
                    aria-hidden="true"
                  >
                    <Check size={17} strokeWidth={2} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className={`community-switcher-empty${
            isMobile ? " mobile-community-selector-empty" : ""
          }`}
        >
          Your communities will show here after you join one.
        </div>
      )}
    </div>
  );
}
