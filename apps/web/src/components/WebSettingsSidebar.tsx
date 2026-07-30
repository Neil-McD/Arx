import { SettingsNavList } from "../../../../shared/SettingsNavList";
import type { WebSettingsSidebarProps } from "./webShellChromeShared";

type Props = {
  settingsSidebar: WebSettingsSidebarProps;
};

export function WebSettingsSidebar(props: Props) {
  const { settingsSidebar } = props;

  if (
    settingsSidebar.showMobileSettingsShell ||
    !settingsSidebar.isGlobalSettings
  ) {
    return null;
  }

  return (
    <aside className="sessions">
      <div className="session-list">
        <SettingsNavList
          settingsGroup={settingsSidebar.settingsGroup}
          onSelectPage={settingsSidebar.onSelectPage}
        />
      </div>
    </aside>
  );
}
