import { useEffect, useState } from "react";

import type {
  AddPrivateCommunityMcpAppResult,
  CommunityMountedApp,
  PrivateCommunityMcpOption,
} from "../../../../shared/communityAppMountTypes";
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

function formatPrivateMcpOptionStatus(option: PrivateCommunityMcpOption): string {
  if (!option.addable) return "Not available";
  if (option.add_status === "needs_auth") return "Needs auth";
  if (option.add_status === "needs_config") return "Needs config";
  return "Ready";
}

function formatPrivateMcpOptionActionLabel(args: {
  option: PrivateCommunityMcpOption;
  alreadyMounted: boolean;
  isAdding: boolean;
}): string {
  if (args.isAdding) return "Adding...";
  if (args.alreadyMounted) return "Added";
  if (!args.option.addable) return "Unavailable";
  return "Add";
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
  privateMcpOptions: PrivateCommunityMcpOption[];
  isLoadingPrivateMcpOptions: boolean;
  hasLoadedPrivateMcpOptionsForActiveCommunity: boolean;
  privateMcpOptionsError: string | null;
  addingPrivateMcpRegistryId: string | null;
  updatingMountId: string | null;
  refreshingMountId: string | null;
  removingMountId: string | null;
  onLoadPrivateMcpOptions: () => Promise<boolean> | boolean;
  onAddPrivateMcpApp: (
    mcpRegistryId: string,
  ) => Promise<AddPrivateCommunityMcpAppResult | null> | AddPrivateCommunityMcpAppResult | null;
  onUpdateMount: (
    communityAppMountId: string,
    patch: {
      enabled?: boolean;
      enabledTools?: string[];
    },
  ) => Promise<boolean> | boolean;
  onRefreshApp: (communityAppMountId: string) => Promise<boolean> | boolean;
  onUnmountApp: (communityAppMountId: string) => Promise<boolean> | boolean;
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
    privateMcpOptions,
    isLoadingPrivateMcpOptions,
    hasLoadedPrivateMcpOptionsForActiveCommunity,
    privateMcpOptionsError,
    addingPrivateMcpRegistryId,
    updatingMountId,
    refreshingMountId,
    removingMountId,
    onLoadPrivateMcpOptions,
    onAddPrivateMcpApp,
    onUpdateMount,
    onRefreshApp,
    onUnmountApp,
  } = props;
  const [editingMountId, setEditingMountId] = useState<string | null>(null);
  const [isPrivateMcpPickerOpen, setIsPrivateMcpPickerOpen] = useState(false);
  const [privateMcpPickerMessage, setPrivateMcpPickerMessage] = useState<string | null>(null);
  const mountedMcpRegistryIds = new Set(
    mounts
      .map((mount) => mount.app.mcp_registry_id)
      .filter((value): value is string => Boolean(value)),
  );

  const handleTogglePrivateMcpPicker = () => {
    const nextOpen = !isPrivateMcpPickerOpen;
    setIsPrivateMcpPickerOpen(nextOpen);
    setPrivateMcpPickerMessage(null);
  };

  useEffect(() => {
    if (
      !isPrivateMcpPickerOpen ||
      isLoadingPrivateMcpOptions ||
      hasLoadedPrivateMcpOptionsForActiveCommunity
    ) {
      return;
    }
    void onLoadPrivateMcpOptions();
  }, [
    hasLoadedPrivateMcpOptionsForActiveCommunity,
    isLoadingPrivateMcpOptions,
    isPrivateMcpPickerOpen,
    onLoadPrivateMcpOptions,
  ]);

  useEffect(() => {
    if (!hasLoadedPrivateMcpOptionsForActiveCommunity) {
      setPrivateMcpPickerMessage(null);
    }
  }, [hasLoadedPrivateMcpOptionsForActiveCommunity]);

  const handleAddPrivateMcp = async (option: PrivateCommunityMcpOption) => {
    if (!option.addable || mountedMcpRegistryIds.has(option.mcp_registry_id)) return;
    setPrivateMcpPickerMessage(null);
    const result = await onAddPrivateMcpApp(option.mcp_registry_id);
    if (!result?.ok) {
      setPrivateMcpPickerMessage(
        result?.error_message ?? `Couldn't add ${option.name} right now.`,
      );
      return;
    }
    setPrivateMcpPickerMessage(`${result.name ?? option.name} added.`);
  };

  const shouldShowPrivateMcpLoading =
    isLoadingPrivateMcpOptions ||
    (isPrivateMcpPickerOpen && !hasLoadedPrivateMcpOptionsForActiveCommunity);

  return (
    <div className="settings-section">
      <div className="model-note agent-editor-intro">{intro}</div>

      <div className="agent-capability-toolbar">
        <button
          type="button"
          onClick={handleTogglePrivateMcpPicker}
          disabled={isConnecting || addingPrivateMcpRegistryId !== null}
          aria-expanded={isPrivateMcpPickerOpen}
        >
          {isPrivateMcpPickerOpen ? `${addButtonLabel} ▴` : addButtonLabel}
        </button>
      </div>

      {isPrivateMcpPickerOpen ? (
        <div className="community-private-mcp-picker">
          <div className="community-private-mcp-picker-header">
            <div>
              <div className="settings-section-subtitle">Add trusted MCP</div>
              <div className="model-note">
                Attach MCPs this community can offer to members. Members use their own accounts when setup is required.
              </div>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => void onLoadPrivateMcpOptions()}
              disabled={shouldShowPrivateMcpLoading}
            >
              {shouldShowPrivateMcpLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {privateMcpOptionsError ? (
            <div className="auth-error">{privateMcpOptionsError}</div>
          ) : null}
          {privateMcpPickerMessage ? (
            <div className="model-note">{privateMcpPickerMessage}</div>
          ) : null}
          {shouldShowPrivateMcpLoading ? (
            <div className="model-note">Loading MCPs...</div>
          ) : privateMcpOptions.length === 0 ? (
            <div className="model-note">No reviewed MCPs are available yet.</div>
          ) : (
            <div
              className="community-private-mcp-option-list"
              role="list"
              aria-label="Reviewed MCP options"
            >
              {privateMcpOptions.map((option) => {
                const alreadyMounted = mountedMcpRegistryIds.has(option.mcp_registry_id);
                const isAdding = addingPrivateMcpRegistryId === option.mcp_registry_id;
                const disabled =
                  alreadyMounted ||
                  !option.addable ||
                  Boolean(addingPrivateMcpRegistryId) ||
                  isConnecting;
                return (
                  <div
                    key={option.mcp_registry_id}
                    className="community-private-mcp-option"
                    role="listitem"
                  >
                    <DiscoverCatalogLogo
                      name={option.name}
                      logoUrl={option.logo_url}
                    />
                    <div className="community-private-mcp-option-copy">
                      <div className="community-private-mcp-option-title-row">
                        <strong>{option.name}</strong>
                      </div>
                      {option.description ? (
                        <div className="community-private-mcp-option-description">
                          {option.description}
                        </div>
                      ) : null}
                      {!option.addable && option.add_blocked_reason ? (
                        <div className="community-private-mcp-option-description is-muted">
                          {option.add_blocked_reason}
                        </div>
                      ) : null}
                    </div>
                    <div className="community-private-mcp-option-actions">
                      <span
                        className={`community-app-status-badge${
                          option.addable ? "" : " is-muted"
                        }`}
                      >
                        {formatPrivateMcpOptionStatus(option)}
                      </span>
                      <button
                        type="button"
                        className="community-private-mcp-option-action"
                        onClick={() => void handleAddPrivateMcp(option)}
                        disabled={disabled}
                        aria-label={`${formatPrivateMcpOptionActionLabel({
                          option,
                          alreadyMounted,
                          isAdding,
                        })} ${option.name}`}
                      >
                        {formatPrivateMcpOptionActionLabel({
                          option,
                          alreadyMounted,
                          isAdding,
                        })}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

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
                        Refresh only re-checks the community app bundle entry and discovered personal-tool surface. Members still use their own harness credentials.
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
                        <span className="agent-capability-field-label">
                          Default personal tools
                        </span>
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
                          <span className="agent-capability-field-label">
                            Default personal tools
                          </span>
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
                        <div className="model-note">No personal tools available yet.</div>
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
