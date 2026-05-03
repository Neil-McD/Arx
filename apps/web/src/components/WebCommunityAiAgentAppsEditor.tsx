import { useState } from "react";

import type {
  CommunityMountedApp,
  ConnectCommunityAppInput,
  DeveloperAppAuthType,
} from "../../../../shared/communityAppMountTypes";

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
    secret: "",
  };
}

type ConnectStep = "url" | "details";

function resetReconnectState() {
  return {} as Record<string, string>;
}

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
  reconnectingMountId: string | null;
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
  onReconnectApp: (
    communityAppMountId: string,
    secret: string,
  ) => Promise<boolean> | boolean;
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
    reconnectingMountId,
    removingMountId,
    onConnectApp,
    onUpdateMount,
    onRefreshApp,
    onReconnectApp,
    onUnmountApp,
    onBrowseCatalog,
  } = props;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [connectStep, setConnectStep] = useState<ConnectStep>("url");
  const [draft, setDraft] = useState<ConnectCommunityAppInput>(buildInitialDraft);
  const [reconnectOpenMountId, setReconnectOpenMountId] = useState<string | null>(null);
  const [reconnectSecretByMountId, setReconnectSecretByMountId] = useState<Record<string, string>>(resetReconnectState);
  const [connectFlowError, setConnectFlowError] = useState<string | null>(null);

  const requiresSecret = draft.auth_type !== "none";

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
                  <li>Confirm auth only if the endpoint needs it.</li>
                  <li>On connect, Polynet validates the endpoint, discovers tools, and mounts the app to this community.</li>
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
                        secret: event.target.value === "none" ? "" : prev.secret,
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

              {requiresSecret ? (
                <label className="agent-capability-field">
                  <span className="agent-capability-field-label">
                    {draft.auth_type === "api_key" ? "API key" : "Bearer token"}
                  </span>
                  <input
                    type="password"
                    className="agent-editor-inline-label-input"
                    value={draft.secret ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, secret: event.target.value }))
                    }
                    placeholder={draft.auth_type === "api_key" ? "sk_live_..." : "token"}
                  />
                </label>
              ) : null}

              <div className="community-app-connect-summary">
                <div className="community-app-connect-summary-title">What happens when you connect</div>
                <ul className="community-app-connect-list">
                  <li>Polynet validates the MCP endpoint.</li>
                  <li>Polynet discovers the tool surface and risk labels.</li>
                  <li>The app is mounted into this community lens and can be refreshed or reconnected later.</li>
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
        <div className="agent-capability-list" role="list" aria-label="Community apps">
          {mounts.map((mount) => {
            const enabledToolNames = mount.tools
              .filter((tool) => tool.enabled)
              .map((tool) => tool.tool_name);
            const isUpdating = updatingMountId === mount.id;
            const isRefreshing = refreshingMountId === mount.id;
            const isReconnecting = reconnectingMountId === mount.id;
            const isRemoving = removingMountId === mount.id;
            const requiresReconnect = mount.app.auth_type !== "none";
            const reconnectSecret = reconnectSecretByMountId[mount.id] ?? "";
            const isReconnectOpen = reconnectOpenMountId === mount.id;
            return (
              <div key={mount.id} className="agent-capability-card" role="listitem">
                <div className="agent-capability-card-header">
                  <div>
                    <div className="agent-capability-card-title-row">
                      <div className="settings-section-subtitle">{mount.app.name}</div>
                      <span className={`community-app-status-badge${mount.enabled ? "" : " is-muted"}`}>
                        {mount.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="model-note">
                      {mount.app.endpoint_url}
                    </div>
                  </div>
                  <div className="agent-capability-toolbar-actions">
                    <button
                      type="button"
                      onClick={() => void onRefreshApp(mount.id)}
                      disabled={isRefreshing || isReconnecting || isRemoving || isUpdating}
                    >
                      {isRefreshing ? "Refreshing…" : "Refresh"}
                    </button>
                    {requiresReconnect ? (
                      <button
                        type="button"
                        onClick={() =>
                          setReconnectOpenMountId((prev) => (prev === mount.id ? null : mount.id))
                        }
                        disabled={isRefreshing || isReconnecting || isRemoving || isUpdating}
                      >
                        {isReconnectOpen ? "Close reconnect" : "Reconnect"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="agent-onboarding-reset"
                      onClick={() => void onUnmountApp(mount.id)}
                      disabled={isRemoving || isUpdating || isRefreshing || isReconnecting}
                    >
                      {isRemoving ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>

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

                <div className="agent-capability-field-grid">
                  <label className="agent-capability-field">
                    <span className="agent-capability-field-label">Mount enabled</span>
                    <select
                      className="agent-capability-select"
                      value={mount.enabled ? "enabled" : "disabled"}
                      onChange={(event) =>
                        void onUpdateMount(mount.id, {
                          enabled: event.target.value === "enabled",
                        })
                      }
                      disabled={isUpdating || isRemoving || isRefreshing || isReconnecting}
                    >
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </label>
                </div>

                {requiresReconnect && isReconnectOpen ? (
                  <div className="agent-capability-field">
                    <span className="agent-capability-field-label">
                      {mount.app.auth_type === "api_key" ? "API key" : "Bearer token"}
                    </span>
                    <div className="agent-capability-toolbar">
                      <input
                        type="password"
                        className="agent-editor-inline-label-input"
                        value={reconnectSecret}
                        onChange={(event) =>
                          setReconnectSecretByMountId((prev) => ({
                            ...prev,
                            [mount.id]: event.target.value,
                          }))
                        }
                        placeholder={mount.app.auth_type === "api_key" ? "sk_live_..." : "token"}
                        disabled={isReconnecting || isRefreshing || isRemoving || isUpdating}
                      />
                      <div className="agent-capability-toolbar-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setReconnectOpenMountId(null);
                            setReconnectSecretByMountId((prev) => ({ ...prev, [mount.id]: "" }));
                          }}
                          disabled={isReconnecting}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="platform-save-button is-dirty"
                          onClick={async () => {
                            const ok = await onReconnectApp(mount.id, reconnectSecret);
                            if (!ok) return;
                            setReconnectOpenMountId(null);
                            setReconnectSecretByMountId((prev) => ({ ...prev, [mount.id]: "" }));
                          }}
                          disabled={isReconnecting || !reconnectSecret.trim()}
                        >
                          {isReconnecting ? "Reconnecting…" : "Save secret"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

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
                            disabled={isUpdating || isRemoving || isRefreshing || isReconnecting}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
