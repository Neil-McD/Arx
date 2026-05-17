import { useState } from "react";

import type { CommunityMountedApp } from "../../../../shared/communityAppMountTypes";
import type { EffectiveMcpApp } from "../../../../shared/effectiveMcpApps";
import { buildIntegrationSurfaceRowFromCommunityMount } from "../lib/integrationSurfaceRows";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";

function toStatusLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Unknown";
  return normalized
    .split(/[_\s]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export type WebCommunityAiAgentAppsEditorProps = {
  intro: string;
  emptyState: string;
  addButtonLabel: string;
  mounts: CommunityMountedApp[];
  effectiveMcpApps: EffectiveMcpApp[];
  isLoading: boolean;
  isLoadingEffectiveMcpApps: boolean;
  error: string | null;
  mutationError: string | null;
  isConnecting: boolean;
  updatingMountId: string | null;
  refreshingMountId: string | null;
  removingMountId: string | null;
  onUpdateMount: (
    communityAppMountId: string,
    patch: {
      enabled?: boolean;
      enabledTools?: string[];
    },
  ) => Promise<boolean> | boolean;
  onRefreshApp: (communityAppMountId: string) => Promise<boolean> | boolean;
  onUnmountApp: (communityAppMountId: string) => Promise<boolean> | boolean;
  onBrowseCatalog?: () => void;
};

export function WebCommunityAiAgentAppsEditor(
  props: WebCommunityAiAgentAppsEditorProps,
) {
  const {
    intro,
    emptyState,
    addButtonLabel,
    mounts,
    effectiveMcpApps,
    isLoading,
    isLoadingEffectiveMcpApps,
    error,
    mutationError,
    isConnecting,
    updatingMountId,
    refreshingMountId,
    removingMountId,
    onUpdateMount,
    onRefreshApp,
    onUnmountApp,
    onBrowseCatalog,
  } = props;
  const [editingMountId, setEditingMountId] = useState<string | null>(null);

  return (
    <div className="settings-section">
      <div className="model-note agent-editor-intro">{intro}</div>

      <div className="agent-capability-toolbar">
        <button
          type="button"
          onClick={onBrowseCatalog}
          disabled={isConnecting || !onBrowseCatalog}
        >
          {addButtonLabel}
        </button>
      </div>

      {error ? <div className="auth-error">{error}</div> : null}
      {mutationError ? <div className="auth-error">{mutationError}</div> : null}

      {isLoading ? (
        <div className="chat-empty">Loading apps…</div>
      ) : mounts.length === 0 ? (
        <div className="agent-capability-empty">
          <div className="agent-capability-empty-title">No apps added yet</div>
          <div className="model-note">{emptyState}</div>
        </div>
      ) : (
        <div className="integrations-app-list" role="list" aria-label="Community apps">
          {mounts.map((mount) => {
            const enabledToolNames = mount.tools
              .filter((tool) => tool.enabled)
              .map((tool) => tool.tool_name);
            const isUpdating = updatingMountId === mount.id;
            const isRefreshing = refreshingMountId === mount.id;
            const isRemoving = removingMountId === mount.id;
            const isEditing = editingMountId === mount.id;
            const row = buildIntegrationSurfaceRowFromCommunityMount(
              mount,
              effectiveMcpApps,
              {
                canToggle: true,
                isBusy: isUpdating || isRemoving || isRefreshing,
                isResolvingCanonicalState: isLoadingEffectiveMcpApps,
              },
            );
            return (
              <div key={mount.id} className="integration-mounted-row" role="listitem">
                <div className="integration-mounted-top">
                  <div className="integration-mounted-identity">
                    <DiscoverCatalogLogo
                      name={row.name}
                      logoUrl={row.logoUrl}
                      logoUrlDark={row.logoUrlDark}
                    />
                    <div className="integration-mounted-main">
                      <div className="integration-mounted-title-row">
                        <strong>{row.name}</strong>
                        <span className={`integration-state-indicator is-${row.stateTone}`}>
                          <span aria-hidden="true" />
                          {row.stateLabel}
                        </span>
                        <span className="integration-status-pill">
                          {row.toolCountLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="integration-mounted-rail">
                    <label
                      className={`members-switch integration-mounted-switch${isUpdating || isRemoving || isRefreshing ? " is-disabled" : ""}`}
                      title={mount.enabled ? "Disable app" : "Enable app"}
                    >
                      <input
                        type="checkbox"
                        checked={mount.enabled}
                        onChange={(event) =>
                          void onUpdateMount(mount.id, {
                            enabled: event.target.checked,
                          })
                        }
                        disabled={isUpdating || isRemoving || isRefreshing}
                        aria-label={`${mount.enabled ? "Disable" : "Enable"} ${mount.app.name}`}
                      />
                      <span className="members-switch-track">
                        <span className="members-switch-thumb" />
                      </span>
                    </label>
                    <div className="agent-capability-toolbar-actions">
                      <button
                        type="button"
                        onClick={() => setEditingMountId(isEditing ? null : mount.id)}
                        disabled={isRemoving}
                      >
                        {isEditing ? "Done" : "Edit"}
                      </button>
                      <button
                        type="button"
                        className="agent-onboarding-reset"
                        onClick={() => void onUnmountApp(mount.id)}
                        disabled={isRemoving || isUpdating || isRefreshing}
                      >
                        {isRemoving ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </div>
                </div>

                {isEditing ? (
                  <div className="community-app-edit-panel">
                    <div className="community-app-metadata-grid">
                      <div className="community-app-metadata-item">
                        <span className="agent-capability-field-label">Auth</span>
                        <span>{toStatusLabel(mount.app.auth_type)}</span>
                      </div>
                      <div className="community-app-metadata-item">
                        <span className="agent-capability-field-label">Connection</span>
                        <span>{toStatusLabel(mount.connection.connection_status)}</span>
                      </div>
                      <div className="community-app-metadata-item">
                        <span className="agent-capability-field-label">Validation</span>
                        <span>{toStatusLabel(mount.app.status)}</span>
                      </div>
                    </div>

                    <div className="agent-capability-toolbar">
                      <div className="model-note">
                        Refresh only re-checks the community app and discovered tool surface. Members still use their own harness credentials.
                      </div>
                      <div className="agent-capability-toolbar-actions">
                        <button
                          type="button"
                          onClick={() => void onRefreshApp(mount.id)}
                          disabled={isRefreshing || isRemoving || isUpdating}
                        >
                          {isRefreshing ? "Refreshing…" : "Refresh"}
                        </button>
                      </div>
                    </div>

                    {mount.tools.length > 0 ? (
                      <div className="agent-capability-field">
                        <span className="agent-capability-field-label">Tools</span>
                        <div className="community-app-tool-list" role="list">
                          {mount.tools.map((tool) => {
                            const nextEnabledTools = tool.enabled
                              ? enabledToolNames.filter((toolName) => toolName !== tool.tool_name)
                              : [...enabledToolNames, tool.tool_name];
                            return (
                              <label key={tool.namespaced_tool_name} className="community-app-tool-row" role="listitem">
                                <input
                                  type="checkbox"
                                  checked={tool.enabled}
                                  onChange={() =>
                                    void onUpdateMount(mount.id, {
                                      enabledTools: nextEnabledTools,
                                    })
                                  }
                                  disabled={isUpdating || isRemoving || isRefreshing}
                                />
                                <div className="community-app-tool-copy">
                                  <div className="community-app-tool-title-row">
                                    <span className="community-app-tool-name">{tool.tool_name}</span>
                                    <span className="community-app-tool-risk">{toStatusLabel(tool.risk_level)}</span>
                                  </div>
                                  {tool.description ? (
                                    <div className="model-note">{tool.description}</div>
                                  ) : null}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      row.toolNames.length > 0 ? (
                        <div className="agent-capability-field">
                          <span className="agent-capability-field-label">Tools</span>
                          <div className="community-app-tool-list" role="list">
                            {row.toolNames.map((toolName) => (
                              <div
                                key={toolName}
                                className="community-app-tool-row"
                                role="listitem"
                              >
                                <div className="community-app-tool-copy">
                                  <div className="community-app-tool-title-row">
                                    <span className="community-app-tool-name">
                                      {toolName}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="model-note">No tools available yet.</div>
                      )
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
