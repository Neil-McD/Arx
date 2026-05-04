import { useState } from "react";

import type {
  CommunityMountedApp,
  ConnectCommunityAppInput,
  DeveloperAppAuthType,
} from "../../../../shared/communityAppMountTypes";
import { DISCOVER_APP_CATALOG } from "../lib/discoverCatalog";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";

const AUTH_TYPE_OPTIONS: Array<{ value: DeveloperAppAuthType; label: string }> = [
  { value: "none", label: "None" },
  { value: "api_key", label: "API key" },
  { value: "bearer", label: "Bearer token" },
];

function buildInitialDraft(): ConnectCommunityAppInput {
  return {
    name: "",
    endpoint_url: "",
    auth_type: "none",
    description: "",
  };
}

type ConnectStep = "url" | "details";

function normalizeEndpointUrl(value: string): string {
  return value.trim();
}

function buildSuggestedAppName(endpointUrl: string): string {
  const normalized = normalizeEndpointUrl(endpointUrl);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./i, "");
    const candidate = host.split(".")[0] ?? "";
    if (!candidate) return "";
    return candidate
      .split(/[-_]+/g)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
  } catch {
    return "";
  }
}

function toStatusLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Unknown";
  return normalized
    .split(/[_\s]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildMountStateClassName(mount: CommunityMountedApp): string {
  if (!mount.enabled) return " is-disabled";
  if (mount.live_status === "live") return " is-live";
  const reason = String(mount.not_live_reason ?? "").trim();
  if (reason === "needs_auth" || reason === "missing_snapshot") return " is-setup";
  return " is-not-live";
}

function buildMountStateLabel(mount: CommunityMountedApp): string {
  if (!mount.enabled) return "Disabled";
  if (mount.live_status === "live") return "Live";
  return "Setup needed";
}

function buildMountStatusLabel(mount: CommunityMountedApp): string {
  const enabledCount = mount.tools.filter((tool) => tool.enabled).length;
  if (enabledCount > 0) return `${enabledCount} ${enabledCount === 1 ? "tool" : "tools"} enabled`;
  if (mount.tools.length > 0) return "0 tools enabled";
  return "0 tools";
}

function buildMountDetail(mount: CommunityMountedApp): string {
  const auth = toStatusLabel(mount.app.auth_type);
  const connection = toStatusLabel(mount.connection.connection_status);
  const validation = toStatusLabel(mount.app.status);
  return `Auth ${auth} · Connection ${connection} · Validation ${validation}`;
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
  isLoading: boolean;
  error: string | null;
  mutationError: string | null;
  isConnecting: boolean;
  updatingMountId: string | null;
  refreshingMountId: string | null;
  removingMountId: string | null;
  onConnectApp: (input: ConnectCommunityAppInput) => Promise<boolean> | boolean;
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
    isLoading,
    error,
    mutationError,
    isConnecting,
    updatingMountId,
    refreshingMountId,
    removingMountId,
    onConnectApp,
    onUpdateMount,
    onRefreshApp,
    onUnmountApp,
    onBrowseCatalog,
  } = props;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [connectStep, setConnectStep] = useState<ConnectStep>("url");
  const [draft, setDraft] = useState<ConnectCommunityAppInput>(buildInitialDraft);
  const [connectFlowError, setConnectFlowError] = useState<string | null>(null);
  const [editingMountId, setEditingMountId] = useState<string | null>(null);

  const resetCreateFlow = () => {
    setDraft(buildInitialDraft());
    setConnectStep("url");
    setConnectFlowError(null);
  };

  const openOrCloseCreateFlow = () => {
    setIsCreateOpen((prev) => {
      const next = !prev;
      if (!next) resetCreateFlow();
      return next;
    });
  };

  const handleFindApp = () => {
    const endpointUrl = normalizeEndpointUrl(draft.endpoint_url);
    if (!endpointUrl) {
      setConnectFlowError("Paste the app's hosted MCP endpoint URL first.");
      return;
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(endpointUrl);
    } catch {
      setConnectFlowError("Enter a valid HTTPS URL for the MCP endpoint.");
      return;
    }
    if (parsedUrl.protocol !== "https:") {
      setConnectFlowError("Only hosted HTTPS MCP endpoints are supported here.");
      return;
    }
    setDraft((prev) => ({
      ...prev,
      endpoint_url: endpointUrl,
      name: prev.name.trim() || buildSuggestedAppName(endpointUrl),
    }));
    setConnectFlowError(null);
    setConnectStep("details");
  };

  const handleConnect = async () => {
    const ok = await onConnectApp(draft);
    if (!ok) return;
    resetCreateFlow();
    setIsCreateOpen(false);
  };

  return (
    <div className="settings-section">
      <div className="model-note agent-editor-intro">{intro}</div>

      <div className="agent-capability-toolbar">
        <button
          type="button"
          onClick={onBrowseCatalog ?? openOrCloseCreateFlow}
          disabled={isConnecting}
        >
          {isCreateOpen ? "Close" : addButtonLabel}
        </button>
      </div>

      {isCreateOpen ? (
        <div className="agent-capability-card community-app-connect-card">
          <div className="agent-capability-card-header">
            <div className="agent-canvas-target-kicker">Connect hosted MCP app</div>
          </div>

          {connectStep === "url" ? (
            <>
              <label className="agent-capability-field">
                <span className="agent-capability-field-label">MCP endpoint URL</span>
                <input
                  className="agent-editor-inline-label-input"
                  value={draft.endpoint_url}
                  onChange={(event) => {
                    setDraft((prev) => ({
                      ...prev,
                      endpoint_url: event.target.value,
                    }));
                    if (connectFlowError) setConnectFlowError(null);
                  }}
                  placeholder="https://your-app.example.com/mcp"
                />
              </label>

              <div className="community-app-connect-summary">
                <div className="community-app-connect-summary-title">Alpha connect flow</div>
                <ul className="community-app-connect-list">
                  <li>Paste the app&apos;s direct hosted MCP endpoint.</li>
                  <li>Confirm the auth method members will need for their own setup.</li>
                  <li>On connect, Polynet records the community recommendation and members use their own harness credentials.</li>
                </ul>
              </div>

              <div className="agent-capability-toolbar">
                <div className="model-note">
                  Keep this honest for alpha: direct HTTPS MCP endpoints only. No random website scraping or guessed integrations.
                </div>
                <div className="agent-capability-toolbar-actions">
                  <button type="button" onClick={openOrCloseCreateFlow} disabled={isConnecting}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="platform-save-button is-dirty"
                    onClick={handleFindApp}
                    disabled={isConnecting}
                  >
                    Find app
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="community-app-connect-summary">
                <div className="community-app-connect-summary-title">Endpoint found</div>
                <div className="model-note">{draft.endpoint_url}</div>
              </div>

              <div className="agent-capability-field-grid">
                <label className="agent-capability-field">
                  <span className="agent-capability-field-label">App name</span>
                  <input
                    className="agent-editor-inline-label-input"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="GitHub"
                  />
                </label>
                <label className="agent-capability-field">
                  <span className="agent-capability-field-label">Auth</span>
                  <select
                    className="agent-capability-select"
                    value={draft.auth_type}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        auth_type: event.target.value as DeveloperAppAuthType,
                      }))
                    }
                  >
                    {AUTH_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="community-app-connect-summary">
                <div className="community-app-connect-summary-title">What happens when you recommend it</div>
                <ul className="community-app-connect-list">
                  <li>Polynet adds this app to the community&apos;s grant list.</li>
                  <li>Polynet seeds or reuses personal harness apps for members.</li>
                  <li>The app is recommended for this community. Members use their own harness credentials when the app requires authentication.</li>
                </ul>
              </div>

              <div className="agent-capability-toolbar">
                <div className="model-note">
                  Discovery still happens on connect in alpha. This step keeps the flow clear without pretending we already know the tool surface before validation.
                </div>
                <div className="agent-capability-toolbar-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setConnectStep("url");
                      setConnectFlowError(null);
                    }}
                    disabled={isConnecting}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="platform-save-button is-dirty"
                    onClick={() => void handleConnect()}
                    disabled={isConnecting}
                  >
                    {isConnecting ? "Connecting…" : "Connect app"}
                  </button>
                </div>
              </div>
            </>
          )}

          {connectFlowError ? <div className="auth-error">{connectFlowError}</div> : null}
        </div>
      ) : null}

      {error ? <div className="auth-error">{error}</div> : null}
      {mutationError ? <div className="auth-error">{mutationError}</div> : null}

      {isLoading ? (
        <div className="chat-empty">Loading apps…</div>
      ) : mounts.length === 0 ? (
        <div className="agent-capability-empty">
          <div className="agent-capability-empty-title">No apps connected yet</div>
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
                        <span className={`integration-state-indicator${buildMountStateClassName(mount)}`}>
                          <span aria-hidden="true" />
                          {buildMountStateLabel(mount)}
                        </span>
                        <span className="integration-status-pill">
                          {buildMountStatusLabel(mount)}
                        </span>
                        <span className="integration-status-pill">
                          Community app
                        </span>
                      </div>
                      <div className="integration-mounted-meta">
                        {mount.app.endpoint_url}
                      </div>
                      <div className="integration-mounted-detail">
                        {buildMountDetail(mount)}
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
