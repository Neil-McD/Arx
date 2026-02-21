import type { ReactNode } from "react";
import { settingsGroupLabel, type SettingsGroup, type SettingsPage } from "./appShellNavigation";

type SettingsNavItem = {
  id: SettingsGroup;
  page: SettingsPage;
  icon: ReactNode;
};

const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    id: "account",
    page: "account",
    icon: (
      <span className="nav-icon">
        <svg viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </span>
    ),
  },
  {
    id: "agent",
    page: "models",
    icon: (
      <span className="nav-icon">
        <svg viewBox="0 0 24 24">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 9h6M9 13h6M9 17h4" />
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
