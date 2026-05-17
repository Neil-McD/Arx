import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";
import {
  formatWorkspaceToolBalanceUsdFromCredits,
} from "../../../../shared/workspaceCredits";
import type { WorkspaceCreditBalance } from "../../../../shared/workspaceCreditsGateway";
import {
  listWorkspaceDirectoryCanonical,
  readWorkspaceFilePreviewCanonical,
  type WorkspaceInspectorDirectoryEntry,
  type WorkspaceInspectorFailure,
  type WorkspaceInspectorFilePreview,
} from "../../../../shared/workspaceInspectorGateway";
import type { DaytonaWorkspaceComputerStartResult } from "../../../../shared/daytonaWorkspaceTerminals";
import type { IntegrationSurfaceStateTone } from "../lib/integrationSurfaceRows";

export type WorkspaceUserPanelCommunity = {
  id: string;
  slug: string | null;
  name: string;
  oneLiner: string | null;
  visibility: string | null;
  memberCount: number | null;
  canManage: boolean;
  role: "member" | "moderator" | "admin" | "owner";
  muted: boolean;
  onlineFaces: WorkspaceUserPanelOnlineFace[];
  recentSignals: WorkspaceUserPanelRecentSignal[];
  integrations: WorkspaceUserPanelIntegration[];
};

export type WorkspaceUserPanelOnlineFace = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
};

export type WorkspaceUserPanelRecentSignal = {
  id: string;
  kind: "member" | "chat" | "ai_feed" | "resource" | "event";
  title: string;
  subtitle?: string | null;
  metaLabel?: string | null;
  iconLabel?: string | null;
  eventMonth?: string | null;
  eventDay?: string | null;
  avatar?: WorkspaceUserPanelOnlineFace | null;
  replyContext?: {
    sender: string;
    text: string;
  } | null;
  target: {
    tab: "chat" | "ai_feed" | "resources" | "events" | "members";
    itemId?: string | null;
  };
};

export type WorkspaceUserPanelIntegration = {
  id: string;
  name: string;
  logoUrl: string | null;
  logoUrlDark: string | null;
  stateLabel: string;
  stateTone: IntegrationSurfaceStateTone;
  toolCountLabel: string;
  enabled: boolean;
  canToggle: boolean;
  canSetup: boolean;
  isBusy: boolean;
};

export type WorkspaceUserDataPanelDataProps = {
  workspaceCreditBalance: WorkspaceCreditBalance | null;
  isLoadingWorkspaceCreditBalance: boolean;
  workspaceCreditBalanceError: string | null;
  workspaceCreditTopupError: string | null;
  isStartingWorkspaceCreditTopupCheckout: boolean;
  isStartingWorkspaceComputer: boolean;
  isStoppingWorkspaceComputer: boolean;
  workspaceComputerStartError: string | null;
  session: AuthSessionLike | null;
  activeProjectId: string | null;
  activeProjectName: string | null;
  activeThreadTitle: string | null;
  activeModelLabel: string | null;
  activeCommunity: WorkspaceUserPanelCommunity | null;
  canCreateCommunity: boolean;
  onOpenWorkspaceCreditTopup: () => void;
  onTurnOnComputer: () => Promise<DaytonaWorkspaceComputerStartResult>;
  onTurnOffComputer: () => Promise<boolean>;
  onOpenCreateCommunity: () => void;
  onOpenRecentSignal: (target: WorkspaceUserPanelRecentSignal["target"]) => void;
  onOpenActiveCommunitySettings: () => void;
  onOpenWorkspaceIntegrationSetup: () => void;
  onToggleCommunityIntegration: (
    communityAppMountId: string,
    enabled: boolean,
  ) => Promise<boolean> | boolean | Promise<void> | void;
  isLoadingCommunityMemberSettings: boolean;
  communityMemberSettingsError: string | null;
  onToggleCommunityMute: (muted: boolean) => Promise<void> | void;
};

const WORKSPACE_FILES_EXPANDED_STORAGE_KEY_PREFIX = "polynet-workspace-files-expanded";
const WORKSPACE_PANEL_COLLAPSED_SIGNAL_LIMIT = 10;

function ResourceSignalIcon() {
  return (
    <span className="workspace-community-signal-resource-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
        <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
      </svg>
    </span>
  );
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
}

function loadFilesExpanded(projectId: string | null): boolean {
  if (!projectId) return false;
  try {
    return localStorage.getItem(`${WORKSPACE_FILES_EXPANDED_STORAGE_KEY_PREFIX}:${projectId}`) === "1";
  } catch {
    return false;
  }
}

function storeFilesExpanded(projectId: string | null, isExpanded: boolean): void {
  if (!projectId) return;
  try {
    localStorage.setItem(`${WORKSPACE_FILES_EXPANDED_STORAGE_KEY_PREFIX}:${projectId}`, isExpanded ? "1" : "0");
  } catch {
    // Files expansion is a local workspace preference only.
  }
}

function parentDirectory(path: string): string {
  const normalized = String(path || ".").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized === "." || !normalized.includes("/")) return ".";
  return normalized.slice(0, normalized.lastIndexOf("/")) || ".";
}

function pathDepth(path: string): number {
  const normalized = String(path || ".").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized === ".") return 0;
  return normalized.split("/").filter(Boolean).length;
}

function formatCommunityRole(value: WorkspaceUserPanelCommunity["role"]): string {
  if (value === "owner") return "Owner";
  if (value === "admin") return "Admin";
  if (value === "moderator") return "Moderator";
  return "Member";
}

function formatWorkspaceInspectorFailure(result: WorkspaceInspectorFailure): string {
  if (result.code === "background_sandbox_not_found") return "Turn on computer to view files.";
  if (result.code === "workspace_credits_exhausted") return "Add tool credits to turn on computer.";
  return result.message;
}

function isWorkspaceCreditStartFailure(result: DaytonaWorkspaceComputerStartResult): boolean {
  return !result.ok && (
    result.code === "workspace_credits_exhausted" ||
    result.code === "workspace_credits_unavailable"
  );
}

export function WorkspacePanelContent(props: WorkspaceUserDataPanelDataProps) {
  const totalCredits =
    (props.workspaceCreditBalance?.includedCreditsBalance ?? 0) +
    (props.workspaceCreditBalance?.purchasedCreditsBalance ?? 0);
  const displayedToolBalance =
    props.isLoadingWorkspaceCreditBalance && !props.workspaceCreditBalance
      ? "Checking..."
      : formatWorkspaceToolBalanceUsdFromCredits(totalCredits);
  const [filesExpanded, setFilesExpanded] = useState(() => loadFilesExpanded(props.activeProjectId));
  const [directoryRefreshNonce, setDirectoryRefreshNonce] = useState(0);
  const [directoryPath, setDirectoryPath] = useState(".");
  const [directoryEntries, setDirectoryEntries] = useState<WorkspaceInspectorDirectoryEntry[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryErrorCode, setDirectoryErrorCode] = useState<string | null>(null);
  const [isComputerOnForFiles, setIsComputerOnForFiles] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<WorkspaceInspectorFilePreview | null>(null);
  const [isLoadingFilePreview, setIsLoadingFilePreview] = useState(false);
  const [filePreviewError, setFilePreviewError] = useState<string | null>(null);
  const filePreviewRequestId = useRef(0);
  const canInspectFiles = Boolean(props.session && props.activeProjectId);

  useEffect(() => {
    filePreviewRequestId.current += 1;
    setFilesExpanded(loadFilesExpanded(props.activeProjectId));
    setDirectoryPath(".");
    setDirectoryEntries([]);
    setDirectoryError(null);
    setDirectoryErrorCode(null);
    setIsComputerOnForFiles(false);
    setSelectedFilePath(null);
    setFilePreview(null);
    setFilePreviewError(null);
  }, [props.activeProjectId]);

  const setFilesExpandedForProject = useCallback(
    (next: boolean) => {
      setFilesExpanded(next);
      storeFilesExpanded(props.activeProjectId, next);
    },
    [props.activeProjectId],
  );

  useEffect(() => {
    let isAlive = true;
    if (!filesExpanded || !props.session || !props.activeProjectId) return;
    setIsLoadingDirectory(true);
    setDirectoryError(null);
    setDirectoryErrorCode(null);
    void listWorkspaceDirectoryCanonical({
      session: props.session,
      projectId: props.activeProjectId,
      path: directoryPath,
    })
      .then((result) => {
        if (!isAlive) return;
        if (!result.ok) {
          setDirectoryEntries([]);
          setDirectoryError(formatWorkspaceInspectorFailure(result));
          setDirectoryErrorCode(result.code);
          setIsComputerOnForFiles(false);
          return;
        }
        setDirectoryEntries(result.entries);
        setIsComputerOnForFiles(true);
      })
      .catch((error) => {
        if (!isAlive) return;
        setDirectoryEntries([]);
        setDirectoryError(error instanceof Error ? error.message : "Workspace files unavailable.");
        setDirectoryErrorCode(null);
        setIsComputerOnForFiles(false);
      })
      .finally(() => {
        if (isAlive) setIsLoadingDirectory(false);
      });

    return () => {
      isAlive = false;
    };
  }, [directoryPath, directoryRefreshNonce, filesExpanded, props.activeProjectId, props.session]);

  const handleSelectFile = useCallback(
    (path: string) => {
      if (!props.session || !props.activeProjectId) return;
      const requestId = filePreviewRequestId.current + 1;
      filePreviewRequestId.current = requestId;
      setSelectedFilePath(path);
      setFilePreview(null);
      setFilePreviewError(null);
      setIsLoadingFilePreview(true);
      void readWorkspaceFilePreviewCanonical({
        session: props.session,
        projectId: props.activeProjectId,
        path,
      })
        .then((result) => {
          if (filePreviewRequestId.current !== requestId) return;
          if (!result.ok) {
            setFilePreview(null);
            setFilePreviewError(formatWorkspaceInspectorFailure(result));
            return;
          }
          setFilePreview(result);
        })
        .catch((error) => {
          if (filePreviewRequestId.current !== requestId) return;
          setFilePreview(null);
          setFilePreviewError(error instanceof Error ? error.message : "Workspace file unavailable.");
        })
        .finally(() => {
          if (filePreviewRequestId.current === requestId) setIsLoadingFilePreview(false);
        });
    },
    [props.activeProjectId, props.session],
  );

  const visibleDirectoryEntries = useMemo(
    () =>
      [...directoryEntries].sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [directoryEntries],
  );
  const hasFilePreviewContent = Boolean(isLoadingFilePreview || filePreviewError || filePreview?.ok);
  const canTurnOnComputer = Boolean(props.session && props.activeProjectId);
  const shouldShowTurnOnComputerAction =
    canTurnOnComputer &&
    (
      directoryErrorCode === "background_sandbox_not_found" ||
      directoryErrorCode === "workspace_credits_exhausted" ||
      directoryErrorCode === "workspace_credits_unavailable"
    );

  const handleTurnOnComputer = useCallback(async () => {
    if (!canTurnOnComputer) return;
    setDirectoryError(null);
    setDirectoryErrorCode(null);
    const result = await props.onTurnOnComputer();
    if (!result.ok) {
      setDirectoryEntries([]);
      setDirectoryError(
        isWorkspaceCreditStartFailure(result)
          ? "Add tool credits to turn on computer."
          : result.message,
      );
      setDirectoryErrorCode(result.code);
      return;
    }
    setFilesExpandedForProject(true);
    setDirectoryPath(".");
    setDirectoryEntries([]);
    setDirectoryError(null);
    setDirectoryErrorCode(null);
    setIsComputerOnForFiles(true);
    setDirectoryRefreshNonce((value) => value + 1);
  }, [canTurnOnComputer, props.onTurnOnComputer, setFilesExpandedForProject]);

  const handleTurnOffComputer = useCallback(async () => {
    if (!canTurnOnComputer) return;
    const stopped = await props.onTurnOffComputer();
    if (!stopped) return;
    filePreviewRequestId.current += 1;
    setDirectoryEntries([]);
    setDirectoryError("Turn on computer to view files.");
    setDirectoryErrorCode("background_sandbox_not_found");
    setIsComputerOnForFiles(false);
    setSelectedFilePath(null);
    setFilePreview(null);
    setFilePreviewError(null);
    setIsLoadingFilePreview(false);
  }, [canTurnOnComputer, props.onTurnOffComputer]);

  return (
    <div className="workspace-user-data-panel__grid">
      <section className="workspace-summary-block">
        <dl className="workspace-summary-list">
          <div>
            <dt>Computer</dt>
            <dd>{props.activeProjectName?.trim() || "Personal workspace"}</dd>
          </div>
          <div>
            <dt>Thread</dt>
            <dd>{props.activeThreadTitle?.trim() || "New thread"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{props.activeModelLabel?.trim() || "Default"}</dd>
          </div>
          <div>
            <dt>Tool credits</dt>
            <dd className="workspace-summary-credit-value">
              <span>{displayedToolBalance}</span>
              <button
                type="button"
                className="workspace-summary-credit-action"
                onClick={props.onOpenWorkspaceCreditTopup}
                disabled={props.isStartingWorkspaceCreditTopupCheckout}
              >
                {props.isStartingWorkspaceCreditTopupCheckout ? "Opening" : "Top up"}
              </button>
            </dd>
          </div>
        </dl>
        {props.workspaceCreditBalanceError ? (
          <p className="workspace-summary-note">{props.workspaceCreditBalanceError}</p>
        ) : null}
        {props.workspaceCreditTopupError ? (
          <p className="workspace-summary-note">{props.workspaceCreditTopupError}</p>
        ) : null}
        {props.workspaceComputerStartError ? (
          <p className="workspace-summary-note">{props.workspaceComputerStartError}</p>
        ) : null}
      </section>

      <section className="workspace-files-section">
        <button
          type="button"
          className="workspace-files-row"
          onClick={() => setFilesExpandedForProject(!filesExpanded)}
          aria-expanded={filesExpanded}
          disabled={!canInspectFiles}
        >
          <span>Files</span>
          <span className={`workspace-files-chevron${filesExpanded ? " is-open" : ""}`} aria-hidden="true" />
        </button>
        {!canInspectFiles ? (
          <p className="workspace-files-note">Turn on computer to view files.</p>
        ) : filesExpanded && directoryError ? (
          <div className="workspace-files-empty-state">
            <p>{directoryError}</p>
            {shouldShowTurnOnComputerAction ? (
              <button
                type="button"
                className="workspace-user-data-action workspace-user-data-action--secondary"
                onClick={() => void handleTurnOnComputer()}
                disabled={props.isStartingWorkspaceComputer}
              >
                {props.isStartingWorkspaceComputer ? "Turning on..." : "Turn on computer"}
              </button>
            ) : null}
          </div>
        ) : filesExpanded ? (
          <div className="workspace-files-browser">
            <div className="workspace-files-browser__toolbar">
              <button
                type="button"
                className="workspace-user-data-action workspace-user-data-action--secondary"
                onClick={() => {
                  filePreviewRequestId.current += 1;
                  setDirectoryPath(parentDirectory(directoryPath));
                  setSelectedFilePath(null);
                  setFilePreview(null);
                  setFilePreviewError(null);
                  setIsLoadingFilePreview(false);
                }}
                disabled={pathDepth(directoryPath) === 0 || isLoadingDirectory}
              >
                Up
              </button>
              <span>{directoryPath === "." ? "workspace" : directoryPath}</span>
              {isComputerOnForFiles ? (
                <button
                  type="button"
                  className="workspace-user-data-action workspace-user-data-action--secondary workspace-files-power-action"
                  onClick={() => void handleTurnOffComputer()}
                  disabled={props.isStoppingWorkspaceComputer}
                >
                  {props.isStoppingWorkspaceComputer ? "Turning off" : "Turn off"}
                </button>
              ) : null}
            </div>
            <div className="workspace-files-list" aria-label="Workspace files">
              {isLoadingDirectory ? (
                <div className="workspace-files-empty">Loading files...</div>
              ) : visibleDirectoryEntries.length ? (
                visibleDirectoryEntries.map((entry) => (
                  <button
                    key={`${entry.type}:${entry.path}`}
                    type="button"
                    className={`workspace-files-entry${entry.path === selectedFilePath ? " is-selected" : ""}`}
                    onClick={() => {
                      if (entry.type === "directory") {
                        filePreviewRequestId.current += 1;
                        setDirectoryPath(entry.path);
                        setSelectedFilePath(null);
                        setFilePreview(null);
                        setFilePreviewError(null);
                        setIsLoadingFilePreview(false);
                      } else {
                        handleSelectFile(entry.path);
                      }
                    }}
                  >
                    <span className="workspace-files-entry__icon" aria-hidden="true">
                      {entry.type === "directory" ? ">" : "*"}
                    </span>
                    <span>
                      <strong>{entry.name}</strong>
                      <em>
                        {entry.type === "directory"
                          ? entry.heavy
                            ? "large folder"
                            : "folder"
                          : entry.extension || "file"}
                      </em>
                    </span>
                  </button>
                ))
              ) : (
                <div className="workspace-files-empty">No files returned.</div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {hasFilePreviewContent ? (
        <div className="workspace-file-preview">
          {isLoadingFilePreview ? (
            <div className="workspace-files-empty">Loading preview...</div>
          ) : filePreviewError ? (
            <div className="workspace-files-empty">{filePreviewError}</div>
          ) : filePreview?.ok && filePreview.previewKind === "image" ? (
            <figure>
              <img src={filePreview.dataUrl} alt={filePreview.name} />
              <figcaption>
                {filePreview.name} {formatBytes(filePreview.sizeBytes)}
              </figcaption>
            </figure>
          ) : filePreview?.ok && filePreview.previewKind === "text" ? (
            <div>
              <div className="workspace-file-preview__meta">
                {filePreview.name} {formatBytes(filePreview.sizeBytes)}
                {filePreview.truncated ? " - truncated" : ""}
              </div>
              <pre>{filePreview.text || "(empty file)"}</pre>
            </div>
          ) : filePreview?.ok && filePreview.previewKind === "unsupported" ? (
            <div className="workspace-files-empty">
              {filePreview.name}: {filePreview.reason}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CommunityPanelContent(props: WorkspaceUserDataPanelDataProps) {
  const community = props.activeCommunity;
  const [isRecentSignalsExpanded, setIsRecentSignalsExpanded] = useState(false);

  useEffect(() => {
    setIsRecentSignalsExpanded(false);
  }, [community?.id]);

  if (!community) {
    return (
      <div className="workspace-user-data-panel__grid">
        <section className="workspace-user-data-card">
          <div className="workspace-user-data-card__meta">Community</div>
          <div className="workspace-user-data-card__headline">No community selected</div>
          <p>Build a community when your account and workspace are ready.</p>
          <button
            type="button"
            className="workspace-user-data-action"
            onClick={props.onOpenCreateCommunity}
            disabled={!props.canCreateCommunity}
          >
            {props.canCreateCommunity ? "Build community" : "Community limit reached"}
          </button>
        </section>
      </div>
    );
  }

  const visibleRecentSignals = isRecentSignalsExpanded
    ? community.recentSignals
    : community.recentSignals.slice(0, WORKSPACE_PANEL_COLLAPSED_SIGNAL_LIMIT);
  const canExpandRecentSignals = community.recentSignals.length > WORKSPACE_PANEL_COLLAPSED_SIGNAL_LIMIT;

  return (
    <div className="workspace-user-data-panel__grid">
      <section className="workspace-community-section">
        <div className="workspace-community-section__title">Status</div>
        <div className="workspace-community-status-row">
          <span>{formatCommunityRole(community.role)}</span>
          <label className="workspace-community-mute-toggle">
            <input
              type="checkbox"
              checked={community.muted}
              disabled={props.isLoadingCommunityMemberSettings}
              onChange={(event) => void props.onToggleCommunityMute(event.target.checked)}
            />
            <span>{community.muted ? "Unmute" : "Mute"}</span>
          </label>
        </div>
      </section>
      {props.communityMemberSettingsError ? (
        <div className="workspace-community-note">{props.communityMemberSettingsError}</div>
      ) : null}
      {community.onlineFaces.length > 0 ? (
        <section className="workspace-community-section">
          <div className="workspace-community-online-strip" aria-label="People online now">
            {community.onlineFaces.map((face) => (
              <UserAvatar
                key={face.userId}
                className="workspace-community-online-face public-funnel-face"
                readyClassName="has-image"
                name={face.displayName ?? face.userId}
                imageUrl={face.avatarUrl}
                focusX={face.avatarFocusX ?? 0.5}
                focusY={face.avatarFocusY ?? 0.5}
                zoom={face.avatarZoom ?? 1}
                alt=""
                aria-hidden={true}
                fallback={null}
              />
            ))}
          </div>
        </section>
      ) : null}
      {community.recentSignals.length > 0 ? (
        <section className="workspace-community-section">
          <div className="workspace-community-section__title">Recent signal</div>
          <div className="workspace-community-signal-list">
            {visibleRecentSignals.map((signal) => (
              <button
                key={signal.id}
                type="button"
                className={`workspace-community-signal-row is-${signal.kind}${signal.replyContext ? " has-reply" : ""}`}
                onClick={() => props.onOpenRecentSignal(signal.target)}
              >
                {signal.eventMonth && signal.eventDay ? (
                  <span className="workspace-community-signal-date" aria-hidden="true">
                    <span>{signal.eventMonth}</span>
                    <strong>{signal.eventDay}</strong>
                  </span>
                ) : signal.kind === "resource" ? (
                  <ResourceSignalIcon />
                ) : signal.avatar ? (
                  <UserAvatar
                    className="workspace-community-signal-avatar public-funnel-face"
                    readyClassName="has-image"
                    name={signal.avatar.displayName ?? signal.avatar.userId}
                    imageUrl={signal.avatar.avatarUrl}
                    focusX={signal.avatar.avatarFocusX ?? 0.5}
                    focusY={signal.avatar.avatarFocusY ?? 0.5}
                    zoom={signal.avatar.avatarZoom ?? 1}
                    alt=""
                    aria-hidden={true}
                    fallback={null}
                  />
                ) : (
                  <span className="workspace-community-signal-icon" aria-hidden="true">
                    {signal.iconLabel ?? signal.kind.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="workspace-community-signal-copy">
                  {signal.metaLabel ? (
                    <div className="workspace-community-signal-meta">{signal.metaLabel}</div>
                  ) : null}
                  <div className="workspace-community-signal-title">{signal.title}</div>
                  {signal.replyContext ? (
                    <div className="workspace-community-signal-reply chat-reply-quote" aria-label={`Reply to ${signal.replyContext.sender}`}>
                      <svg className="chat-reply-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 14 4 9 9 4" />
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                      </svg>
                      <span className="chat-reply-sender">{signal.replyContext.sender}</span>
                      <span className="chat-reply-text">{signal.replyContext.text}</span>
                    </div>
                  ) : null}
                  {signal.subtitle ? (
                    <div className="workspace-community-signal-subtitle">{signal.subtitle}</div>
                  ) : null}
                </div>
              </button>
            ))}
            {canExpandRecentSignals ? (
              <button
                type="button"
                className="workspace-community-signal-view-more"
                onClick={() => setIsRecentSignalsExpanded((value) => !value)}
              >
                {isRecentSignalsExpanded ? "Show less" : "View more"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      {community.integrations.length > 0 ? (
        <section className="workspace-community-section">
          <div className="workspace-community-section__title">Integrations</div>
          <div className="workspace-community-integration-list">
            {community.integrations.map((integration) => (
              <div key={integration.id} className="workspace-community-integration-row">
                <div className="workspace-community-integration-identity">
                  <DiscoverCatalogLogo
                    name={integration.name}
                    logoUrl={integration.logoUrl}
                    logoUrlDark={integration.logoUrlDark}
                  />
                  <div className="workspace-community-integration-copy">
                    <div className="workspace-community-integration-title-row">
                      <strong>{integration.name}</strong>
                      <span
                        className={`integration-state-indicator is-${integration.stateTone}`}
                      >
                        <span aria-hidden="true" />
                        {integration.stateLabel}
                      </span>
                    </div>
                    <div className="workspace-community-integration-meta">
                      {integration.toolCountLabel}
                    </div>
                  </div>
                </div>
                {integration.canSetup || integration.canToggle ? (
                  <div className="workspace-community-integration-actions">
                    {integration.canSetup ? (
                      <button
                        type="button"
                        className="workspace-community-integration-setup"
                        onClick={props.onOpenWorkspaceIntegrationSetup}
                      >
                        Set up
                      </button>
                    ) : null}
                    {integration.canToggle ? (
                      <label
                        className={`members-switch integration-mounted-switch${
                          integration.isBusy ? " is-disabled" : ""
                        }`}
                        title={integration.enabled ? "Disable app" : "Enable app"}
                      >
                        <input
                          type="checkbox"
                          checked={integration.enabled}
                          disabled={integration.isBusy}
                          aria-label={`${integration.enabled ? "Disable" : "Enable"} ${
                            integration.name
                          }`}
                          onChange={(event) =>
                            void props.onToggleCommunityIntegration(
                              integration.id,
                              event.target.checked,
                            )
                          }
                        />
                        <span className="members-switch-track">
                          <span className="members-switch-thumb" />
                        </span>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
