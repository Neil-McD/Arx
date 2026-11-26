import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronsUpDown, Eye, LogOut, Moon, Settings, Sun } from "lucide-react";
import type { AppTheme } from "../../../../shared/theme";
import { UserAvatar } from "../../../../shared/UserAvatar";

export type WebAccountMenuProps = {
  name: string;
  avatarUrl: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
  roleLabel: string;
  // The community this menu is opened in, for "Host of <name>".
  communityName?: string | null;
  appTheme: AppTheme;
  onSetAppTheme: (theme: AppTheme) => void;
  onOpenSettings: () => void;
  onSignOut: () => Promise<void>;
  // Design system v1: the community's own extras (Invite people, Analytics,
  // Visit site) live here, so the column's foot is the mock's two rows.
  communityItems?: AccountMenuCommunityItem[];
  // "View as a member" and back ("Host view"), for the people who run it.
  memberView?: { active: boolean; onToggle: () => void };
};

export type AccountMenuCommunityItem = { key: string; label: string; icon: ReactNode; onSelect: () => void };

// What the menu's header says under the name: the role, and where it holds.
export function accountMenuRoleLine(roleLabel: string, communityName?: string | null): string {
  const name = String(communityName ?? "").trim();
  return name && (roleLabel === "Host" || roleLabel === "Member") ? `${roleLabel} of ${name}` : roleLabel;
}

// Design system v1: the account row at the bottom of the left column. Its
// menu says who you are, then this community's things, then your own
// (settings, light or dark), and sign out last.
export function WebAccountMenu(props: WebAccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmittingSignOut, setIsSubmittingSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const initial = props.name.trim().charAt(0).toUpperCase() || "?";
  const isLight = props.appTheme === "light";
  const nextTheme: AppTheme = isLight ? "dark" : "light";
  const roleLine = accountMenuRoleLine(props.roleLabel, props.communityName);

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

  // Sign out is one click (Neil, Nov 26: nothing is lost, you just sign back
  // in). The menu stays open with "Signing out…" until it's done; if the
  // server can't confirm it, the menu says so and the item stays to retry.
  const handleSignOut = async (): Promise<void> => {
    if (isSubmittingSignOut) return;
    setSignOutError(null);
    setIsSubmittingSignOut(true);
    try {
      await props.onSignOut();
      setIsOpen(false);
    } catch {
      setSignOutError(SIGN_OUT_FAILED);
    } finally {
      setIsSubmittingSignOut(false);
    }
  };

  return (
    <div className="account-menu" ref={rootRef}>
      {isOpen ? (
        <div className="account-menu-popover" id={menuId} role="menu" aria-label="Account">
          <div className="account-menu-head" role="presentation">
            <UserAvatar
              className="account-menu-avatar"
              name={props.name}
              imageUrl={props.avatarUrl}
              focusX={props.avatarFocusX}
              focusY={props.avatarFocusY}
              zoom={props.avatarZoom}
              fallback={initial}
              alt=""
              aria-hidden
            />
            <span className="account-menu-identity">
              <span className="account-menu-name">{props.name}</span>
              {roleLine ? <span className="account-menu-role">{roleLine}</span> : null}
            </span>
          </div>
          {props.communityItems?.length || props.memberView ? (
            <>
              <div className="account-menu-separator" role="separator" />
              <span className="account-menu-label" role="presentation">This community</span>
              {props.communityItems?.map((item) => (
                <button
                  key={item.key}
                  className="account-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
              {props.memberView ? (
                <button
                  className="account-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOpen(false);
                    props.memberView?.onToggle();
                  }}
                >
                  <Eye size={16} aria-hidden="true" />
                  <span>{props.memberView.active ? "Host view" : "View as a member"}</span>
                </button>
              ) : null}
            </>
          ) : null}
          <div className="account-menu-separator" role="separator" />
          <span className="account-menu-label" role="presentation">You</span>
          <button
            className="account-menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              props.onOpenSettings();
            }}
          >
            <Settings size={16} aria-hidden="true" />
            <span>Settings</span>
          </button>
          {/* Says the mode you're in; choosing it switches to the other. */}
          <button
            className="account-menu-item"
            type="button"
            role="menuitem"
            aria-label={`Appearance: ${isLight ? "Light" : "Dark"}. Switch to ${isLight ? "dark" : "light"}`}
            onClick={() => {
              props.onSetAppTheme(nextTheme);
              setIsOpen(false);
            }}
          >
            {isLight ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            <span>Appearance</span>
            <span className="account-menu-fact">{isLight ? "Light" : "Dark"}</span>
          </button>
          <div className="account-menu-separator" role="separator" />
          <SignOutItem busy={isSubmittingSignOut} error={signOutError} onSignOut={() => void handleSignOut()} />
        </div>
      ) : null}
      <button
        ref={triggerRef}
        className={`account-menu-trigger${isOpen ? " is-open" : ""}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <UserAvatar
          className="account-menu-avatar"
          name={props.name}
          imageUrl={props.avatarUrl}
          focusX={props.avatarFocusX}
          focusY={props.avatarFocusY}
          zoom={props.avatarZoom}
          fallback={initial}
          alt=""
          aria-hidden
        />
        <span className="account-menu-identity">
          <span className="account-menu-name">{props.name}</span>
          {props.roleLabel ? <span className="account-menu-role">{props.roleLabel}</span> : null}
        </span>
        <ChevronsUpDown size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

export const SIGN_OUT_FAILED = "Couldn't sign you out. Try again.";

// The menu's last item: Sign out, "Signing out…" while it runs, and the
// failure under it when the server couldn't confirm it.
export function SignOutItem(props: { busy: boolean; error: string | null; onSignOut: () => void }) {
  return (
    <>
      <button className="account-menu-item" type="button" role="menuitem" disabled={props.busy} onClick={props.onSignOut}>
        <LogOut size={16} aria-hidden="true" />
        <span>{props.busy ? "Signing out…" : "Sign out"}</span>
      </button>
      {props.error ? <p className="account-menu-error" role="alert">{props.error}</p> : null}
    </>
  );
}
