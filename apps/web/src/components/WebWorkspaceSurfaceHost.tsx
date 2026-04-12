import { Suspense, lazy } from "react";
import type {
  AppView,
  SettingsGroup,
  SettingsPage,
} from "../../../../shared/appShellNavigation";
import { SettingsNavList } from "../../../../shared/SettingsNavList";
import { settingsGroupLabel } from "../../../../shared/appShellNavigation";
import {
  WebWorkspaceHost,
  type WebWorkspaceHostProps,
} from "./WebWorkspaceHost";
import type { WebSettingsPanelsProps } from "./WebSettingsPanels";

const WebSettingsPanels = lazy(() =>
  import("./WebSettingsPanels").then((module) => ({
    default: module.WebSettingsPanels,
  })),
);

type WebWorkspaceSurfaceHostProps = {
  activeView: AppView;
  settingsGroup: SettingsGroup;
  showMobileSettingsShell: boolean;
  showMobileSettingsIndex: boolean;
  onSelectMobileSettingsPage: (page: SettingsPage) => void;
  onShowMobileSettingsIndex: () => void;
  settingsPanelsProps: WebSettingsPanelsProps;
  workspaceHostProps: WebWorkspaceHostProps;
};

export function WebWorkspaceSurfaceHost(props: WebWorkspaceSurfaceHostProps) {
  const {
    activeView,
    settingsGroup,
    showMobileSettingsShell,
    showMobileSettingsIndex,
    onSelectMobileSettingsPage,
    onShowMobileSettingsIndex,
    settingsPanelsProps,
    workspaceHostProps,
  } = props;

  if (activeView !== "settings") {
    return <WebWorkspaceHost {...workspaceHostProps} />;
  }

  return (
    <div className="settings-panel">
      {showMobileSettingsShell ? (
        showMobileSettingsIndex ? (
          <div className="mobile-settings-index">
            <div className="mobile-settings-index-header">
              <div className="mobile-settings-index-title">Settings</div>
              <div className="mobile-settings-index-subtitle">
                Choose what you want to edit.
              </div>
            </div>
            <div className="mobile-settings-index-list">
              <SettingsNavListProxy onSelectPage={onSelectMobileSettingsPage} />
            </div>
          </div>
        ) : (
          <div className="mobile-settings-detail">
            <button
              type="button"
              className="mobile-settings-detail-back"
              onClick={onShowMobileSettingsIndex}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 18 9 12l6-6" />
              </svg>
              <span>Settings</span>
            </button>
            <div className="mobile-settings-detail-title">
              {settingsGroupLabel(settingsGroup)}
            </div>
            <div className="web-settings-centered-pane mobile-global-settings-centered-pane">
              <SettingsPanelsContent settingsPanelsProps={settingsPanelsProps} />
            </div>
          </div>
        )
      ) : (
        <div className="web-settings-centered-pane">
          <SettingsPanelsContent settingsPanelsProps={settingsPanelsProps} />
        </div>
      )}
    </div>
  );
}

function SettingsPanelsContent(props: { settingsPanelsProps: WebSettingsPanelsProps }) {
  return (
    <Suspense
      fallback={
        <div className="chat-loading">
          <div className="loading-spinner" />
          <span>Loading settings...</span>
        </div>
      }
    >
      <WebSettingsPanels {...props.settingsPanelsProps} />
    </Suspense>
  );
}

function SettingsNavListProxy(props: { onSelectPage: (page: SettingsPage) => void }) {
  return <SettingsNavList settingsGroup={null} onSelectPage={props.onSelectPage} />;
}
