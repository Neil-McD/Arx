import type {
  SettingsGroup,
  SettingsPage,
} from "../../../../shared/appShellNavigation";
import { SettingsNavList } from "../../../../shared/SettingsNavList";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { settingsGroupLabel } from "../../../../shared/appShellNavigation";
import {
  WebSettingsPanels,
  type WebSettingsPanelsProps,
} from "./WebSettingsPanels";

export type WebSettingsSurfaceHostProps = {
  settingsGroup: SettingsGroup;
  showMobileSettingsShell: boolean;
  showMobileSettingsIndex: boolean;
  onSelectMobileSettingsPage: (page: SettingsPage) => void;
  onShowMobileSettingsIndex: () => void;
  settingsPanelsProps: WebSettingsPanelsProps;
};

export function WebSettingsSurfaceHost(props: WebSettingsSurfaceHostProps) {
  return (
    <div className="settings-panel">
      {props.showMobileSettingsShell ? (
        props.showMobileSettingsIndex ? (
          <div className="mobile-settings-index">
            <div className="mobile-settings-index-header">
              <div className="mobile-settings-index-title">Settings</div>
              <div className="mobile-settings-index-subtitle">
                Choose what you want to edit.
              </div>
            </div>
            <div className="mobile-settings-index-list">
              <SettingsNavList
                settingsGroup={null}
                onSelectPage={props.onSelectMobileSettingsPage}
              />
            </div>
          </div>
        ) : (
          <div className="mobile-settings-detail">
            <button
              type="button"
              className="mobile-settings-detail-back"
              onClick={props.onShowMobileSettingsIndex}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 18 9 12l6-6" />
              </svg>
              <span>Settings</span>
            </button>
            <div className="mobile-settings-detail-title">
              {settingsGroupLabel(props.settingsGroup)}
            </div>
            <div className="web-settings-centered-pane mobile-global-settings-centered-pane">
              <WebSettingsPanels {...props.settingsPanelsProps} />
            </div>
          </div>
        )
      ) : isDesignV1Active() ? (
        // One Settings page: the same column, title and cards as the community's sections.
        <div className="web-settings-centered-pane settings-page-v1 settings-page-v1-personal">
          <WebSettingsPanels {...props.settingsPanelsProps} />
        </div>
      ) : (
        <div className="web-settings-centered-pane">
          <WebSettingsPanels {...props.settingsPanelsProps} />
        </div>
      )}
    </div>
  );
}
