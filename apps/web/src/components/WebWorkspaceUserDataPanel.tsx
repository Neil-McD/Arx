import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import type { AccountSetupMissing, AccountSetupStatus } from "../../../../shared/accountSetup";
import type { WorkspaceCreditBalance } from "../../../../shared/workspaceCreditsGateway";
import {
  listWorkspaceDirectoryCanonical,
  readWorkspaceFilePreviewCanonical,
  type WorkspaceInspectorDirectoryEntry,
  type WorkspaceInspectorFilePreview,
} from "../../../../shared/workspaceInspectorGateway";

export type WorkspaceUserPanelCommunity = {
  id: string;
  slug: string | null;
  name: string;
  oneLiner: string | null;
  visibility: string | null;
  memberCount: number | null;
  canManage: boolean;
};

export type WorkspaceUserDataPanelDataProps = {
  accountSetupStatus: AccountSetupStatus | null;
  isLoadingAccountSetupStatus: boolean;
  workspaceCreditBalance: WorkspaceCreditBalance | null;
  isLoadingWorkspaceCreditBalance: boolean;
  workspaceCreditBalanceError: string | null;
  workspaceCreditTopupError: string | null;
  isStartingWorkspaceCreditTopupCheckout: boolean;
  session: AuthSessionLike | null;
  activeProjectId: string | null;
  activeProjectName: string | null;
  activeThreadTitle: string | null;
  activeModelLabel: string | null;
  activeCommunity: WorkspaceUserPanelCommunity | null;
  canCreateCommunity: boolean;
  onOpenAccountSetup: () => void;
  onTopUpWorkspaceCredits: () => void;
  onOpenCreateCommunity: () => void;
  onOpenActiveCommunity: () => void;
  onOpenActiveCommunitySettings: () => void;
};

const ACCOUNT_SETUP_MISSING_LABELS: Record<AccountSetupMissing, string> = {
  display_name: "Display name",
  handle: "Handle",
  avatar: "Avatar",
  inference_provider: "Inference provider",
  agent_name: "Agent name",
};

const WORKSPACE_FILES_EXPANDED_STORAGE_KEY_PREFIX = "polynet-workspace-files-expanded";

function formatCreditAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
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

function formatCommunityVisibility(value: string | null): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "published") return "Published";
  if (normalized === "unlisted") return "Unlisted";
  return "Unlisted";
}

function buildMissingSetupLabel(status: AccountSetupStatus | null): string {
  if (!status) return "Setup status unavailable";
  if (status.completed) return "Account setup complete";
  const labels = status.missing
    .map((field) => ACCOUNT_SETUP_MISSING_LABELS[field])
    .filter(Boolean)
    .slice(0, 3);
  if (labels.length === 0) return "Finish account setup";
  return `Missing ${labels.join(", ")}`;
}

export function WorkspacePanelContent(props: WorkspaceUserDataPanelDataProps) {
  const totalCredits =
    (props.workspaceCreditBalance?.includedCreditsBalance ?? 0) +
    (props.workspaceCreditBalance?.purchasedCreditsBalance ?? 0);
  const [filesExpanded, setFilesExpanded] = useState(() => loadFilesExpanded(props.activeProjectId));
  const [directoryPath, setDirectoryPath] = useState(".");
  const [directoryEntries, setDirectoryEntries] = useState<WorkspaceInspectorDirectoryEntry[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
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
    void listWorkspaceDirectoryCanonical({
      session: props.session,
      projectId: props.activeProjectId,
      path: directoryPath,
    })
      .then((result) => {
        if (!isAlive) return;
        if (!result.ok) {
          setDirectoryEntries([]);
          setDirectoryError(result.message);
          return;
        }
        setDirectoryEntries(result.entries);
      })
      .catch((error) => {
        if (!isAlive) return;
        setDirectoryEntries([]);
        setDirectoryError(error instanceof Error ? error.message : "Workspace files unavailable.");
      })
      .finally(() => {
        if (isAlive) setIsLoadingDirectory(false);
      });

    return () => {
      isAlive = false;
    };
  }, [directoryPath, filesExpanded, props.activeProjectId, props.session]);

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
            setFilePreviewError(result.message);
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

  return (
    <div className="workspace-user-data-panel__grid">
      <section className="workspace-user-data-card">
        <div className="workspace-user-data-card__meta">Account setup</div>
        <div className="workspace-user-data-card__headline">
          {props.isLoadingAccountSetupStatus
            ? "Checking..."
            : props.accountSetupStatus?.completed
              ? "Complete"
              : `${props.accountSetupStatus?.percent ?? 0}% complete`}
        </div>
        <div className="workspace-user-data-meter" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, props.accountSetupStatus?.percent ?? 0))}%` }} />
        </div>
        <p>{buildMissingSetupLabel(props.accountSetupStatus)}</p>
        {!props.accountSetupStatus?.completed ? (
          <button type="button" className="workspace-user-data-action" onClick={props.onOpenAccountSetup}>
            Continue setup
          </button>
        ) : null}
      </section>

      <section className="workspace-user-data-card">
        <div className="workspace-user-data-card__meta">Tool credits</div>
        <div className="workspace-user-data-card__headline">
          {props.isLoadingWorkspaceCreditBalance ? "Checking..." : formatCreditAmount(totalCredits)}
        </div>
        <p>
          Included {formatCreditAmount(props.workspaceCreditBalance?.includedCreditsBalance ?? 0)} / Purchased{" "}
          {formatCreditAmount(props.workspaceCreditBalance?.purchasedCreditsBalance ?? 0)}
        </p>
        {props.workspaceCreditBalanceError ? <p>{props.workspaceCreditBalanceError}</p> : null}
        {props.workspaceCreditTopupError ? <p>{props.workspaceCreditTopupError}</p> : null}
        <button
          type="button"
          className="workspace-user-data-action"
          onClick={props.onTopUpWorkspaceCredits}
          disabled={props.isStartingWorkspaceCreditTopupCheckout}
        >
          {props.isStartingWorkspaceCreditTopupCheckout ? "Opening checkout..." : "Top up credits"}
        </button>
      </section>

      <section className="workspace-user-data-card">
        <div className="workspace-user-data-card__meta">Current workspace</div>
        <div className="workspace-user-data-card__headline">
          {props.activeProjectName?.trim() || "Personal workspace"}
        </div>
        <dl className="workspace-user-data-list">
          <div>
            <dt>Thread</dt>
            <dd>{props.activeThreadTitle?.trim() || "New thread"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{props.activeModelLabel?.trim() || "Default"}</dd>
          </div>
        </dl>
      </section>

      <section className="workspace-user-data-card workspace-files-card">
        <button
          type="button"
          className="workspace-files-card__header"
          onClick={() => setFilesExpandedForProject(!filesExpanded)}
          aria-expanded={filesExpanded}
          disabled={!canInspectFiles}
        >
          <span>
            <span className="workspace-user-data-card__meta">Files</span>
            <strong>{filesExpanded ? directoryPath : "Collapsed"}</strong>
          </span>
          <span className="workspace-files-card__chevron" aria-hidden="true">
            {filesExpanded ? "-" : "+"}
          </span>
        </button>
        {!canInspectFiles ? (
          <p>Start or select a computer to inspect its files.</p>
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
            </div>
            {directoryError ? <p>{directoryError}</p> : null}
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
              ) : (
                <div className="workspace-files-empty">Select a file to preview it.</div>
              )}
            </div>
          </div>
        ) : (
          <p>Open the file inspector to understand this computer's project structure and preview safe assets.</p>
        )}
      </section>
    </div>
  );
}

export function CommunityPanelContent(props: WorkspaceUserDataPanelDataProps) {
  const community = props.activeCommunity;
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

  return (
    <div className="workspace-user-data-panel__grid">
      <section className="workspace-user-data-card workspace-user-data-card--community">
        <div className="workspace-user-data-card__meta">
          {community.canManage ? "Builder community" : "Member community"}
        </div>
        <div className="workspace-user-data-card__headline">{community.name}</div>
        <p>{community.oneLiner?.trim() || "Community workspace is ready."}</p>
        <dl className="workspace-user-data-list">
          <div>
            <dt>Visibility</dt>
            <dd>{formatCommunityVisibility(community.visibility)}</dd>
          </div>
          <div>
            <dt>Members</dt>
            <dd>{community.memberCount === null ? "Unknown" : String(community.memberCount)}</dd>
          </div>
        </dl>
        <div className="workspace-user-data-actions">
          <button type="button" className="workspace-user-data-action" onClick={props.onOpenActiveCommunity}>
            Open community
          </button>
          {community.canManage ? (
            <button
              type="button"
              className="workspace-user-data-action workspace-user-data-action--secondary"
              onClick={props.onOpenActiveCommunitySettings}
            >
              Settings
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
