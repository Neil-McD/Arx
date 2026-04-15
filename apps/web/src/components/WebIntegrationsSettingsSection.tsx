import { useMemo, useState } from "react";

import type { ConnectUserPlatformAppInput, UserPlatformMountedApp } from "../../../../shared/userPlatformAppMountTypes";
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
  openAuthGate: () => void;
  userPlatformAppMounts: UserPlatformMountedApp[];
  isLoadingUserPlatformAppMounts: boolean;
  userPlatformAppMountError: string | null;
  userPlatformAppMutationError: string | null;
  isConnectingUserPlatformApp: boolean;
  onConnectUserPlatformApp: (
    input: ConnectUserPlatformAppInput,
  ) => Promise<boolean> | boolean;
};

function buildMountStatusLabel(mount: UserPlatformMountedApp): string {
  const count = mount.enabled_tools.length;
  const toolLabel = count === 1 ? "tool" : "tools";
  const connectionStatus = String(mount.connection.connection_status ?? "").trim();
  if (connectionStatus === "connected") {
    return `${count} ${toolLabel} active in your platform layer`;
  }
  if (connectionStatus) {
    return `${count} ${toolLabel} mounted · ${connectionStatus.replace(/_/g, " ")}`;
  }
  return `${count} ${toolLabel} mounted`;
}

export function WebIntegrationsSettingsSection(
  props: WebIntegrationsSettingsSectionProps,
) {
  const {
    session,
    openAuthGate,
    userPlatformAppMounts,
    isLoadingUserPlatformAppMounts,
    userPlatformAppMountError,
    userPlatformAppMutationError,
    isConnectingUserPlatformApp,
    onConnectUserPlatformApp,
  } = props;
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [localConnectErrors, setLocalConnectErrors] = useState<
    Record<string, string | null>
  >({});

  const readyApps = useMemo(
    () =>
      DISCOVER_APP_CATALOG.filter(
        (entry) => entry.personalConnect.availability === "ready",
      ),
    [],
  );
  const mountedByCatalogId = useMemo(() => {
    const next = new Map<string, UserPlatformMountedApp>();
    for (const app of readyApps) {
      const mounted =
        userPlatformAppMounts.find(
          (mount) =>
            mount.app.endpoint_url === app.personalConnect.endpointUrl ||
            mount.app.slug === app.id,
        ) ?? null;
      if (mounted) {
        next.set(app.id, mounted);
      }
    }
    return next;
  }, [readyApps, userPlatformAppMounts]);

  const handleConnect = async (appId: string) => {
    const app = readyApps.find((entry) => entry.id === appId);
    if (!app) return;
    if (!session) {
      openAuthGate();
      return;
    }
    if (mountedByCatalogId.has(app.id)) return;
    if (!app.personalConnect.endpointUrl || !app.personalConnect.authType) {
      setLocalConnectErrors((prev) => ({
        ...prev,
        [app.id]: "This app is not ready for direct connection yet.",
      }));
      return;
    }
    const nextSecret = secretDrafts[app.id]?.trim() ?? "";
    if (app.personalConnect.requiresSecret && !nextSecret) {
      setLocalConnectErrors((prev) => ({
        ...prev,
        [app.id]: `Paste your ${
          app.personalConnect.secretLabel ?? `${app.name} token`
        } to connect ${app.name}.`,
      }));
      return;
    }
    setLocalConnectErrors((prev) => ({ ...prev, [app.id]: null }));
    const ok = await onConnectUserPlatformApp({
      name: app.name,
      endpoint_url: app.personalConnect.endpointUrl,
      auth_type: app.personalConnect.authType,
      description: app.description,
      secret: app.personalConnect.requiresSecret ? nextSecret : undefined,
    });
    if (!ok) return;
    setSecretDrafts((prev) => ({ ...prev, [app.id]: "" }));
  };

  return (
    <>
      <div className="panel-title">Integrations</div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <rect x="4" y="4" width="6" height="6" rx="1.5" />
            <rect x="14" y="4" width="6" height="6" rx="1.5" />
            <rect x="4" y="14" width="6" height="6" rx="1.5" />
            <rect x="14" y="14" width="6" height="6" rx="1.5" />
          </svg>
          Personal apps
        </div>
        <div className="settings-section-desc">
          These apps become part of your baseline platform tools and stay available
          across communities.
        </div>
        {!session ? (
          <div className="account-row">
            <div className="account-identity">
              <span>Sign in required</span>
              <strong>Connect personal apps to your platform layer.</strong>
            </div>
            <button type="button" onClick={openAuthGate}>
              Sign in
            </button>
          </div>
        ) : null}
        {session && userPlatformAppMountError ? (
          <div className="auth-error">
            Couldn&apos;t load your personal apps right now. Try refreshing the
            page.
          </div>
        ) : null}
        {session && userPlatformAppMutationError ? (
          <div className="auth-error">
            Couldn&apos;t update your personal apps right now. Try again.
          </div>
        ) : null}
        {session ? (
          <div className="integrations-app-list">
            {isLoadingUserPlatformAppMounts && userPlatformAppMounts.length === 0 ? (
              <div className="model-note">Loading your personal apps…</div>
            ) : null}
            {!isLoadingUserPlatformAppMounts && userPlatformAppMounts.length === 0 ? (
              <div className="model-note">
                No personal apps connected yet. Start with Supabase or Linear below.
              </div>
            ) : null}
            {userPlatformAppMounts.map((mount) => (
              <div key={mount.id} className="integration-mounted-row">
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
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h10" />
            <path d="M18 4v16" />
          </svg>
          Connect now
        </div>
        <div className="settings-section-desc">
          Only honest direct-connect apps are shown here. OAuth-heavy apps stay in
          the catalog until the auth path is real.
        </div>
        <div className="integrations-ready-grid">
          {readyApps.map((app) => {
            const mounted = mountedByCatalogId.get(app.id) ?? null;
            const localError = localConnectErrors[app.id] ?? null;
            return (
              <div key={app.id} className="integration-ready-card">
                <div className="integration-ready-header">
                  <DiscoverCatalogLogo
                    name={app.name}
                    logoUrl={app.logoUrl}
                    logoUrlDark={app.logoUrlDark}
                  />
                  <div className="integration-ready-copy">
                    <div className="integration-ready-title">{app.name}</div>
                    <div className="integration-ready-tagline">{app.tagline}</div>
                  </div>
                </div>
                <div className="integration-ready-note">{app.personalConnect.note}</div>
                <div className="integration-ready-meta">
                  <span>{app.personalConnect.authLabel}</span>
                  <span>{app.personalConnect.endpointUrl}</span>
                </div>
                {app.personalConnect.requiresSecret ? (
                  <input
                    className="integration-secret-input"
                    type="password"
                    value={secretDrafts[app.id] ?? ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSecretDrafts((prev) => ({
                        ...prev,
                        [app.id]: nextValue,
                      }));
                      if (localConnectErrors[app.id]) {
                        setLocalConnectErrors((prev) => ({
                          ...prev,
                          [app.id]: null,
                        }));
                      }
                    }}
                    placeholder={`Paste your ${
                      app.personalConnect.secretLabel ?? "token"
                    }`}
                  />
                ) : null}
                {localError ? <div className="auth-error">{localError}</div> : null}
                <div className="integration-ready-actions">
                  <button
                    type="button"
                    className={mounted ? "secondary" : "primary"}
                    disabled={Boolean(mounted) || isConnectingUserPlatformApp}
                    onClick={() => void handleConnect(app.id)}
                  >
                    {mounted
                      ? "Connected"
                      : !session
                        ? "Sign in to connect"
                        : isConnectingUserPlatformApp
                          ? "Connecting…"
                          : "Connect"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <path d="M7 7h10v10H7z" />
            <path d="M4 12h3m10 0h3M12 4v3m0 10v3" />
          </svg>
          Personal skills
        </div>
        <div className="settings-section-desc">
          Personal skill installs are not wired yet. Skills still live on the
          community layer for now.
        </div>
        <div className="model-note">
          Keep this page honest for alpha: personal apps are real here now, personal
          skills come later.
        </div>
      </div>
    </>
  );
}
