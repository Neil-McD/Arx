import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  File,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Users,
} from "lucide-react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import type { AuthSessionLike } from "../../../../shared/authSession";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { WorkspaceCreditBalance } from "../../../../shared/workspaceCreditsGateway";
import {
  formatWorkspaceInspectorFailureMessage,
  isWorkspaceInspectorWakeRetryableCode,
  listWorkspaceDirectoryCanonical,
  readWorkspaceFilePreviewCanonical,
  type WorkspaceInspectorDirectoryEntry,
  type WorkspaceInspectorFailure,
  type WorkspaceInspectorFilePreview,
} from "../../../../shared/workspaceInspectorGateway";
import type { WorkspaceComputerStartResult } from "../../../../shared/workspaceTerminalsGateway";

export type WorkspaceUserDataPanelDataProps = {
  workspaceCreditBalance: WorkspaceCreditBalance | null;
  isLoadingWorkspaceCreditBalance: boolean;
  workspaceCreditBalanceError: string | null;
  hasWorkspaceCardOnFile?: boolean | null;
  isStartingWorkspaceComputer: boolean;
  isStoppingWorkspaceComputer: boolean;
  workspaceComputerStartError: string | null;
  session: AuthSessionLike | null;
  activeProjectId: string | null;
  activeProjectName: string | null;
  activeThreadTitle: string | null;
  activeModelLabel: string | null;
  onOpenWorkspaceBilling: () => void;
  onTurnOnComputer: () => Promise<WorkspaceComputerStartResult>;
  onTurnOffComputer: () => Promise<boolean>;
};

export type WorkspaceCommunityPreviewPanelDataProps = {
  activeCommunity: {
    id: string;
    slug?: string | null;
    name: string;
    one_liner?: string | null;
    avatar_url?: string | null;
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  };
  roleLabel: string | null;
  memberCount: number | null;
  onlineCount: number | null;
  recentChatPreview: ReactNode;
  onOpenCommunity: () => void;
};

const WORKSPACE_FILES_EXPANDED_STORAGE_KEY_PREFIX = "polynet-workspace-files-expanded";
const WORKSPACE_INSPECTOR_WAKE_RETRY_WINDOW_MS = 60_000;
const WORKSPACE_INSPECTOR_WAKE_RETRY_DEFAULT_DELAY_MS = 1500;
const WORKSPACE_IMAGE_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "png", "svg", "webp"]);
const WORKSPACE_CODE_EXTENSION_LANGUAGE: Record<string, string> = {
  bash: "bash",
  css: "css",
  html: "xml",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  sh: "bash",
  svg: "xml",
  ts: "typescript",
  tsx: "typescript",
  txt: "text",
  xml: "xml",
};
const WORKSPACE_DIFF_EXTENSIONS = new Set(["diff", "patch"]);

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

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

export function resetWorkspaceFilesExpandedPreference(projectId: string | null): void {
  storeFilesExpanded(projectId, false);
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

function workspacePathSegments(path: string): string[] {
  const normalized = String(path || ".").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized === ".") return [];
  return normalized.split("/").filter(Boolean);
}

function formatWorkspaceBreadcrumb(path: string): string {
  const segments = workspacePathSegments(path);
  return segments.length ? `workspace / ${segments.join(" / ")}` : "workspace";
}

function workspacePathExtension(path: string): string {
  const name = String(path || "").split("/").pop() ?? "";
  const index = name.lastIndexOf(".");
  if (index <= 0 || index === name.length - 1) return "";
  return name.slice(index + 1).toLowerCase();
}

function isWorkspaceDiffPath(path: string): boolean {
  return WORKSPACE_DIFF_EXTENSIONS.has(workspacePathExtension(path));
}

function workspacePreviewLanguage(path: string): string | null {
  const language = WORKSPACE_CODE_EXTENSION_LANGUAGE[workspacePathExtension(path)];
  return language && language !== "text" ? language : null;
}

function workspaceFileVisualKind(entry: WorkspaceInspectorDirectoryEntry): "folder" | "image" | "code" | "diff" | "text" | "file" {
  if (entry.type === "directory") return "folder";
  const extension = entry.extension?.toLowerCase() || workspacePathExtension(entry.path);
  if (WORKSPACE_DIFF_EXTENSIONS.has(extension)) return "diff";
  if (WORKSPACE_IMAGE_EXTENSIONS.has(extension)) return "image";
  if (WORKSPACE_CODE_EXTENSION_LANGUAGE[extension]) return extension === "txt" ? "text" : "code";
  return "file";
}

function formatWorkspaceEntryKind(entry: WorkspaceInspectorDirectoryEntry): string {
  if (entry.type === "directory") return entry.heavy ? "large folder" : "folder";
  const extension = entry.extension?.toLowerCase() || workspacePathExtension(entry.path);
  if (WORKSPACE_DIFF_EXTENSIONS.has(extension)) return "diff";
  if (WORKSPACE_IMAGE_EXTENSIONS.has(extension)) return "image";
  return extension || "file";
}

function WorkspaceFileIcon(props: { entry: WorkspaceInspectorDirectoryEntry }) {
  const kind = workspaceFileVisualKind(props.entry);
  const Icon =
    kind === "folder"
      ? Folder
      : kind === "image"
        ? FileImage
        : kind === "code" || kind === "diff"
          ? FileCode2
          : kind === "text"
            ? FileText
            : File;

  return (
    <span className={`workspace-files-entry__icon workspace-files-entry__icon--${kind}`} aria-hidden="true">
      <Icon size={15} strokeWidth={1.8} />
    </span>
  );
}

function classifyWorkspaceDiffLine(line: string): "add" | "delete" | "hunk" | "header" | "context" {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git") || line.startsWith("index ")) {
    return "header";
  }
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "delete";
  return "context";
}

function highlightWorkspaceLine(line: string, language: string | null): string | null {
  if (!language || !line) return null;
  try {
    return hljs.highlight(line, { language, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}

function WorkspacePreviewHeader(props: {
  name: string;
  meta: string;
}) {
  return (
    <div className="workspace-file-preview__header">
      <div className="workspace-file-preview__title">{props.name}</div>
      <div className="workspace-file-preview__meta">{props.meta}</div>
    </div>
  );
}

function WorkspaceTextPreview(props: {
  preview: Extract<WorkspaceInspectorFilePreview, { ok: true; previewKind: "text" }>;
}) {
  const isDiff = isWorkspaceDiffPath(props.preview.path || props.preview.name);
  const language = isDiff ? null : workspacePreviewLanguage(props.preview.path || props.preview.name);
  const lines = props.preview.text ? props.preview.text.split("\n") : [""];
  const meta = [
    workspacePathExtension(props.preview.name || props.preview.path) || "text",
    formatBytes(props.preview.sizeBytes),
    props.preview.truncated ? "truncated" : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="workspace-file-preview__text">
      <WorkspacePreviewHeader name={props.preview.name} meta={meta} />
      <div
        className={`workspace-code-preview${isDiff ? " workspace-code-preview--diff" : ""}`}
        aria-label={`${props.preview.name} preview`}
      >
        {lines.map((line, index) => {
          const diffKind = isDiff ? classifyWorkspaceDiffLine(line) : "context";
          const html = highlightWorkspaceLine(line, language);
          return (
            <div
              key={`${index}:${line}`}
              className={`workspace-code-preview__line workspace-code-preview__line--${diffKind}`}
            >
              <span className="workspace-code-preview__line-number">{index + 1}</span>
              <code className="workspace-code-preview__line-text">
                {html ? (
                  <span dangerouslySetInnerHTML={{ __html: html }} />
                ) : (
                  line || "\u00A0"
                )}
              </code>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function workspaceInspectorRetryDelayMs(result: WorkspaceInspectorFailure): number {
  return result.retryAfterMs ?? WORKSPACE_INSPECTOR_WAKE_RETRY_DEFAULT_DELAY_MS;
}

export function WorkspacePanelContent(props: WorkspaceUserDataPanelDataProps & {
  filesResetNonce?: number;
}) {
  const workspaceBillingActionLabel = "Billing";
  const [filesExpanded, setFilesExpanded] = useState(() => loadFilesExpanded(props.activeProjectId));
  const [directoryRefreshNonce, setDirectoryRefreshNonce] = useState(0);
  const [directoryPath, setDirectoryPath] = useState(".");
  const [directoryEntries, setDirectoryEntries] = useState<WorkspaceInspectorDirectoryEntry[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryErrorCode, setDirectoryErrorCode] = useState<string | null>(null);
  const [directoryCheckedAt, setDirectoryCheckedAt] = useState<number | null>(null);
  const [directoryIsCached, setDirectoryIsCached] = useState(false);
  const [directoryIsStale, setDirectoryIsStale] = useState(false);
  const [isComputerOnForFiles, setIsComputerOnForFiles] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<WorkspaceInspectorFilePreview | null>(null);
  const [isLoadingFilePreview, setIsLoadingFilePreview] = useState(false);
  const [filePreviewError, setFilePreviewError] = useState<string | null>(null);
  const filePreviewRequestId = useRef(0);
  const lastFilesResetNonceRef = useRef(props.filesResetNonce ?? 0);
  const directoryWakeRetryStartedAtRef = useRef<number | null>(null);
  const directoryAutoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceDirectoryRefreshRef = useRef(false);
  const [isDirectoryWakeRetrying, setIsDirectoryWakeRetrying] = useState(false);
  const canInspectFiles = Boolean(props.session && props.activeProjectId);
  const sessionIdentityKey =
    props.session?.user?.id ??
    props.session?.user?.email ??
    (props.session ? "session" : "anonymous");

  const clearDirectoryAutoRetryTimer = useCallback(() => {
    if (!directoryAutoRetryTimerRef.current) return;
    clearTimeout(directoryAutoRetryTimerRef.current);
    directoryAutoRetryTimerRef.current = null;
  }, []);

  useEffect(() => {
    clearDirectoryAutoRetryTimer();
    directoryWakeRetryStartedAtRef.current = null;
    setIsDirectoryWakeRetrying(false);
    filePreviewRequestId.current += 1;
    setFilesExpanded(loadFilesExpanded(props.activeProjectId));
    setDirectoryPath(".");
    setDirectoryEntries([]);
    setDirectoryError(null);
    setDirectoryErrorCode(null);
    setDirectoryCheckedAt(null);
    setDirectoryIsCached(false);
    setDirectoryIsStale(false);
    setIsComputerOnForFiles(false);
    setSelectedFilePath(null);
    setFilePreview(null);
    setFilePreviewError(null);
  }, [clearDirectoryAutoRetryTimer, props.activeProjectId]);

  useEffect(() => clearDirectoryAutoRetryTimer, [clearDirectoryAutoRetryTimer]);

  const setFilesExpandedForProject = useCallback(
    (next: boolean) => {
      if (!next) {
        clearDirectoryAutoRetryTimer();
        directoryWakeRetryStartedAtRef.current = null;
        setIsDirectoryWakeRetrying(false);
      }
      setFilesExpanded(next);
      storeFilesExpanded(props.activeProjectId, next);
    },
    [clearDirectoryAutoRetryTimer, props.activeProjectId],
  );

  useEffect(() => {
    const nonce = props.filesResetNonce ?? 0;
    if (lastFilesResetNonceRef.current === nonce) return;
    lastFilesResetNonceRef.current = nonce;
    clearDirectoryAutoRetryTimer();
    directoryWakeRetryStartedAtRef.current = null;
    setIsDirectoryWakeRetrying(false);
    filePreviewRequestId.current += 1;
    setFilesExpanded(false);
    storeFilesExpanded(props.activeProjectId, false);
    setDirectoryPath(".");
    setDirectoryEntries([]);
    setDirectoryError(null);
    setDirectoryErrorCode(null);
    setDirectoryCheckedAt(null);
    setDirectoryIsCached(false);
    setDirectoryIsStale(false);
    setSelectedFilePath(null);
    setFilePreview(null);
    setFilePreviewError(null);
    setIsLoadingFilePreview(false);
  }, [clearDirectoryAutoRetryTimer, props.activeProjectId, props.filesResetNonce]);

  useEffect(() => {
    let isAlive = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    if (!filesExpanded || !props.session || !props.activeProjectId) return;
    const forceRefresh = forceDirectoryRefreshRef.current;
    forceDirectoryRefreshRef.current = false;
    setIsLoadingDirectory(true);
    setDirectoryError(null);
    setDirectoryErrorCode(null);
    void listWorkspaceDirectoryCanonical({
      session: props.session,
      projectId: props.activeProjectId,
      path: directoryPath,
      refresh: forceRefresh,
    })
      .then((result) => {
        if (!isAlive) return;
        if (result.ok === false) {
          setDirectoryEntries([]);
          setDirectoryError(formatWorkspaceInspectorFailureMessage(result));
          setDirectoryErrorCode(result.code);
          setDirectoryCheckedAt(null);
          setDirectoryIsCached(false);
          setDirectoryIsStale(false);
          setIsComputerOnForFiles(false);
          if (isWorkspaceInspectorWakeRetryableCode(result.code)) {
            const now = Date.now();
            const startedAt = directoryWakeRetryStartedAtRef.current ?? now;
            directoryWakeRetryStartedAtRef.current = startedAt;
            const elapsedMs = Math.max(0, now - startedAt);
            if (elapsedMs < WORKSPACE_INSPECTOR_WAKE_RETRY_WINDOW_MS) {
              setIsDirectoryWakeRetrying(true);
              const remainingMs = Math.max(
                250,
                WORKSPACE_INSPECTOR_WAKE_RETRY_WINDOW_MS - elapsedMs,
              );
              const retryDelayMs = Math.min(
                workspaceInspectorRetryDelayMs(result),
                remainingMs,
              );
              retryTimer = setTimeout(() => {
                if (isAlive) setDirectoryRefreshNonce((value) => value + 1);
              }, retryDelayMs);
              directoryAutoRetryTimerRef.current = retryTimer;
              return;
            }
          }
          setIsDirectoryWakeRetrying(false);
          directoryWakeRetryStartedAtRef.current = null;
          return;
        }
        clearDirectoryAutoRetryTimer();
        directoryWakeRetryStartedAtRef.current = null;
        setIsDirectoryWakeRetrying(false);
        setDirectoryEntries(result.entries);
        setDirectoryCheckedAt(result.checkedAt ?? Date.now());
        setDirectoryIsCached(result.cached === true);
        setDirectoryIsStale(result.stale === true);
        setIsComputerOnForFiles(true);
      })
      .catch((error) => {
        if (!isAlive) return;
        setDirectoryEntries([]);
        setDirectoryError(error instanceof Error ? error.message : "Workspace files unavailable.");
        setDirectoryErrorCode(null);
        setDirectoryCheckedAt(null);
        setDirectoryIsCached(false);
        setDirectoryIsStale(false);
        directoryWakeRetryStartedAtRef.current = null;
        setIsDirectoryWakeRetrying(false);
        setIsComputerOnForFiles(false);
      })
      .finally(() => {
        if (isAlive) setIsLoadingDirectory(false);
      });

    return () => {
      isAlive = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (directoryAutoRetryTimerRef.current === retryTimer) {
        directoryAutoRetryTimerRef.current = null;
      }
    };
  }, [
    clearDirectoryAutoRetryTimer,
    directoryPath,
    directoryRefreshNonce,
    filesExpanded,
    props.activeProjectId,
    sessionIdentityKey,
  ]);

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
          if (result.ok === false) {
            setFilePreview(null);
            setFilePreviewError(formatWorkspaceInspectorFailureMessage(result));
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
  const isStartingComputerForFiles =
    props.isStartingWorkspaceComputer ||
    directoryErrorCode === "computer_starting" ||
    isDirectoryWakeRetrying;
  const shouldShowTurnOnComputerAction =
    canTurnOnComputer &&
    (
      directoryErrorCode === "background_sandbox_not_found" ||
      directoryErrorCode === "sandbox_not_found" ||
      directoryErrorCode === "workspace_credits_exhausted" ||
      directoryErrorCode === "workspace_credits_unavailable" ||
      directoryErrorCode === "workspace_uncollected_usage_blocked" ||
      directoryErrorCode === "workspace_volume_funding_required" ||
      directoryErrorCode === "workspace_card_required_for_additional_volume" ||
      directoryErrorCode === "computer_starting" ||
      directoryErrorCode === "computer_start_failed"
    );
  const shouldShowComputerState =
    filesExpanded &&
    canInspectFiles &&
    !isComputerOnForFiles &&
    Boolean(directoryError || isStartingComputerForFiles);
  const computerStateMessage = isStartingComputerForFiles
    ? "Workspace starting"
    : directoryError ?? "Open project files to wake the workspace.";

  const handleTurnOnComputer = useCallback(async () => {
    if (!canTurnOnComputer) return;
    filePreviewRequestId.current += 1;
    setDirectoryEntries([]);
    setDirectoryError("Workspace starting");
    setDirectoryErrorCode("computer_starting");
    setDirectoryCheckedAt(null);
    setDirectoryIsCached(false);
    setDirectoryIsStale(false);
    directoryWakeRetryStartedAtRef.current = null;
    setIsDirectoryWakeRetrying(false);
    setIsComputerOnForFiles(false);
    setSelectedFilePath(null);
    setFilePreview(null);
    setFilePreviewError(null);
    setIsLoadingFilePreview(false);
    let result: WorkspaceComputerStartResult;
    try {
      result = await props.onTurnOnComputer();
    } catch (error) {
      setDirectoryEntries([]);
      setDirectoryError(error instanceof Error ? error.message : "Project workspace could not start.");
      setDirectoryErrorCode("computer_start_failed");
      setDirectoryCheckedAt(null);
      setDirectoryIsCached(false);
      setDirectoryIsStale(false);
      directoryWakeRetryStartedAtRef.current = null;
      setIsDirectoryWakeRetrying(false);
      setIsComputerOnForFiles(false);
      return;
    }
    if (result.ok === false) {
      setDirectoryEntries([]);
      setDirectoryError(formatWorkspaceInspectorFailureMessage(result));
      setDirectoryErrorCode(result.code);
      setDirectoryCheckedAt(null);
      setDirectoryIsCached(false);
      setDirectoryIsStale(false);
      directoryWakeRetryStartedAtRef.current = null;
      setIsDirectoryWakeRetrying(false);
      return;
    }
    setFilesExpandedForProject(true);
    setDirectoryPath(".");
    setDirectoryEntries([]);
    setDirectoryError(null);
    setDirectoryErrorCode(null);
    setDirectoryCheckedAt(null);
    setDirectoryIsCached(false);
    setDirectoryIsStale(false);
    directoryWakeRetryStartedAtRef.current = null;
    setIsDirectoryWakeRetrying(false);
    setIsComputerOnForFiles(true);
    setDirectoryRefreshNonce((value) => value + 1);
  }, [canTurnOnComputer, props.onTurnOnComputer, setFilesExpandedForProject]);

  const handleTurnOffComputer = useCallback(async () => {
    if (!canTurnOnComputer) return;
    const stopped = await props.onTurnOffComputer();
    if (!stopped) return;
    filePreviewRequestId.current += 1;
    setDirectoryEntries([]);
    setDirectoryError("Open project files to wake the workspace.");
    setDirectoryErrorCode("background_sandbox_not_found");
    setDirectoryCheckedAt(null);
    setDirectoryIsCached(false);
    setDirectoryIsStale(false);
    directoryWakeRetryStartedAtRef.current = null;
    setIsDirectoryWakeRetrying(false);
    setIsComputerOnForFiles(false);
    setSelectedFilePath(null);
    setFilePreview(null);
    setFilePreviewError(null);
    setIsLoadingFilePreview(false);
  }, [canTurnOnComputer, props.onTurnOffComputer]);

  const handleRefreshDirectory = useCallback(() => {
    if (!filesExpanded || !props.session || !props.activeProjectId || isLoadingDirectory) return;
    forceDirectoryRefreshRef.current = true;
    setDirectoryRefreshNonce((value) => value + 1);
  }, [filesExpanded, isLoadingDirectory, props.activeProjectId, props.session]);

  const directoryIndicator = useMemo(() => {
    if (isLoadingDirectory) {
      return { kind: "loading" as const, label: "Refreshing files" };
    }
    if (directoryError) {
      return { kind: "error" as const, label: "Could not refresh files. Try again." };
    }
    if (directoryIsStale) {
      return { kind: "refresh" as const, label: "Refresh files" };
    }
    if (!directoryCheckedAt) return null;
    return {
      kind: "ok" as const,
      label: directoryIsCached ? "File list ready" : "Files up to date",
    };
  }, [directoryCheckedAt, directoryError, directoryIsCached, directoryIsStale, isLoadingDirectory]);

  return (
    <div className="workspace-user-data-panel__grid">
      <section className="workspace-summary-block">
        <dl className="workspace-summary-list">
          <div>
            <dt>Project</dt>
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
            <dt>Billing</dt>
            <dd className="workspace-summary-credit-value">
              <button
                type="button"
                className="workspace-summary-credit-action"
                onClick={props.onOpenWorkspaceBilling}
              >
                {workspaceBillingActionLabel}
              </button>
            </dd>
          </div>
        </dl>
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
          <p className="workspace-files-note">Open project files to wake the workspace.</p>
        ) : shouldShowComputerState ? (
          <div className="workspace-files-empty-state">
            <div className="workspace-files-computer-row">
              <p>
                {isStartingComputerForFiles ? (
                  <LoaderCircle
                    className="workspace-files-computer-spinner"
                    size={14}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                ) : null}
                <span>{computerStateMessage}</span>
              </p>
              {shouldShowTurnOnComputerAction ? (
                <label
                  className={`members-switch integration-mounted-switch workspace-files-computer-switch${
                    isStartingComputerForFiles ? " is-disabled" : ""
                  }`}
                  title={isStartingComputerForFiles ? "Workspace starting" : "Open project files"}
                >
                  <input
                    type="checkbox"
                    checked={isStartingComputerForFiles}
                    disabled={isStartingComputerForFiles}
                    aria-label="Open project files"
                    onChange={(event) => {
                      if (event.target.checked) void handleTurnOnComputer();
                    }}
                  />
                  <span className="members-switch-track">
                    <span className="members-switch-thumb" />
                  </span>
                </label>
              ) : null}
            </div>
            {shouldShowTurnOnComputerAction ? (
              <span className="workspace-files-computer-caption">
                {isStartingComputerForFiles ? "Starting" : "Off"}
              </span>
            ) : null}
          </div>
        ) : filesExpanded ? (
          <div className="workspace-files-browser">
            <div className="workspace-files-browser__toolbar">
              {pathDepth(directoryPath) > 0 ? (
                <button
                  type="button"
                  className="workspace-files-back"
                  onClick={() => {
                    filePreviewRequestId.current += 1;
                    setDirectoryPath(parentDirectory(directoryPath));
                    setSelectedFilePath(null);
                    setFilePreview(null);
                    setFilePreviewError(null);
                    setIsLoadingFilePreview(false);
                  }}
                  disabled={isLoadingDirectory}
                  aria-label="Go to parent folder"
                  title="Parent folder"
                >
                  <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              ) : null}
              <span className="workspace-files-path">{formatWorkspaceBreadcrumb(directoryPath)}</span>
              {directoryIndicator?.kind === "ok" ? (
                <span
                  className="workspace-files-status workspace-files-status--ok"
                  aria-label={directoryIndicator.label}
                  title={directoryIndicator.label}
                  role="img"
                >
                  <Check size={13} strokeWidth={2.2} aria-hidden="true" />
                </span>
              ) : directoryIndicator ? (
                <button
                  type="button"
                  className={`workspace-files-refresh workspace-files-refresh--${directoryIndicator.kind}`}
                  onClick={handleRefreshDirectory}
                  disabled={isLoadingDirectory}
                  aria-label={directoryIndicator.label}
                  title={directoryIndicator.label}
                >
                  <RefreshCw
                    className={directoryIndicator.kind === "loading" ? "is-spinning" : undefined}
                    size={13}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </button>
              ) : null}
              {isComputerOnForFiles ? (
                <label
                  className={`members-switch integration-mounted-switch workspace-files-computer-switch${
                    props.isStoppingWorkspaceComputer ? " is-disabled" : ""
                  }`}
                  title="Stop project workspace"
                >
                  <input
                    type="checkbox"
                    checked
                    disabled={props.isStoppingWorkspaceComputer}
                    aria-label="Stop project workspace"
                    onChange={(event) => {
                      if (!event.target.checked) void handleTurnOffComputer();
                    }}
                  />
                  <span className="members-switch-track">
                    <span className="members-switch-thumb" />
                  </span>
                </label>
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
                    <WorkspaceFileIcon entry={entry} />
                    <span>
                      <strong>{entry.name}</strong>
                      <em>{formatWorkspaceEntryKind(entry)}</em>
                    </span>
                  </button>
                ))
              ) : (
                <div className="workspace-files-empty">
                  This project has no files yet.
                  <br />
                  Upload files or ask your Polynet agent to create something.
                </div>
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
              <WorkspacePreviewHeader
                name={filePreview.name}
                meta={[filePreview.mimeType, formatBytes(filePreview.sizeBytes)].filter(Boolean).join(" · ")}
              />
              <img src={filePreview.dataUrl} alt={filePreview.name} />
            </figure>
          ) : filePreview?.ok && filePreview.previewKind === "text" ? (
            <WorkspaceTextPreview preview={filePreview} />
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

export function WorkspaceCommunityPreviewPanelContent(props: WorkspaceCommunityPreviewPanelDataProps) {
  const community = props.activeCommunity;
  const memberLabel =
    typeof props.memberCount === "number"
      ? `${props.memberCount.toLocaleString()} ${props.memberCount === 1 ? "member" : "members"}`
      : null;
  const onlineLabel =
    typeof props.onlineCount === "number"
      ? `${props.onlineCount.toLocaleString()} online`
      : null;
  const meta = [props.roleLabel, memberLabel, onlineLabel].filter(Boolean).join(" · ");
  const oneLiner = String(community.one_liner ?? "").trim();

  return (
    <div className="workspace-community-preview">
      <section className="workspace-community-preview__hero">
        <CommunityAvatar
          className="workspace-community-preview__avatar"
          imageUrl={community.avatar_url}
          focusX={community.avatar_focus_x}
          focusY={community.avatar_focus_y}
          zoom={community.avatar_zoom}
          name={community.name}
          fallbackClassName="workspace-community-preview__avatar-fallback"
        />
        <div className="workspace-community-preview__identity">
          <div className="workspace-community-preview__eyebrow">Community lens</div>
          <h2>{community.name}</h2>
          {oneLiner ? <p>{oneLiner}</p> : null}
          {meta ? (
            <div className="workspace-community-preview__meta">
              <Users size={14} strokeWidth={1.8} aria-hidden="true" />
              <span>{meta}</span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="workspace-community-preview__open"
          onClick={props.onOpenCommunity}
        >
          <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />
          <span>Open chat</span>
        </button>
      </section>

      <section className="workspace-community-preview__recent" aria-label="Recent community chat">
        <div className="workspace-community-preview__section-title">Recent chat</div>
        {props.recentChatPreview}
      </section>
    </div>
  );
}
