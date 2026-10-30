import type { ReactNode } from "react";
import { CreditCard, KeyRound, Monitor, Plug, UserRound, Users } from "lucide-react";
import { settingsGroupLabel, type SettingsPage } from "../../../../shared/appShellNavigation";

// Your settings' menu, in the same pieces as Community settings: you, then
// the communities you're in, then what's connected to your account.

const ICON = { size: 16, strokeWidth: 2, "aria-hidden": true } as const;

const GROUPS: { label: string | null; items: { page: SettingsPage; icon: ReactNode }[] }[] = [
  { label: null, items: [
    { page: "profile", icon: <UserRound {...ICON} /> },
    { page: "account", icon: <KeyRound {...ICON} /> },
    { page: "appearance", icon: <Monitor {...ICON} /> },
  ] },
  { label: "Communities", items: [
    { page: "memberships", icon: <Users {...ICON} /> },
    { page: "billing", icon: <CreditCard {...ICON} /> },
  ] },
  { label: "Connected", items: [{ page: "apps", icon: <Plug {...ICON} /> }] },
];

export function WebYourSettingsNav(props: { page: SettingsPage; onSelectPage: (page: SettingsPage) => void }) {
  return (
    <nav className="pn-settings-nav pn-your-settings-nav" aria-label="Your settings">
      <h1 className="pn-your-settings-title">Your settings</h1>
      <div className="pn-settings-nav-list">
        {GROUPS.map((group, index) => (
          <div className="pn-settings-nav-group" key={group.label ?? `top-${index}`}>
            {group.label ? <div className="pn-settings-nav-label">{group.label}</div> : null}
            {group.items.map((item) => (
              <button
                key={item.page}
                type="button"
                className={`pn-settings-nav-item${props.page === item.page ? " is-active" : ""}`}
                aria-current={props.page === item.page ? "page" : undefined}
                onClick={() => props.onSelectPage(item.page)}
              >
                {item.icon}
                <span>{settingsGroupLabel(item.page)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
