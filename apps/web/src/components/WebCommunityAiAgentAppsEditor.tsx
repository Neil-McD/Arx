import { useState } from "react";

import type { CommunityMountedApp } from "../../../../shared/communityAppMountTypes";
import {
  buildMcpAppIdentityAliases,
  mcpAppIdentitySourcesOverlap,
  type EffectiveMcpApp,
} from "../../../../shared/effectiveMcpApps";
import { DISCOVER_APP_CATALOG } from "../lib/discoverCatalog";
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

function pluralizeTools(count: number): string {
  return `${count} ${count === 1 ? "tool" : "tools"}`;
}

function findEffectiveMcpAppForCommunityMount(
  mount: CommunityMountedApp,
  apps: EffectiveMcpApp[],
): EffectiveMcpApp | null {
  const aliases = new Set(buildMcpAppIdentityAliases(mount));
  return (
    apps.find((app) => aliases.has(app.app_identity_key)) ??
    apps.find((app) => mcpAppIdentitySourcesOverlap(app, mount)) ??
    null
  );
}

function buildMountStateClassName(
  mount: CommunityMountedApp,
  effectiveApp: EffectiveMcpApp | null,
): string {
  if (!mount.enabled) return " is-disabled";
  if (effectiveApp?.live_for_current_user) return " is-live";
  if (effectiveApp?.credential_state === "needs_personal_setup") return " is-setup";
  return "";
}

function buildMountStateLabel(
  mount: CommunityMountedApp,
  effectiveApp: EffectiveMcpApp | null,
): string {
  if (!mount.enabled) return "Disabled";
  if (effectiveApp?.live_for_current_user) return "Live";
  if (effectiveApp?.credential_state === "needs_personal_setup") {
    return "Setup needed";
  }
  return "Recommended";
}

function buildMountStatusLabel(
  mount: CommunityMountedApp,
  effectiveApp: EffectiveMcpApp | null,
): string {
  if (effectiveApp?.live_for_current_user) {
    return `${pluralizeTools(effectiveApp.effective_tool_count)} active`;
  }
  const enabledCount = mount.tools.filter((tool) => tool.enabled).length;
  if (enabledCount > 0) return `${pluralizeTools(enabledCount)} enabled`;
  if (mount.tools.length > 0) return "0 tools enabled";
  return "0 tools";
}

function buildMountDetail(
  mount: CommunityMountedApp,
  effectiveApp: EffectiveMcpApp | null,
): string {
  if (effectiveApp?.live_for_current_user) {
    return `${pluralizeTools(effectiveApp.effective_tool_count)} available through your personal harness for this community.`;
  }
  if (effectiveApp?.credential_state === "needs_personal_setup") {
    return `${mount.app.name} is recommended by this community. Connect it in your personal harness to use its tools.`;
  }
  return `${mount.app.name} is recommended by this community.`;
}

function findCatalogEntryForCommunityMount(mount: CommunityMountedApp) {
  const byCatalogId = mount.app.catalog_app_id
    ? DISCOVER_APP_CATALOG.find((entry) => entry.id === mount.app.catalog_app_id)
    : null;
  if (byCatalogId) return byCatalogId;

  const byEndpoint = DISCOVER_APP_CATALOG.find((entry) => {
    if (entry.personalConnect.connectionKind !== "known") return false;
    return (
      entry.personalConnect.endpointUrl === mount.app.endpoint_url &&
      entry.personalConnect.authType === mount.app.auth_type
    );
  });
  if (byEndpoint) return byEndpoint;

  const normalizedName = mount.app.name.trim().toLowerCase();
  return (
    DISCOVER_APP_CATALOG.find(
      (entry) => entry.name.trim().toLowerCase() === normalizedName,
    ) ?? null
  );
}

export type WebCommunityAiAgentAppsEditorProps = {
  intro: string;
  emptyState: string;
  addButtonLabel: string;
  mounts: CommunityMountedApp[];
  effectiveMcpApps: EffectiveMcpApp[];
  isLoading: boolean;
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
          <div className="agent-capability-empty-title">No apps recommended yet</div>
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
            const catalogEntry = findCatalogEntryForCommunityMount(mount);
            const effectiveApp = findEffectiveMcpAppForCommunityMount(
              mount,
              effectiveMcpApps,
            );
            return (
              <div key={mount.id} className="integration-mounted-row" role="listitem">
                <div className="integration-mounted-top">
                  <div className="integration-mounted-identity">
                    <DiscoverCatalogLogo
                      name={mount.app.name}
                      logoUrl={catalogEntry?.logoUrl}
                      logoUrlDark={catalogEntry?.logoUrlDark}
                    />
                    <div className="integration-mounted-main">
                      <div className="integration-mounted-title-row">
                        <strong>{mount.app.name}</strong>
                        <span className={`integration-state-indicator${buildMountStateClassName(mount, effectiveApp)}`}>
                          <span aria-hidden="true" />
                          {buildMountStateLabel(mount, effectiveApp)}
                        </span>
                        <span className="integration-status-pill">
                          {buildMountStatusLabel(mount, effectiveApp)}
                        </span>
                        <span className="integration-status-pill">
                          Community app
                        </span>
                      </div>
                      <div className="integration-mounted-meta">
                        {mount.app.endpoint_url}
                      </div>
                      <div className="integration-mounted-detail">
                        {buildMountDetail(mount, effectiveApp)}
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
                        Refresh only re-checks the app grant and discovered tool surface. Members still use their own harness credentials.
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
                        <span className="agent-capability-field-label">Mounted tools</span>
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
                      <div className="model-note">No tools have been discovered for this community app yet.</div>
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
