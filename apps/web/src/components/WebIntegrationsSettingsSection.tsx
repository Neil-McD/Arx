import type { UserPlatformMountedApp } from "../../../../shared/userPlatformAppMountTypes";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebIntegrationsSettingsSectionProps = {
  session: SessionLike;
  openAuthGate: () => void;
  openDiscoverApps: () => void;
  userPlatformAppMounts: UserPlatformMountedApp[];
  isLoadingUserPlatformAppMounts: boolean;
  userPlatformAppMountError: string | null;
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
    openDiscoverApps,
    userPlatformAppMounts,
    isLoadingUserPlatformAppMounts,
    userPlatformAppMountError,
  } = props;

  return (
    <>
      <div className="integrations-header">
        <div className="panel-title">Integrations</div>
        <button
          type="button"
          className="settings-cta integrations-header-action"
          onClick={session ? openDiscoverApps : openAuthGate}
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
