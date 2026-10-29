import type { ReactNode } from "react";
import {
  settingsGroupLabel,
  type SettingsGroup,
  type SettingsPage,
} from "./appShellNavigation";

type SettingsNavItem = {
  id: SettingsGroup;
  page: SettingsPage;
  icon: ReactNode;
};

const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    id: "profile",
    page: "profile",
    icon: (
      <span className="nav-icon nav-icon-emphasis">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      </span>
    ),
  },
  {
    id: "account",
    page: "account",
    icon: (
      <span className="nav-icon nav-icon-emphasis">
        <svg viewBox="0 0 24 24">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
    ),
  },
  {
    id: "memberships",
    page: "memberships",
    icon: (
      <span className="nav-icon nav-icon-emphasis">
        <svg viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
          <path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
        </svg>
      </span>
    ),
  },
  {
    id: "billing",
    page: "billing",
    icon: (
      <span className="nav-icon nav-icon-emphasis">
        <svg viewBox="0 0 24 24">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </svg>
      </span>
    ),
  },
  {
    id: "apps",
    page: "apps",
    icon: (
      <span className="nav-icon nav-icon-emphasis">
        <svg viewBox="0 0 24 24">
          <path d="M9 2v6" />
          <path d="M15 2v6" />
          <path d="M6 8h12v4a6 6 0 0 1-12 0z" />
          <path d="M12 18v4" />
        </svg>
      </span>
    ),
  },
  {
    id: "appearance",
    page: "appearance",
    icon: (
      <span className="nav-icon">
        <svg viewBox="0 0 24 24">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
        </svg>
      </span>
    ),
  },
];

type SettingsNavListProps = {
  settingsGroup: SettingsGroup | null;
  onSelectPage: (page: SettingsPage) => void;
  buttonType?: "button" | "submit" | "reset";
};

export function SettingsNavList({
  settingsGroup,
  onSelectPage,
  buttonType = "button",
}: SettingsNavListProps) {
  return (
    <>
      {SETTINGS_NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={settingsGroup === item.id ? "nav-item active" : "nav-item"}
          onClick={() => onSelectPage(item.page)}
          type={buttonType}
          aria-current={settingsGroup === item.id ? "page" : undefined}
          aria-label={settingsGroupLabel(item.id)}
          title={settingsGroupLabel(item.id)}
        >
          {item.icon}
          {settingsGroupLabel(item.id)}
        </button>
      ))}
    </>
  );
}
