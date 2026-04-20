import { useEffect, useMemo, useState } from "react";

import type { UserPlatformMountedApp } from "../../../../shared/userPlatformAppMountTypes";
import { DISCOVER_APP_CATALOG } from "../lib/discoverCatalog";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebIntegrationsSettingsSectionProps = {
  session: SessionLike;
  requireSignIn: () => void;
  openDiscoverApps: () => void;
  userPlatformAppMounts: UserPlatformMountedApp[];
  isLoadingUserPlatformAppMounts: boolean;
  userPlatformAppMountError: string | null;
  userPlatformAppMutationError: string | null;
  updatingUserPlatformAppMountId: string | null;
  refreshingUserPlatformAppMountId: string | null;
  reconnectingUserPlatformAppMountId: string | null;
  removingUserPlatformAppMountId: string | null;
  onUpdateUserPlatformAppMount: (
    userPlatformAppMountId: string,
    patch: {
      enabled?: boolean;
      enabledTools?: string[];
    },
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onRefreshUserPlatformApp: (
    userPlatformAppMountId: string,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onReconnectUserPlatformApp: (
    userPlatformAppMountId: string,
    secret: string,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onUnmountUserPlatformApp: (
    userPlatformAppMountId: string,
  ) => Promise<void> | Promise<boolean> | boolean | void;
};

function pluralizeTools(count: number): string {
  return `${count} ${count === 1 ? "tool" : "tools"}`;
}

function buildMountStatusLabel(mount: UserPlatformMountedApp): string {
  const count = mount.enabled_tools.length;
  const connectionStatus = String(mount.connection.connection_status ?? "").trim();
  const gatedCount = mount.tools.filter(
    (tool) => tool.enabled && tool.risk_level !== "read",
  ).length;
  if (!mount.enabled) {
    return `Disabled · ${pluralizeTools(count)}`;
  }
  if (
    mount.app.auth_type !== "none" &&
    connectionStatus &&
    connectionStatus !== "connected"
  ) {
    return `Reconnect required · ${pluralizeTools(count)}`;
  }
  if (gatedCount > 0) {
    return `${pluralizeTools(count)} active · ${gatedCount} need approval`;
  }
  return `${pluralizeTools(count)} active`;
}

function buildMountDetail(mount: UserPlatformMountedApp): string {
  const enabledCount = mount.enabled_tools.length;
  const gatedCount = mount.tools.filter(
    (tool) => tool.enabled && tool.risk_level !== "read",
  ).length;
  if (!mount.enabled) {
    return "Disabled in your platform layer.";
  }
  if (
    mount.app.auth_type !== "none" &&
    mount.connection.connection_status !== "connected"
  ) {
    return "Reconnect this app to restore its platform tools.";
  }
  if (gatedCount > 0) {
    return `${pluralizeTools(enabledCount)} mounted. ${gatedCount} write or sensitive tools stay blocked until the personal approval flow ships.`;
  }
  return `${pluralizeTools(enabledCount)} mounted in your baseline platform layer.`;
}

function findCatalogEntryForMount(mount: UserPlatformMountedApp) {
  const byEndpoint = DISCOVER_APP_CATALOG.find((entry) => {
    if (entry.personalConnect.connectionKind !== "known") return false;
    return (
      entry.personalConnect.endpointUrl === mount.app.endpoint_url &&
      entry.personalConnect.authType === mount.app.auth_type
    );
  });
  if (byEndpoint) return byEndpoint;
  const normalizedSlug = mount.app.slug.trim().toLowerCase();
  const normalizedName = mount.app.name.trim().toLowerCase();
  return (
    DISCOVER_APP_CATALOG.find(
      (entry) =>
        entry.id === normalizedSlug ||
        entry.name.trim().toLowerCase() === normalizedName,
    ) ?? null
  );
}

export function WebIntegrationsSettingsSection(
  props: WebIntegrationsSettingsSectionProps,
) {
  const {
    session,
    requireSignIn,
    openDiscoverApps,
    userPlatformAppMounts,
    isLoadingUserPlatformAppMounts,
    userPlatformAppMountError,
    userPlatformAppMutationError,
    updatingUserPlatformAppMountId,
    refreshingUserPlatformAppMountId,
    reconnectingUserPlatformAppMountId,
    removingUserPlatformAppMountId,
    onUpdateUserPlatformAppMount,
    onRefreshUserPlatformApp,
    onReconnectUserPlatformApp,
    onUnmountUserPlatformApp,
  } = props;

  const [reconnectDraftMountId, setReconnectDraftMountId] = useState<
    string | null
  >(null);
  const [openMountMenuId, setOpenMountMenuId] = useState<string | null>(null);
  const [reconnectSecret, setReconnectSecret] = useState("");
  const [reconnectError, setReconnectError] = useState<string | null>(null);

  const busyMountIds = useMemo(
    () =>
      new Set(
        [
          updatingUserPlatformAppMountId,
          refreshingUserPlatformAppMountId,
          reconnectingUserPlatformAppMountId,
          removingUserPlatformAppMountId,
        ].filter(Boolean) as string[],
      ),
    [
      reconnectingUserPlatformAppMountId,
      refreshingUserPlatformAppMountId,
      removingUserPlatformAppMountId,
      updatingUserPlatformAppMountId,
    ],
  );

  useEffect(() => {
    if (!openMountMenuId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-integration-menu-root="true"]')
      ) {
        return;
      }
      setOpenMountMenuId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openMountMenuId]);

  return (
    <>
      <div className="integrations-header">
        <div className="panel-title">Integrations</div>
        <button
          type="button"
          className="settings-cta integrations-header-action"
          onClick={session ? openDiscoverApps : requireSignIn}
        >
          {session ? "Connect apps" : "Sign in to connect"}
        </button>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <rect x="4" y="4" width="6" height="6" rx="1.5" />
            <rect x="14" y="4" width="6" height="6" rx="1.5" />
            <rect x="4" y="14" width="6" height="6" rx="1.5" />
            <rect x="14" y="14" width="6" height="6" rx="1.5" />
          </svg>
          My apps
        </div>
        <div className="settings-section-desc">
          Personal apps become part of your baseline platform tools and stay
          available across communities.
        </div>
        {!session ? (
          <div className="model-note">
            Sign in to connect personal apps at the platform level.
          </div>
        ) : null}
        {session && userPlatformAppMountError ? (
          <div className="auth-error">
            Couldn&apos;t load your personal apps right now. Try refreshing the
            page.
          </div>
        ) : null}
        {session && userPlatformAppMutationError ? (
          <div className="auth-error">{userPlatformAppMutationError}</div>
        ) : null}
        {session ? (
          <div className="integrations-app-list">
            {isLoadingUserPlatformAppMounts && userPlatformAppMounts.length === 0 ? (
              <div className="model-note">Loading your apps…</div>
            ) : null}
            {!isLoadingUserPlatformAppMounts && userPlatformAppMounts.length === 0 ? (
              <div className="model-note">
                No personal apps connected yet. Use `Connect apps` to browse the
                catalog.
              </div>
            ) : null}
            {userPlatformAppMounts.map((mount) => {
              const canReconnect = mount.app.auth_type !== "none";
              const isBusy = busyMountIds.has(mount.id);
              const isReconnectDraftOpen = reconnectDraftMountId === mount.id;
              const isReconnecting = reconnectingUserPlatformAppMountId === mount.id;
              const isMenuOpen = openMountMenuId === mount.id;
              const catalogEntry = findCatalogEntryForMount(mount);
              return (
                <div key={mount.id} className="integration-mounted-row">
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
                          <span className="integration-status-pill">
                            {buildMountStatusLabel(mount)}
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
                        className={`members-switch integration-mounted-switch${
                          isBusy ? " is-disabled" : ""
                        }`}
                        title={mount.enabled ? "Disable app" : "Enable app"}
                      >
                        <input
                          type="checkbox"
                          checked={mount.enabled}
                          disabled={isBusy}
                          aria-label={`${
                            mount.enabled ? "Disable" : "Enable"
                          } ${mount.app.name}`}
                          onChange={() =>
                            void onUpdateUserPlatformAppMount(mount.id, {
                              enabled: !mount.enabled,
                            })
                          }
                        />
                        <span className="members-switch-track">
                          <span className="members-switch-thumb" />
                        </span>
                      </label>
                      <div
                        className="integration-mounted-menu-shell"
                        data-integration-menu-root="true"
                      >
                        <button
                          type="button"
                          className="integration-mounted-menu-trigger"
                          aria-expanded={isMenuOpen}
                          aria-label={`${mount.app.name} options`}
                          disabled={isBusy}
                          onClick={() =>
                            setOpenMountMenuId((current) =>
                              current === mount.id ? null : mount.id,
                            )
                          }
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="5" cy="12" r="1.8" />
                            <circle cx="12" cy="12" r="1.8" />
                            <circle cx="19" cy="12" r="1.8" />
                          </svg>
                        </button>
                        {isMenuOpen ? (
                          <div
                            className="integration-mounted-menu"
                            role="menu"
                            aria-label={`${mount.app.name} actions`}
                          >
                            <button
                              type="button"
                              className="integration-mounted-menu-item"
                              disabled={isBusy}
                              onClick={() => {
                                setOpenMountMenuId(null);
                                void onRefreshUserPlatformApp(mount.id);
                              }}
                            >
                              {refreshingUserPlatformAppMountId === mount.id
                                ? "Refreshing…"
                                : "Refresh"}
                            </button>
                            {canReconnect ? (
                              <button
                                type="button"
                                className="integration-mounted-menu-item"
                                disabled={isBusy}
                                onClick={() => {
                                  setOpenMountMenuId(null);
                                  if (isReconnectDraftOpen) {
                                    setReconnectDraftMountId(null);
                                    setReconnectSecret("");
                                    setReconnectError(null);
                                    return;
                                  }
                                  setReconnectDraftMountId(mount.id);
                                  setReconnectSecret("");
                                  setReconnectError(null);
                                }}
                              >
                                {isReconnectDraftOpen ? "Cancel reconnect" : "Reconnect"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="integration-mounted-menu-item danger"
                              disabled={isBusy}
                              onClick={() => {
                                setOpenMountMenuId(null);
                                void onUnmountUserPlatformApp(mount.id);
                              }}
                            >
                              {removingUserPlatformAppMountId === mount.id
                                ? "Removing…"
                                : "Remove"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {isReconnectDraftOpen ? (
                    <div className="integration-reconnect-panel">
                      <label className="integration-reconnect-field">
                        <span className="agent-capability-field-label">
                          Paste a fresh token
                        </span>
                        <input
                          className="agent-editor-inline-label-input"
                          type="password"
                          value={reconnectSecret}
                          onChange={(event) => {
                            setReconnectSecret(event.target.value);
                            if (reconnectError) setReconnectError(null);
                          }}
                          placeholder={`Paste your ${mount.app.name} token`}
                        />
                      </label>
                      {reconnectError ? (
                        <div className="auth-error">{reconnectError}</div>
                      ) : null}
                      <div className="integration-reconnect-actions">
                        <button
                          type="button"
                          className="settings-cta"
                          disabled={isReconnecting}
                          onClick={async () => {
                            if (!reconnectSecret.trim()) {
                              setReconnectError(
                                `Paste a fresh ${mount.app.name} token to reconnect this app.`,
                              );
                              return;
                            }
                            const ok = await onReconnectUserPlatformApp(
                              mount.id,
                              reconnectSecret.trim(),
                            );
                            if (!ok) return;
                            setReconnectDraftMountId(null);
                            setReconnectSecret("");
                            setReconnectError(null);
                          }}
                        >
                          {isReconnecting ? "Reconnecting…" : "Confirm reconnect"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <path d="M7 7h10v10H7z" />
            <path d="M4 12h3m10 0h3M12 4v3m0 10v3" />
          </svg>
          My skills
        </div>
        <div className="settings-section-desc">
          Personal reusable skills will live here once they are wired at the global
          layer.
        </div>
        <div className="model-note">
          No personal skills yet. Community skills still stay scoped to the active
          collective.
        </div>
      </div>
    </>
  );
}
