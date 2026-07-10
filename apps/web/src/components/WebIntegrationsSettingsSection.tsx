import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";

import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import type { UserPlatformInstalledSkill } from "../../../../shared/userPlatformSkillTypes";
import type { EffectiveMcpApp } from "../../../../shared/effectiveMcpApps";
import type { EffectiveSkill } from "../../../../shared/effectiveSkills";
import type { DeveloperAppAuthType } from "../../../../shared/communityAppMountTypes";
import type {
  BeginUserPlatformAppOAuthOptions,
  BeginUserPlatformAppOAuthResult,
  ConnectUserPlatformAppInput,
  ConnectUserPlatformAppResult,
} from "../../../../shared/userPlatformAppMountTypes";
import { tryCopyTextToClipboard } from "../../../../shared/chatUi";
import { isDiscoverAppPersonallyConnectable } from "../lib/discoverCatalog";
import { buildIntegrationSurfaceRowFromEffectiveApp } from "../lib/integrationSurfaceRows";
import { usePersonalAppSetupController } from "../controllers/usePersonalAppSetupController";
import { findDiscoverCatalogEntryForAppIdentity } from "../lib/discoverCatalogMatching";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";
import { PersonalAppSetupModal } from "./PersonalAppSetupModal";

const POLYNET_MCP_ENDPOINT_URL = "https://www.polynet.ai/runtime/mcp";
const POLYNET_MCP_TOOL_COUNT_LABEL = "15 workspace tools";
const POLYNET_MCP_CLAUDE_CODE_ADD_COMMAND = `claude mcp add --transport http polynet ${POLYNET_MCP_ENDPOINT_URL}`;
const POLYNET_MCP_CODEX_ADD_COMMAND = `codex mcp add polynet --url ${POLYNET_MCP_ENDPOINT_URL}`;
const POLYNET_MCP_CODEX_LOGIN_FALLBACK_COMMAND =
  "codex mcp login polynet --scopes openid,profile,email,offline_access";
const POLYNET_MCP_CODEX_DURABLE_CONFIG = [
  '# Optional: keep MCP OAuth credentials in the OS keychain when available.',
  'mcp_oauth_credentials_store = "keyring"',
].join("\n");
const POLYNET_MCP_GENERIC_HTTP_CONFIG = JSON.stringify(
  {
    mcpServers: {
      polynet: {
        type: "http",
        url: POLYNET_MCP_ENDPOINT_URL,
      },
    },
  },
  null,
  2,
);
const POLYNET_MCP_SETUP_BUNDLE = [
  "# Polynet Setup Packet",
  "",
  "You are helping the user connect this AI harness to Polynet.",
  "",
  "Goal:",
  "Connect Polynet so this harness can access the user's Polynet communities, resources, and workspace memory.",
  "",
  "Polynet MCP endpoint:",
  POLYNET_MCP_ENDPOINT_URL,
  "",
  "## Operating Rules",
  "",
  "- Keep the setup focused on Polynet.",
  "- Do not ask for or paste access tokens.",
  "- Do not repair unrelated shell aliases, package managers, or local installs unless the user explicitly asks.",
  "- If this harness cannot run a setup command or open an interactive auth panel, give the user the exact next command or click path and stop.",
  "- Use `polynet` as the server alias for new setup. If Polynet is already configured under another name, authenticate that existing server instead of adding a duplicate.",
  "- If Polynet is already configured but says it needs authentication, skip setup debugging and move directly to sign-in.",
  "",
  "## OAuth Link Handling",
  "",
  "If this harness receives a Polynet authorization URL, do not paste the raw full URL unless there is no other option.",
  "",
  "Prefer this order:",
  "1. Open the authorization URL automatically if this harness can open browser links.",
  "2. Otherwise show a markdown link: [Sign in to Polynet](AUTHORIZATION_URL).",
  "3. Only show the raw authorization URL if the harness cannot open links and cannot render markdown links.",
  "",
  "Only ask the user to paste the localhost callback URL back if the browser callback fails or says the page cannot be reached.",
  "",
  "If the user pastes a callback URL that contains a `code`, treat it as a one-time OAuth credential and use it only to complete sign-in.",
  "",
  "## What To Do",
  "",
  "1. Identify which harness you are running in.",
  "2. Add Polynet with the matching setup path below, unless Polynet is already configured.",
  "3. If authentication is needed, give the user one clear sign-in action for this harness.",
  "4. After sign-in, verify the connection by listing the user's Polynet workspaces.",
  "5. If this already-open chat cannot see the tools after sign-in, tell the user to start a fresh chat or reconnect tools.",
  "6. Tell the user when Polynet is connected.",
  "",
  "## Claude Code",
  "",
  "Add Polynet:",
  "",
  "```bash",
  POLYNET_MCP_CLAUDE_CODE_ADD_COMMAND,
  "```",
  "",
  "If that command is not available in this session, ask the user to run the same command in an interactive Claude Code terminal. Do not troubleshoot Claude installation paths unless the user asks.",
  "",
  "Authenticate:",
  "",
  "```text",
  "/mcp",
  "```",
  "",
  "Run `/mcp`, select `polynet`, then complete Polynet sign-in in the browser.",
  "",
  "If Claude Code gives you an authorization URL, open it if possible. If you must show it to the user, show it as [Sign in to Polynet](AUTHORIZATION_URL), not as a raw URL block.",
  "",
  "If Polynet already appears as `Needs authentication`, do not re-add it. Ask the user to run `/mcp`, select that server, and sign in.",
  "",
  "## Codex",
  "",
  "Optional before OAuth, in `~/.codex/config.toml`:",
  "",
  "```toml",
  POLYNET_MCP_CODEX_DURABLE_CONFIG,
  "```",
  "",
  "Add Polynet:",
  "",
  "```bash",
  POLYNET_MCP_CODEX_ADD_COMMAND,
  "```",
  "",
  "If Polynet is already configured, do not add it again.",
  "",
  "Only if Codex does not open OAuth during add, run:",
  "",
  "```bash",
  POLYNET_MCP_CODEX_LOGIN_FALLBACK_COMMAND,
  "```",
  "",
  "## Cursor Or Other JSON-Based Harnesses",
  "",
  "Use this HTTP MCP config:",
  "",
  "```json",
  POLYNET_MCP_GENERIC_HTTP_CONFIG,
  "```",
  "",
  "## After Sign-In",
  "",
  "If the browser shows:",
  "",
  "```text",
  "Authentication complete. You may close this window.",
  "```",
  "",
  "Close that tab and return to this harness.",
  "",
  "The harness owns local credential storage. One successful sign-in should persist for that harness profile or device.",
  "",
  "If this chat was already open before sign-in, start a fresh chat or reconnect tools so the harness picks up the new connection.",
  "",
  "## Verify",
  "",
  "After setup, use Polynet to list the user's Polynet workspaces.",
  "",
  "If Polynet tools are not visible after sign-in, tell the user to start a fresh chat or reconnect tools. Do not repeat OAuth unless the harness still says authentication is required.",
  "",
  "If successful, tell the user:",
  "",
  "```text",
  "Polynet is connected. I can now use your Polynet communities, resources, and workspace memory.",
  "```",
  "",
  "## Usage Guidance",
  "",
  "Use Polynet when the user asks about:",
  "- Polynet communities",
  "- workspace memory",
  "- accepted community context",
  "- resources",
  "- prior decisions",
  "- playbooks",
  "- warnings",
  "- outcomes",
  "",
  "Before using workspace-specific memory, list or open the relevant Polynet workspace.",
  "",
  "Treat workspace context IDs as opaque selectors. Do not invent them.",
].join("\n");

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebIntegrationsSettingsSectionProps = {
  session: SessionLike;
  requireSignIn: () => void;
  effectiveMcpApps: EffectiveMcpApp[];
  isLoadingEffectiveMcpApps: boolean;
  effectiveMcpAppsError: string | null;
  effectiveSkills: EffectiveSkill[];
  isLoadingEffectiveSkills: boolean;
  effectiveSkillsError: string | null;
  isLoadingUserPlatformAppMounts: boolean;
  userPlatformAppMountError: string | null;
  userPlatformAppMutationError: string | null;
  isConnectingUserPlatformApp: boolean;
  updatingUserPlatformAppMountId: string | null;
  refreshingUserPlatformAppMountId: string | null;
  refreshingCommunityAppMountId: string | null;
  reconnectingUserPlatformAppMountId: string | null;
  removingUserPlatformAppMountId: string | null;
  onConnectUserPlatformApp: (
    input: ConnectUserPlatformAppInput,
  ) => Promise<ConnectUserPlatformAppResult>;
  onBeginUserPlatformAppOAuth: (
    catalogAppId: string,
    options?: BeginUserPlatformAppOAuthOptions,
  ) => Promise<BeginUserPlatformAppOAuthResult>;
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
  onSetupImportedCommunityMcpApp: (input: {
    community_app_mount_id: string;
    endpoint_url: string;
    auth_type: DeveloperAppAuthType;
    secret?: string;
  }) => Promise<void> | Promise<boolean> | boolean | void;
  onUnmountUserPlatformApp: (
    userPlatformAppMountId: string,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  userPlatformSkills: UserPlatformInstalledSkill[];
  isLoadingUserPlatformSkills: boolean;
  userPlatformSkillError: string | null;
  userPlatformSkillMutationError: string | null;
  isCreatingUserPlatformSkill: boolean;
  updatingUserPlatformSkillInstallId: string | null;
  removingUserPlatformSkillInstallId: string | null;
  onCreateUserPlatformSkill: (
    input: CreateSkillPackageInput,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onSaveUserPlatformSkill: (
    userPlatformSkillInstallId: string,
    input: CreateSkillPackageInput,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onUpdateUserPlatformSkill: (
    userPlatformSkillInstallId: string,
    patch: {
      enabled?: boolean;
    },
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onDeleteUserPlatformSkill: (
    userPlatformSkillInstallId: string,
  ) => Promise<void> | Promise<boolean> | boolean | void;
};

function buildInitialSkillDraft(): CreateSkillPackageInput {
  return {
    name: "",
    description: "",
    instructions_md: "",
  };
}

function buildSkillDraftFromInstall(
  install: UserPlatformInstalledSkill,
): CreateSkillPackageInput {
  return {
    name: install.skill.name,
    description: install.skill.description ?? "",
    instructions_md: install.skill.instructionsMd,
  };
}

function buildEffectiveHarnessSummary(apps: EffectiveMcpApp[]): string {
  const liveCount = apps.filter((app) => app.live_for_current_user).length;
  const setupCount = apps.filter(
    (app) => !app.live_for_current_user && app.credential_state === "needs_personal_setup",
  ).length;
  const communityAttachmentCount = apps.filter(
    (app) => app.is_attached_to_community,
  ).length;
  const notLiveCount = apps.length - liveCount;
  const scopeLabel = `${apps.length} ${apps.length === 1 ? "app" : "apps"}`;
  const communitySuffix =
    communityAttachmentCount > 0
      ? ` ${communityAttachmentCount} attached to selected community.`
      : "";
  if (apps.length === 0) return "No apps connected yet.";
  if (notLiveCount === 0) return `${scopeLabel}. ${liveCount} live.${communitySuffix}`;
  if (setupCount === notLiveCount) {
    return `${scopeLabel}. ${liveCount} live, ${setupCount} need setup.${communitySuffix}`;
  }
  return `${scopeLabel}. ${liveCount} live, ${notLiveCount} not live.${communitySuffix}`;
}

export function WebIntegrationsSettingsSection(
  props: WebIntegrationsSettingsSectionProps,
) {
  const {
    session,
    requireSignIn,
    effectiveMcpApps,
    isLoadingEffectiveMcpApps,
    effectiveMcpAppsError,
    effectiveSkills,
    isLoadingEffectiveSkills,
    effectiveSkillsError,
    isLoadingUserPlatformAppMounts,
    userPlatformAppMountError,
    userPlatformAppMutationError,
    isConnectingUserPlatformApp,
    updatingUserPlatformAppMountId,
    refreshingUserPlatformAppMountId,
    refreshingCommunityAppMountId,
    reconnectingUserPlatformAppMountId,
    removingUserPlatformAppMountId,
    onConnectUserPlatformApp,
    onBeginUserPlatformAppOAuth,
    onUpdateUserPlatformAppMount,
    onRefreshUserPlatformApp,
    onReconnectUserPlatformApp,
    onSetupImportedCommunityMcpApp,
    onUnmountUserPlatformApp,
    userPlatformSkills,
    isLoadingUserPlatformSkills,
    userPlatformSkillError,
    userPlatformSkillMutationError,
    isCreatingUserPlatformSkill,
    updatingUserPlatformSkillInstallId,
    removingUserPlatformSkillInstallId,
    onCreateUserPlatformSkill,
    onSaveUserPlatformSkill,
    onUpdateUserPlatformSkill,
    onDeleteUserPlatformSkill,
  } = props;

  const [reconnectDraftMountId, setReconnectDraftMountId] = useState<
    string | null
  >(null);
  const [openMountMenuId, setOpenMountMenuId] = useState<string | null>(null);
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [skillDraft, setSkillDraft] = useState<CreateSkillPackageInput>(
    buildInitialSkillDraft,
  );
  const [editingUserPlatformSkillInstallId, setEditingUserPlatformSkillInstallId] =
    useState<string | null>(null);
  const [editingSkillDraft, setEditingSkillDraft] =
    useState<CreateSkillPackageInput>(buildInitialSkillDraft);
  const [reconnectSecret, setReconnectSecret] = useState("");
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [polyMcpCopyState, setPolyMcpCopyState] = useState<
    "idle" | "copied" | "error"
  >("idle");

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

  const visibleEffectiveMcpApps = useMemo(
    () =>
      [...effectiveMcpApps].sort((left, right) =>
        left.app.name.localeCompare(right.app.name),
      ),
    [effectiveMcpApps],
  );
  const personalAppSetup = usePersonalAppSetupController({
    hasSession: Boolean(session),
    requireSignIn,
    isConnecting: isConnectingUserPlatformApp,
    refreshingPersonalMountId: refreshingUserPlatformAppMountId,
    refreshingCommunityMountId: refreshingCommunityAppMountId,
    reconnectingPersonalMountId: reconnectingUserPlatformAppMountId,
    onConnectApp: onConnectUserPlatformApp,
    onBeginOAuth: onBeginUserPlatformAppOAuth,
    onRefreshApp: onRefreshUserPlatformApp,
    onReconnectApp: onReconnectUserPlatformApp,
    onSetupImportedCommunityMcpApp,
  });

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

  useEffect(() => {
    if (polyMcpCopyState === "idle") return;
    const timeout = window.setTimeout(() => setPolyMcpCopyState("idle"), 2200);
    return () => window.clearTimeout(timeout);
  }, [polyMcpCopyState]);

  const handleCreatePersonalSkill = async () => {
    const ok = await onCreateUserPlatformSkill(skillDraft);
    if (!ok) return;
    setSkillDraft(buildInitialSkillDraft());
    setIsCreateSkillOpen(false);
  };

  const handleSavePersonalSkill = async () => {
    if (!editingUserPlatformSkillInstallId) return;
    const ok = await onSaveUserPlatformSkill(
      editingUserPlatformSkillInstallId,
      editingSkillDraft,
    );
    if (!ok) return;
    setEditingUserPlatformSkillInstallId(null);
    setEditingSkillDraft(buildInitialSkillDraft());
  };

  const handleCopyPolyMcpSetup = async () => {
    try {
      const copied = await tryCopyTextToClipboard(POLYNET_MCP_SETUP_BUNDLE);
      setPolyMcpCopyState(copied ? "copied" : "error");
    } catch {
      setPolyMcpCopyState("error");
    }
  };

  return (
    <>
      <div className="integrations-header">
        <div className="panel-title">Integrations</div>
      </div>

      {session ? (
        <div className="settings-section">
          <div className="settings-section-title">
            <svg viewBox="0 0 24 24">
              <path d="M12 4v16" />
              <path d="M4 12h16" />
              <path d="M7 7h10v10H7z" />
            </svg>
            Polynet
          </div>
          <div className="settings-section-desc">
            Connect Codex, Claude Code, Cursor, or another AI harness to your
            Polynet workspace memory.
          </div>
          <div className="integrations-app-list">
            <div className="integration-mounted-row polymcp-access-row">
              <div className="integration-mounted-top">
                <div className="integration-mounted-identity">
                  <DiscoverCatalogLogo
                    name="Polynet"
                    logoUrl="/landing-polynet/logo.png"
                  />
                  <div className="integration-mounted-main">
                    <div className="integration-mounted-title-row">
                      <strong>Polynet</strong>
                      <span className="integration-status-pill">
                        {POLYNET_MCP_TOOL_COUNT_LABEL}
                      </span>
                      <span className="integration-status-pill">
                        OAuth protected
                      </span>
                    </div>
                    <div className="integration-mounted-detail">
                      Copy one setup packet, paste it into Codex, Claude Code,
                      Cursor, or another AI harness, then sign in once.
                    </div>
                  </div>
                </div>
                <div className="integration-mounted-rail polymcp-access-actions">
                  <button
                    type="button"
                    className="settings-cta polymcp-copy-action"
                    onClick={() => void handleCopyPolyMcpSetup()}
                    aria-label="Copy Polynet setup"
                  >
                    <Copy aria-hidden="true" />
                    {polyMcpCopyState === "copied"
                      ? "Copied"
                      : polyMcpCopyState === "error"
                        ? "Copy failed"
                        : "Copy setup"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <rect x="4" y="4" width="6" height="6" rx="1.5" />
            <rect x="14" y="4" width="6" height="6" rx="1.5" />
            <rect x="4" y="14" width="6" height="6" rx="1.5" />
            <rect x="14" y="14" width="6" height="6" rx="1.5" />
          </svg>
          Connected apps
        </div>
        <div className="settings-section-desc">
          Apps available to workspace tools.
        </div>
        {session ? (
          <div className="model-note">
            {isLoadingEffectiveMcpApps && effectiveMcpApps.length === 0
              ? "Loading harness status..."
              : effectiveMcpAppsError
                ? "Could not load unified harness status yet."
                : buildEffectiveHarnessSummary(effectiveMcpApps)}
          </div>
        ) : null}
        {!session ? (
          <div className="model-note">
            Sign in to connect personal apps to your harness.
          </div>
        ) : null}
        {session && (userPlatformAppMountError || effectiveMcpAppsError) ? (
          <div className="auth-error">
            Couldn&apos;t load your active harness apps right now. Try refreshing
            the page.
          </div>
        ) : null}
        {session && userPlatformAppMutationError ? (
          <div className="auth-error">{userPlatformAppMutationError}</div>
        ) : null}
        {session ? (
          <div className="integrations-app-list">
            {(isLoadingUserPlatformAppMounts || isLoadingEffectiveMcpApps) &&
            visibleEffectiveMcpApps.length === 0 ? (
              <div className="model-note">Loading your active harness apps…</div>
            ) : null}
            {!isLoadingUserPlatformAppMounts &&
            !isLoadingEffectiveMcpApps &&
            visibleEffectiveMcpApps.length === 0 ? (
              <div className="model-note">
                No apps are connected to this harness yet.
              </div>
            ) : null}
            {visibleEffectiveMcpApps.map((effectiveApp) => {
              const personalMount = effectiveApp.personal_mount;
              const actionMount = personalMount;
              const sourceMountId = actionMount?.source_mount_id ?? null;
              const canManagePersonal = Boolean(actionMount && sourceMountId);
              const canReconnect = Boolean(
                actionMount && sourceMountId && effectiveApp.app.auth_type !== "none",
              );
              const isBusy = Boolean(sourceMountId && busyMountIds.has(sourceMountId));
              const isReconnectDraftOpen =
                reconnectDraftMountId === effectiveApp.app_identity_key;
              const isReconnecting =
                sourceMountId !== null &&
                reconnectingUserPlatformAppMountId === sourceMountId;
              const isMenuOpen = openMountMenuId === effectiveApp.app_identity_key;
              const catalogEntry = findDiscoverCatalogEntryForAppIdentity(
                effectiveApp.app,
              );
              const importedCommunityMount = effectiveApp.community_mount;
              const canSetupImportedCommunity = Boolean(
                importedCommunityMount?.app.mcp_registry_id &&
                  (importedCommunityMount.app.setup_status === "needs_auth" ||
                    importedCommunityMount.app.setup_status === "needs_config"),
              );
              const canSetupPersonal =
                effectiveApp.primary_action === "setup_personal" &&
                Boolean(
                  (catalogEntry &&
                    isDiscoverAppPersonallyConnectable(catalogEntry)) ||
                    canSetupImportedCommunity,
                );
              const row = buildIntegrationSurfaceRowFromEffectiveApp(effectiveApp, {
                enabled:
                  actionMount?.enabled ??
                  effectiveApp.community_mount?.enabled ??
                  true,
                canSetup: canSetupPersonal,
                isBusy,
              });
              const communityScopeLabel = row.communityMount
                ? effectiveApp.has_personal_mount
                  ? "Personal + community"
                  : "Community"
                : null;
              return (
                <div
                  key={effectiveApp.app_identity_key}
                  className="integration-mounted-row"
                >
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
                          <span
                            className={`integration-state-indicator is-${row.stateTone}`}
                          >
                            <span aria-hidden="true" />
                            {row.stateLabel}
                          </span>
                          <span className="integration-status-pill">
                            {row.toolCountLabel}
                          </span>
                          {communityScopeLabel ? (
                            <span className="community-app-status-badge">
                              {communityScopeLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {canManagePersonal && sourceMountId ? (
                      <div className="integration-mounted-rail">
                        {canSetupPersonal ? (
                          <button
                            type="button"
                            className="settings-cta integration-mounted-setup-action"
                            disabled={isBusy || isConnectingUserPlatformApp}
                            onClick={() => {
                              setOpenMountMenuId(null);
                              setReconnectDraftMountId(null);
                              setReconnectSecret("");
                              setReconnectError(null);
                              personalAppSetup.open({
                                source:
                                  canSetupImportedCommunity &&
                                  importedCommunityMount
                                    ? importedCommunityMount
                                    : effectiveApp,
                                effectiveSource: effectiveApp,
                                catalogEntry,
                              });
                            }}
                          >
                            Set up
                          </button>
                        ) : null}
                        <label
                          className={`members-switch integration-mounted-switch${
                            isBusy ? " is-disabled" : ""
                          }`}
                          title={
                            actionMount?.enabled ? "Disable app" : "Enable app"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(actionMount?.enabled)}
                            disabled={isBusy}
                            aria-label={`${
                              actionMount?.enabled ? "Disable" : "Enable"
                            } ${effectiveApp.app.name}`}
                            onChange={() =>
                              void onUpdateUserPlatformAppMount(sourceMountId, {
                                enabled: !actionMount?.enabled,
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
                            aria-label={`${effectiveApp.app.name} options`}
                            disabled={isBusy}
                            onClick={() =>
                              setOpenMountMenuId((current) =>
                                current === effectiveApp.app_identity_key
                                  ? null
                                  : effectiveApp.app_identity_key,
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
                              aria-label={`${effectiveApp.app.name} actions`}
                            >
                              <button
                                type="button"
                                className="integration-mounted-menu-item"
                                disabled={isBusy}
                                onClick={() => {
                                  setOpenMountMenuId(null);
                                  void onRefreshUserPlatformApp(sourceMountId);
                                }}
                              >
                                {refreshingUserPlatformAppMountId === sourceMountId
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
                                    setReconnectDraftMountId(
                                      effectiveApp.app_identity_key,
                                    );
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
                                  void onUnmountUserPlatformApp(sourceMountId);
                                }}
                              >
                                {removingUserPlatformAppMountId === sourceMountId
                                  ? "Removing…"
                                  : "Remove"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="integration-mounted-rail">
                        {canSetupPersonal ? (
                          <button
                            type="button"
                            className="settings-cta integration-mounted-setup-action"
                            disabled={isConnectingUserPlatformApp}
                            onClick={() => {
                              setOpenMountMenuId(null);
                              setReconnectDraftMountId(null);
                              setReconnectSecret("");
                              setReconnectError(null);
                              personalAppSetup.open({
                                source: effectiveApp,
                                catalogEntry,
                              });
                            }}
                          >
                            Set up
                          </button>
                        ) : null}
                      </div>
                    )}
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
                          placeholder={`Paste your ${effectiveApp.app.name} token`}
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
                                `Paste a fresh ${effectiveApp.app.name} token to reconnect this app.`,
                              );
                              return;
                            }
                            if (!sourceMountId) return;
                            const ok = await onReconnectUserPlatformApp(
                              sourceMountId,
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

      {personalAppSetup.modalProps ? (
        <PersonalAppSetupModal
          modalTitleId="integration-setup-modal-title"
          {...personalAppSetup.modalProps}
        />
      ) : null}

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <path d="M7 7h10v10H7z" />
            <path d="M4 12h3m10 0h3M12 4v3m0 10v3" />
          </svg>
          Harness skills
        </div>
        <div className="settings-section-desc">
          Personal skills and selected-community skills are available through the
          same harness context.
        </div>
        {!session ? (
          <div className="model-note">
            Sign in to create personal skills for your workspace.
          </div>
        ) : (
          <>
            <div className="agent-capability-toolbar">
              <button
                type="button"
                onClick={() => setIsCreateSkillOpen((prev) => !prev)}
                disabled={isCreatingUserPlatformSkill}
              >
                {isCreateSkillOpen ? "Close" : "Create custom skill"}
              </button>
            </div>

            {isCreateSkillOpen ? (
              <div className="agent-capability-card community-skill-create-card">
                <div className="agent-capability-card-header">
                  <div className="agent-canvas-target-kicker">
                    Create personal skill package
                  </div>
                </div>

                <label className="agent-capability-field">
                  <span className="agent-capability-field-label">Skill name</span>
                  <input
                    className="agent-editor-inline-label-input"
                    value={skillDraft.name}
                    onChange={(event) =>
                      setSkillDraft((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Weekly research"
                  />
                </label>

                <label className="agent-capability-field">
                  <span className="agent-capability-field-label">
                    Optional description
                  </span>
                  <textarea
                    className="agent-editor-inline-prompt-input community-skill-description-input"
                    rows={3}
                    value={skillDraft.description ?? ""}
                    onChange={(event) =>
                      setSkillDraft((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    placeholder="What this skill should help you do."
                  />
                </label>

                <label className="agent-capability-field">
                  <span className="agent-capability-field-label">
                    Skill instructions
                  </span>
                  <textarea
                    className="agent-editor-inline-prompt-input community-skill-instructions-input"
                    rows={10}
                    value={skillDraft.instructions_md}
                    onChange={(event) =>
                      setSkillDraft((prev) => ({
                        ...prev,
                        instructions_md: event.target.value,
                      }))
                    }
                    placeholder={`Write the reusable skill instructions here.\n\nUse this skill when...\nSteps:\n1. ...\n2. ...`}
                  />
                </label>

                <div className="agent-capability-toolbar">
                  <div className="model-note">
                    Personal skills are applied only when you explicitly mention
                    them, like <code>$weekly-research</code>.
                  </div>
                  <div className="agent-capability-toolbar-actions">
                    <button
                      type="button"
                      onClick={() => setIsCreateSkillOpen(false)}
                      disabled={isCreatingUserPlatformSkill}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="platform-save-button is-dirty"
                      onClick={() => void handleCreatePersonalSkill()}
                      disabled={isCreatingUserPlatformSkill}
                    >
                      {isCreatingUserPlatformSkill ? "Creating…" : "Create skill"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {userPlatformSkillError ? (
              <div className="auth-error">{userPlatformSkillError}</div>
            ) : null}
            {userPlatformSkillMutationError ? (
              <div className="auth-error">{userPlatformSkillMutationError}</div>
            ) : null}
            {effectiveSkillsError ? (
              <div className="auth-error">{effectiveSkillsError}</div>
            ) : null}

            {isLoadingEffectiveSkills || isLoadingUserPlatformSkills ? (
              <div className="model-note">Loading harness skills…</div>
            ) : effectiveSkills.length === 0 ? (
              <div className="model-note">
                No skills available yet. Browse Skills from Discover to add a
                personal skill, or create a custom one here.
              </div>
            ) : (
              <div className="agent-capability-list" role="list" aria-label="Harness skills">
                {effectiveSkills.map((effectiveSkill) => {
                  const install = effectiveSkill.personal_install;
                  const attachment = effectiveSkill.community_attachment;
                  const isPlatform = effectiveSkill.scope === "platform";
                  const isUpdating =
                    install ? updatingUserPlatformSkillInstallId === install.id : false;
                  const isRemoving =
                    install ? removingUserPlatformSkillInstallId === install.id : false;
                  const isEditing =
                    install ? editingUserPlatformSkillInstallId === install.id : false;
                  const scopeLabel = isPlatform
                    ? "Platform default"
                    : attachment
                    ? install
                      ? "Personal + community"
                      : "Selected community"
                    : "Personal baseline";
                  const statusLabel = isPlatform
                    ? "Built in"
                    : effectiveSkill.enabled_for_current_context
                    ? "Enabled"
                    : "Disabled";
                  return (
                    <div
                      key={effectiveSkill.skill_identity_key}
                      className="agent-capability-card"
                      role="listitem"
                    >
                      <div className="agent-capability-card-header">
                        <div>
                          <div className="agent-capability-card-title-row">
                            <div className="settings-section-subtitle">
                              {effectiveSkill.skill.name}
                            </div>
                            <span
                              className={`community-app-status-badge${
                                effectiveSkill.enabled_for_current_context ? "" : " is-muted"
                              }`}
                            >
                              {statusLabel}
                            </span>
                            {isPlatform ? (
                              <span className="community-app-status-badge">
                                Platform
                              </span>
                            ) : null}
                            {attachment ? (
                              <span className="community-app-status-badge">
                                Community
                              </span>
                            ) : null}
                          </div>
                          <div className="model-note">
                            ${effectiveSkill.skill.mentionToken}
                            {effectiveSkill.skill.description
                              ? ` · ${effectiveSkill.skill.description}`
                              : ""}
                          </div>
                        </div>
                        {install && effectiveSkill.can_edit ? (
                          <div className="agent-capability-toolbar-actions">
                            <button
                              type="button"
                              disabled={isUpdating || isRemoving}
                              onClick={() => {
                                if (isEditing) {
                                  setEditingUserPlatformSkillInstallId(null);
                                  setEditingSkillDraft(buildInitialSkillDraft());
                                  return;
                                }
                                setEditingUserPlatformSkillInstallId(install.id);
                                setEditingSkillDraft(buildSkillDraftFromInstall(install));
                              }}
                            >
                              {isEditing ? "Close" : "Edit"}
                            </button>
                            <label
                              className={`members-switch${
                                isUpdating || isRemoving ? " is-disabled" : ""
                              }`}
                              title={
                                install.enabled ? "Disable skill" : "Enable skill"
                              }
                            >
                              <input
                                type="checkbox"
                                checked={install.enabled}
                                disabled={isUpdating || isRemoving}
                                aria-label={`${
                                  install.enabled ? "Disable" : "Enable"
                                } ${install.skill.name}`}
                                onChange={() =>
                                  void onUpdateUserPlatformSkill(install.id, {
                                    enabled: !install.enabled,
                                  })
                                }
                              />
                              <span className="members-switch-track">
                                <span className="members-switch-thumb" />
                              </span>
                            </label>
                            <button
                              type="button"
                              className="danger"
                              disabled={isUpdating || isRemoving}
                              onClick={() => void onDeleteUserPlatformSkill(install.id)}
                            >
                              {isRemoving ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="agent-capability-metadata">
                        <div className="agent-capability-metadata-item">
                          <span className="agent-capability-metadata-label">
                            Scope
                          </span>
                          <span className="agent-capability-metadata-value">
                            {scopeLabel}
                          </span>
                        </div>
                        <div className="agent-capability-metadata-item">
                          <span className="agent-capability-metadata-label">
                            Invocation
                          </span>
                          <span className="agent-capability-metadata-value">
                            {isPlatform ? (
                              "Available by default"
                            ) : (
                              <>
                                Explicit <code>${effectiveSkill.skill.mentionToken}</code>
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="agent-capability-card community-skill-create-card">
                          <label className="agent-capability-field">
                            <span className="agent-capability-field-label">
                              Skill name
                            </span>
                            <input
                              className="agent-editor-inline-label-input"
                              value={editingSkillDraft.name}
                              onChange={(event) =>
                                setEditingSkillDraft((prev) => ({
                                  ...prev,
                                  name: event.target.value,
                                }))
                              }
                              placeholder="Weekly research"
                            />
                          </label>

                          <label className="agent-capability-field">
                            <span className="agent-capability-field-label">
                              Optional description
                            </span>
                            <textarea
                              className="agent-editor-inline-prompt-input community-skill-description-input"
                              rows={3}
                              value={editingSkillDraft.description ?? ""}
                              onChange={(event) =>
                                setEditingSkillDraft((prev) => ({
                                  ...prev,
                                  description: event.target.value,
                                }))
                              }
                              placeholder="What this skill should help you do."
                            />
                          </label>

                          <label className="agent-capability-field">
                            <span className="agent-capability-field-label">
                              Skill instructions
                            </span>
                            <textarea
                              className="agent-editor-inline-prompt-input community-skill-instructions-input"
                              rows={10}
                              value={editingSkillDraft.instructions_md}
                              onChange={(event) =>
                                setEditingSkillDraft((prev) => ({
                                  ...prev,
                                  instructions_md: event.target.value,
                                }))
                              }
                              placeholder={`Write the reusable skill instructions here.\n\nUse this skill when...\nSteps:\n1. ...\n2. ...`}
                            />
                          </label>

                          <div className="agent-capability-toolbar">
                            <div className="model-note">
                              Editing this skill updates the canonical package
                              and any community attachments that use it.
                            </div>
                            <div className="agent-capability-toolbar-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUserPlatformSkillInstallId(null);
                                  setEditingSkillDraft(buildInitialSkillDraft());
                                }}
                                disabled={isUpdating || isRemoving}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="platform-save-button is-dirty"
                                onClick={() => void handleSavePersonalSkill()}
                                disabled={isUpdating || isRemoving}
                              >
                                {isUpdating ? "Saving…" : "Save skill"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
