import { useEffect, useId, useRef, useState } from "react";
import { ChevronsUpDown, LogOut, Moon, Settings, Sun } from "lucide-react";
import type { AppTheme } from "../../../../shared/theme";
import { WebSignOutConfirmModal } from "./WebSignOutConfirmModal";

export type WebAccountMenuProps = {
  name: string;
  avatarUrl: string | null;
  roleLabel: string;
  appTheme: AppTheme;
  onSetAppTheme: (theme: AppTheme) => void;
  onOpenSettings: () => void;
  onSignOut: () => Promise<void>;
};

// Design system v1: the account row at the bottom of the left column. Its menu
// holds what used to need a trip to settings: light or dark, settings, sign out.
export function WebAccountMenu(props: WebAccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSubmittingSignOut, setIsSubmittingSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const initial = props.name.trim().charAt(0).toUpperCase() || "?";
  const nextTheme: AppTheme = props.appTheme === "light" ? "dark" : "light";

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

  const handleConfirmSignOut = async (): Promise<void> => {
    if (isSubmittingSignOut) return;
    setSignOutError(null);
    setIsSubmittingSignOut(true);
    try {
      await props.onSignOut();
      setIsSignOutConfirmOpen(false);
    } catch {
      setSignOutError("Sign out couldn't be confirmed. Try again.");
    } finally {
      setIsSubmittingSignOut(false);
    }
  };

  return (
    <div className="account-menu" ref={rootRef}>
      {isOpen ? (
        <div className="account-menu-popover" id={menuId} role="menu" aria-label="Account">
          <button
            className="account-menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              props.onSetAppTheme(nextTheme);
              setIsOpen(false);
            }}
          >
            {nextTheme === "light" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            {nextTheme === "light" ? "Light mode" : "Dark mode"}
          </button>
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
            Profile and settings
          </button>
          <div className="account-menu-separator" role="separator" />
          <button
            className="account-menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              setIsSignOutConfirmOpen(true);
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
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
        <span className="account-menu-avatar" aria-hidden="true">
          {props.avatarUrl ? <img src={props.avatarUrl} alt="" /> : initial}
        </span>
        <span className="account-menu-identity">
          <span className="account-menu-name">{props.name}</span>
          <span className="account-menu-role">{props.roleLabel}</span>
        </span>
        <ChevronsUpDown size={15} aria-hidden="true" />
      </button>
      <WebSignOutConfirmModal
        isOpen={isSignOutConfirmOpen}
        isSubmitting={isSubmittingSignOut}
        error={signOutError}
        onClose={() => {
          if (!isSubmittingSignOut) {
            setIsSignOutConfirmOpen(false);
            setSignOutError(null);
          }
        }}
        onConfirm={handleConfirmSignOut}
      />
    </div>
  );
}
