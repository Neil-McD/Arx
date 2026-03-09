import type { ReactNode } from "react";
import { settingsGroupLabel, type SettingsGroup, type SettingsPage } from "./appShellNavigation";

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
      <span className="nav-icon nav-icon-profile">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="8.7" r="3.4" />
          <path d="M6.8 18.3a6.4 6.4 0 0 1 10.4 0" />
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
    id: "agent",
    page: "agent",
    icon: (
      <span className="nav-icon nav-icon-emphasis">
        <svg viewBox="0 0 24 24">
          <circle cx="6" cy="7" r="2" />
          <circle cx="6" cy="17" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="18" cy="7" r="2" />
          <circle cx="18" cy="17" r="2" />
          <path d="M7.5 8.3L10.5 10.7" />
          <path d="M7.5 15.7L10.5 13.3" />
          <path d="M13.5 10.7L16.5 8.3" />
          <path d="M13.5 13.3L16.5 15.7" />
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
  settingsGroup: SettingsGroup;
  onSelectPage: (page: SettingsPage) => void;
  buttonType?: "button" | "submit" | "reset";
};

export function SettingsNavList({ settingsGroup, onSelectPage, buttonType = "button" }: SettingsNavListProps) {
  return (
    <>
      {SETTINGS_NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={settingsGroup === item.id ? "nav-item active" : "nav-item"}
          onClick={() => onSelectPage(item.page)}
          type={buttonType}
        >
          {item.icon}
          {settingsGroupLabel(item.id)}
        </button>
      ))}
    </>
  );
}
