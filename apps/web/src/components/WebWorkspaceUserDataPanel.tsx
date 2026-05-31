import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  File,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  LoaderCircle,
  RefreshCw,
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
import { AnalyticsLineChart } from "../../../../shared/AnalyticsLineChart";
import type {
  AnalyticsRange,
  CommunityAnalyticsSeries,
  CommunityAnalyticsSummary,
} from "../../../../shared/communityTypes";
import {
  formatCount,
  formatMoneyBaseUnits,
  formatPercent,
} from "../../../../shared/contentFormatting";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";
import type { WorkspaceCreditBalance } from "../../../../shared/workspaceCreditsGateway";
import {
  listWorkspaceDirectoryCanonical,
  readWorkspaceFilePreviewCanonical,
  type WorkspaceInspectorDirectoryEntry,
  type WorkspaceInspectorFailure,
  type WorkspaceInspectorFilePreview,
} from "../../../../shared/workspaceInspectorGateway";
import type { WorkspaceComputerStartResult } from "../../../../shared/workspaceTerminalsGateway";
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
  analytics: WorkspaceUserPanelCommunityAnalytics;
  operations: WorkspaceUserPanelCommunityOperations;
  recentSignals: WorkspaceUserPanelRecentSignal[];
  integrations: WorkspaceUserPanelIntegration[];
};

export type WorkspaceUserPanelCommunityAnalytics = {
  canView: boolean;
  range: AnalyticsRange;
  isLoading: boolean;
  error: string | null;
  summary: CommunityAnalyticsSummary;
  series: CommunityAnalyticsSeries;
};

export type WorkspaceUserPanelJoinRequest = WorkspaceUserPanelOnlineFace & {
  id: string;
  userId: string;
  message: string | null;
  createdAtLabel: string;
};

export type WorkspaceUserPanelCommunityOperations = {
  canReviewJoinRequests: boolean;
  joinReviewMode: "paid" | "free_auto" | "free_approval" | null;
  pendingJoinRequests: WorkspaceUserPanelJoinRequest[];
  hiddenJoinRequestCount: number;
  isLoadingJoinRequests: boolean;
  joinRequestsError: string | null;
  decidingJoinRequestId: string | null;
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
  kind: "chat" | "ai_feed" | "resource" | "event";
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
    tab: "chat" | "ai_feed" | "resources" | "events";
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
  hasWorkspaceCardOnFile?: boolean | null;
  isStartingWorkspaceComputer: boolean;
  isStoppingWorkspaceComputer: boolean;
  workspaceComputerStartError: string | null;
  session: AuthSessionLike | null;
  activeProjectId: string | null;
  activeProjectName: string | null;
  activeThreadTitle: string | null;
  activeModelLabel: string | null;
  activeCommunity: WorkspaceUserPanelCommunity | null;
  onOpenWorkspaceCreditTopup: () => void;
  onTurnOnComputer: () => Promise<WorkspaceComputerStartResult>;
  onTurnOffComputer: () => Promise<boolean>;
  onOpenRecentSignal: (target: WorkspaceUserPanelRecentSignal["target"]) => void;
  onOpenActiveCommunitySettings: () => void;
  onOpenActiveCommunityMembers: () => void;
  onSetCommunityAnalyticsRange: (value: AnalyticsRange) => void;
  onApproveCommunityJoinRequest: (requestId: string) => Promise<void> | void;
  onDenyCommunityJoinRequest: (requestId: string) => Promise<void> | void;
  onOpenWorkspaceIntegrationSetup: () => void;
  onToggleCommunityIntegration: (
    communityAppMountId: string,
    enabled: boolean,
  ) => Promise<boolean> | boolean | Promise<void> | void;
  isLoadingCommunityMemberSettings: boolean;
  communityMemberSettingsError: string | null;
  onToggleCommunityMute: (muted: boolean) => Promise<void> | void;
};

type CommunityPanelContentProps = WorkspaceUserDataPanelDataProps & {
  isRecentSignalsExpanded: boolean;
  onRecentSignalsExpandedChange: (expanded: boolean) => void;
};

const WORKSPACE_FILES_EXPANDED_STORAGE_KEY_PREFIX = "polynet-workspace-files-expanded";
const WORKSPACE_PANEL_COLLAPSED_SIGNAL_LIMIT = 8;
const WORKSPACE_PANEL_EXPANDED_SIGNAL_VIEWPORT_ITEMS = 10;
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

function formatCommunityRole(value: WorkspaceUserPanelCommunity["role"]): string {
  if (value === "owner") return "Owner";
  if (value === "admin") return "Admin";
  if (value === "moderator") return "Moderator";
  return "Member";
}

function formatWorkspaceInspectorFailure(result: WorkspaceInspectorFailure): string {
  if (result.code === "background_sandbox_not_found" || result.code === "sandbox_not_found") {
    return "Turn on computer to view files.";
  }
  if (
    result.code === "blaxel_sandbox_not_found" ||
    result.code === "blaxel_workspace_recreate_failed"
  ) {
    return "Workspace is waking up. Try again in a moment.";
  }
  if (result.code === "blaxel_volume_quota_exceeded") {
    return "Workspace storage quota is full. Delete an unused computer or volume, then try again.";
  }
  if (
    result.code === "workspace_volume_limit_reached" ||
    result.code === "workspace_provider_volume_quota_headroom_exhausted"
  ) {
    return "Workspace storage quota is full. Delete an unused computer, then try again.";
  }
  if (result.code === "workspace_volume_funding_required") {
    return "Add prepaid credits or a card before creating workspace storage.";
  }
  if (result.code === "workspace_card_required_for_additional_volume") {
    return "Extra computers require a card on file.";
  }
  if (result.code === "workspace_uncollected_usage_blocked") {
    return "Clear prior workspace usage before turning on this computer.";
  }
  if (result.code === "workspace_credits_exhausted") return "Turn on computer to view files.";
  return result.message;
}

function isWorkspaceInspectorWakeRetryableCode(code: string | null | undefined): boolean {
  return (
    code === "blaxel_sandbox_not_found" ||
    code === "blaxel_sandbox_not_ready" ||
    code === "blaxel_workspace_recreate_failed"
  );
}

function workspaceInspectorRetryDelayMs(result: WorkspaceInspectorFailure): number {
  return result.retryAfterMs ?? WORKSPACE_INSPECTOR_WAKE_RETRY_DEFAULT_DELAY_MS;
}

function WorkspaceCommunityAnalyticsPreview(props: {
  analytics: WorkspaceUserPanelCommunityAnalytics;
  onSetRange: (value: AnalyticsRange) => void;
}) {
  const rangeOptions = ["7d", "30d", "90d", "1y", "all"] as const;
  const chartMetricOptions = ["visits", "members", "revenue"] as const;
  const [chartMetric, setChartMetric] = useState<(typeof chartMetricOptions)[number]>("members");
  const rangeSwitcherStyle = buildPlatformSwitcherStyle(
    rangeOptions.length,
    rangeOptions.findIndex((value) => value === props.analytics.range),
  );
  const chartMetricSwitcherStyle = buildPlatformSwitcherStyle(
    chartMetricOptions.length,
    chartMetricOptions.findIndex((value) => value === chartMetric),
  );
  const chartPoints = props.analytics.series[chartMetric] ?? [];
  const chartTitle =
    chartMetric === "visits" ? "Page visits" : chartMetric === "revenue" ? "Revenue" : "New members";
  const chartStat = useMemo(() => {
    if (chartPoints.length === 0) return "—";
    if (chartMetric === "revenue") {
      const latest = chartPoints[chartPoints.length - 1]?.value ?? 0;
      return formatMoneyBaseUnits(
        latest,
        props.analytics.summary.currency,
        props.analytics.summary.currency_decimals,
      );
    }
    const total = chartPoints.reduce((sum, point) => sum + point.value, 0);
    return formatCount(total);
  }, [
    chartMetric,
    chartPoints,
    props.analytics.summary.currency,
    props.analytics.summary.currency_decimals,
  ]);

  return (
    <section className="workspace-community-section workspace-community-analytics">
      <div className="workspace-community-analytics-header">
        <div className="workspace-community-section__title">Growth + monetization</div>
        <div
          className="platform-switcher platform-switcher-compact workspace-community-analytics-range"
          role="tablist"
          aria-label="Community analytics time range"
          style={rangeSwitcherStyle}
        >
          {rangeOptions.map((value) => (
            <button
              key={value}
              type="button"
              className={
                value === props.analytics.range
                  ? "platform-switcher-btn is-active"
                  : "platform-switcher-btn"
              }
              onClick={() => props.onSetRange(value)}
              aria-pressed={value === props.analytics.range}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {props.analytics.isLoading ? (
        <div className="workspace-community-note">Loading analytics...</div>
      ) : null}
      {props.analytics.error ? (
        <div className="workspace-community-note">{props.analytics.error}</div>
      ) : null}
      <div className="analytics-kpi-strip" aria-label="Community analytics">
        {[
          {
            label: "Page visits",
            value: formatCount(props.analytics.summary.page_visits_window),
          },
          {
            label: "New members",
            value: formatCount(props.analytics.summary.new_members_window),
          },
          {
            label: "Conversion",
            value: formatPercent(props.analytics.summary.conversion_rate_window),
          },
          {
            label: "MRR",
            value: formatMoneyBaseUnits(
              props.analytics.summary.mrr_base_units,
              props.analytics.summary.currency,
              props.analytics.summary.currency_decimals,
            ),
          },
        ].map((kpi) => (
          <div key={kpi.label} className="analytics-kpi-tile">
            <div className="analytics-kpi-value-big">{kpi.value}</div>
            <div className="analytics-kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>
      <div className="analytics-chart-card">
        <div className="analytics-chart-header">
          <div className="analytics-chart-heading">
            <div className="analytics-chart-title">{chartTitle}</div>
            <div className="analytics-chart-stat">{chartStat}</div>
          </div>
          <div
            className="platform-switcher platform-switcher-compact analytics-chart-metric-switcher"
            role="tablist"
            aria-label="Community analytics chart metric"
            style={chartMetricSwitcherStyle}
          >
            {chartMetricOptions.map((value) => (
              <button
                key={value}
                type="button"
                className={value === chartMetric ? "platform-switcher-btn is-active" : "platform-switcher-btn"}
                onClick={() => setChartMetric(value)}
                aria-pressed={value === chartMetric}
              >
                {value === "visits" ? "Visits" : value === "revenue" ? "Revenue" : "Members"}
              </button>
            ))}
          </div>
        </div>
        <AnalyticsLineChart
          height={126}
          points={chartPoints}
          valueFormatter={
            chartMetric === "revenue"
              ? (value) =>
                  formatMoneyBaseUnits(
                    value,
                    props.analytics.summary.currency,
                    props.analytics.summary.currency_decimals,
                  )
              : undefined
          }
        />
      </div>
    </section>
  );
}

function WorkspaceCommunityOperations(props: {
  operations: WorkspaceUserPanelCommunityOperations;
  onApprove: (requestId: string) => Promise<void> | void;
  onDeny: (requestId: string) => Promise<void> | void;
  onOpenMembers: () => void;
}) {
  if (!props.operations.canReviewJoinRequests || props.operations.joinReviewMode !== "free_approval") {
    return null;
  }

  return (
    <section className="workspace-community-section workspace-community-operations">
      <div className="workspace-community-section__title">Operations</div>
      {props.operations.isLoadingJoinRequests ? (
        <div className="workspace-community-note">Loading approvals...</div>
      ) : props.operations.pendingJoinRequests.length === 0 ? (
        <div className="workspace-community-note">No pending approvals.</div>
      ) : (
        <div className="workspace-community-approval-list">
          {props.operations.pendingJoinRequests.map((request) => {
            const isDeciding = props.operations.decidingJoinRequestId === request.id;
            return (
              <div key={request.id} className="workspace-community-approval-row">
                <UserAvatar
                  className="workspace-community-approval-avatar public-funnel-face"
                  readyClassName="has-image"
                  name={request.displayName ?? request.userId}
                  imageUrl={request.avatarUrl}
                  focusX={request.avatarFocusX ?? 0.5}
                  focusY={request.avatarFocusY ?? 0.5}
                  zoom={request.avatarZoom ?? 1}
                  alt=""
                  aria-hidden={true}
                  fallback={null}
                />
                <div className="workspace-community-approval-copy">
                  <div className="workspace-community-approval-title">
                    <strong>{request.displayName ?? "Member"}</strong>
                    <span>{request.createdAtLabel}</span>
                  </div>
                  {request.message ? (
                    <div className="workspace-community-approval-message">{request.message}</div>
                  ) : null}
                </div>
                <div className="workspace-community-approval-actions">
                  <button
                    type="button"
                    className="workspace-community-approval-action"
                    disabled={isDeciding}
                    onClick={() => void props.onApprove(request.id)}
                    aria-label={`Approve ${request.displayName ?? "member"}`}
                    title="Approve"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="workspace-community-approval-action is-danger"
                    disabled={isDeciding}
                    onClick={() => void props.onDeny(request.id)}
                    aria-label={`Deny ${request.displayName ?? "member"}`}
                    title="Deny"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {props.operations.hiddenJoinRequestCount > 0 ? (
        <button
          type="button"
          className="workspace-community-signal-view-more"
          onClick={props.onOpenMembers}
        >
          {props.operations.hiddenJoinRequestCount} more
        </button>
      ) : null}
      {props.operations.joinRequestsError ? (
        <div className="workspace-community-note">{props.operations.joinRequestsError}</div>
      ) : null}
    </section>
  );
}

export function WorkspacePanelContent(props: WorkspaceUserDataPanelDataProps & {
  filesResetNonce?: number;
}) {
  const workspaceBillingActionLabel = props.isStartingWorkspaceCreditTopupCheckout
    ? "Opening"
    : "Billing";
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
  const [workspaceFilesProviderId, setWorkspaceFilesProviderId] = useState<"blaxel" | null>(null);
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
    setWorkspaceFilesProviderId(null);
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
    setWorkspaceFilesProviderId(null);
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
          setDirectoryError(formatWorkspaceInspectorFailure(result));
          setDirectoryErrorCode(result.code);
          setDirectoryCheckedAt(null);
          setDirectoryIsCached(false);
          setDirectoryIsStale(false);
          setIsComputerOnForFiles(false);
          setWorkspaceFilesProviderId(null);
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
        setWorkspaceFilesProviderId(result.providerId);
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
        setWorkspaceFilesProviderId(null);
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
    ? "Computer turning on"
    : directoryError ?? "Turn on computer to view files.";

  const handleTurnOnComputer = useCallback(async () => {
    if (!canTurnOnComputer) return;
    filePreviewRequestId.current += 1;
    setDirectoryEntries([]);
    setDirectoryError("Computer turning on");
    setDirectoryErrorCode("computer_starting");
    setDirectoryCheckedAt(null);
    setDirectoryIsCached(false);
    setDirectoryIsStale(false);
    directoryWakeRetryStartedAtRef.current = null;
    setIsDirectoryWakeRetrying(false);
    setIsComputerOnForFiles(false);
    setWorkspaceFilesProviderId(null);
    setSelectedFilePath(null);
    setFilePreview(null);
    setFilePreviewError(null);
    setIsLoadingFilePreview(false);
    let result: WorkspaceComputerStartResult;
    try {
      result = await props.onTurnOnComputer();
    } catch (error) {
      setDirectoryEntries([]);
      setDirectoryError(error instanceof Error ? error.message : "Computer could not turn on.");
      setDirectoryErrorCode("computer_start_failed");
      setDirectoryCheckedAt(null);
      setDirectoryIsCached(false);
      setDirectoryIsStale(false);
      directoryWakeRetryStartedAtRef.current = null;
      setIsDirectoryWakeRetrying(false);
      setIsComputerOnForFiles(false);
      setWorkspaceFilesProviderId(null);
      return;
    }
    if (result.ok === false) {
      setDirectoryEntries([]);
      setDirectoryError(formatWorkspaceInspectorFailure(result));
      setDirectoryErrorCode(result.code);
      setDirectoryCheckedAt(null);
      setDirectoryIsCached(false);
      setDirectoryIsStale(false);
      directoryWakeRetryStartedAtRef.current = null;
      setIsDirectoryWakeRetrying(false);
      setWorkspaceFilesProviderId(null);
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
    setWorkspaceFilesProviderId("blaxel");
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
    setDirectoryCheckedAt(null);
    setDirectoryIsCached(false);
    setDirectoryIsStale(false);
    directoryWakeRetryStartedAtRef.current = null;
    setIsDirectoryWakeRetrying(false);
    setIsComputerOnForFiles(false);
    setWorkspaceFilesProviderId(null);
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

  const directoryFreshnessLabel = useMemo(() => {
    if (!directoryCheckedAt) return null;
    const ageSeconds = Math.max(0, Math.floor((Date.now() - directoryCheckedAt) / 1000));
    const ageLabel = ageSeconds < 60
      ? "now"
      : ageSeconds < 3600
        ? `${Math.floor(ageSeconds / 60)}m ago`
        : `${Math.floor(ageSeconds / 3600)}h ago`;
    return `${directoryIsCached ? "Cached" : "Checked"} ${ageLabel}${directoryIsStale ? " · may be stale" : ""}`;
  }, [directoryCheckedAt, directoryIsCached, directoryIsStale]);

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
            <dt>Billing</dt>
            <dd className="workspace-summary-credit-value">
              <button
                type="button"
                className="workspace-summary-credit-action"
                onClick={props.onOpenWorkspaceCreditTopup}
                disabled={props.isStartingWorkspaceCreditTopupCheckout}
              >
                {workspaceBillingActionLabel}
              </button>
            </dd>
          </div>
        </dl>
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
                  title={isStartingComputerForFiles ? "Computer turning on" : "Turn on computer"}
                >
                  <input
                    type="checkbox"
                    checked={isStartingComputerForFiles}
                    disabled={isStartingComputerForFiles}
                    aria-label="Turn on computer"
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
              {directoryFreshnessLabel ? (
                <span className="workspace-files-cache-note">{directoryFreshnessLabel}</span>
              ) : null}
              <button
                type="button"
                className="workspace-files-refresh"
                onClick={handleRefreshDirectory}
                disabled={isLoadingDirectory}
                aria-label="Refresh files"
                title="Refresh files"
              >
                <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
              </button>
              {isComputerOnForFiles && workspaceFilesProviderId !== "blaxel" ? (
                <label
                  className={`members-switch integration-mounted-switch workspace-files-computer-switch${
                    props.isStoppingWorkspaceComputer ? " is-disabled" : ""
                  }`}
                  title="Turn off computer"
                >
                  <input
                    type="checkbox"
                    checked
                    disabled={props.isStoppingWorkspaceComputer}
                    aria-label="Turn off computer"
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
                  This computer has no files yet.
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

export function CommunityPanelContent(props: CommunityPanelContentProps) {
  const community = props.activeCommunity;
  const [isRecentSignalsAtBottom, setIsRecentSignalsAtBottom] = useState(true);
  const recentSignalsViewportRef = useRef<HTMLDivElement | null>(null);
  const isRecentSignalsExpanded = props.isRecentSignalsExpanded;

  useEffect(() => {
    setIsRecentSignalsAtBottom(true);
  }, [community?.id, isRecentSignalsExpanded]);

  const panelRecentSignals = community?.recentSignals ?? [];
  const recentSignalsCount = panelRecentSignals.length;
  const updateRecentSignalsScrollState = useCallback(() => {
    const viewport = recentSignalsViewportRef.current;
    if (!viewport || !isRecentSignalsExpanded) {
      setIsRecentSignalsAtBottom(true);
      return;
    }
    const canScroll = viewport.scrollHeight > viewport.clientHeight + 8;
    const atBottom = !canScroll || viewport.scrollHeight - viewport.scrollTop <= viewport.clientHeight + 24;
    setIsRecentSignalsAtBottom(atBottom);
  }, [isRecentSignalsExpanded]);

  useEffect(() => {
    const frame = requestAnimationFrame(updateRecentSignalsScrollState);
    return () => cancelAnimationFrame(frame);
  }, [isRecentSignalsExpanded, recentSignalsCount, updateRecentSignalsScrollState]);

  if (!community) {
    return null;
  }
  const isOwnerAdminCommunityView =
    community.role === "owner" ||
    community.role === "admin" ||
    community.analytics.canView ||
    community.operations.canReviewJoinRequests;

  const visibleRecentSignals = isRecentSignalsExpanded
    ? panelRecentSignals
    : panelRecentSignals.slice(0, WORKSPACE_PANEL_COLLAPSED_SIGNAL_LIMIT);
  const canExpandRecentSignals = panelRecentSignals.length > WORKSPACE_PANEL_COLLAPSED_SIGNAL_LIMIT;
  const hasExtendedRecentSignals =
    isRecentSignalsExpanded && panelRecentSignals.length > WORKSPACE_PANEL_EXPANDED_SIGNAL_VIEWPORT_ITEMS;
  const scrollRecentSignalsToBottom = () => {
    const viewport = recentSignalsViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      top: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      behavior: "smooth",
    });
  };
  const toggleRecentSignalsExpanded = () => {
    const nextIsExpanded = !isRecentSignalsExpanded;
    props.onRecentSignalsExpandedChange(nextIsExpanded);
    if (!nextIsExpanded) {
      setIsRecentSignalsAtBottom(true);
      requestAnimationFrame(() => {
        const viewport = recentSignalsViewportRef.current;
        if (viewport) viewport.scrollTop = 0;
      });
      return;
    }
    if (panelRecentSignals.length > WORKSPACE_PANEL_EXPANDED_SIGNAL_VIEWPORT_ITEMS) {
      setIsRecentSignalsAtBottom(false);
    }
  };
  const shouldShowRecentSignalsScrollBottom = hasExtendedRecentSignals && !isRecentSignalsAtBottom;

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
      {isOwnerAdminCommunityView && community.analytics.canView ? (
        <WorkspaceCommunityAnalyticsPreview
          analytics={community.analytics}
          onSetRange={props.onSetCommunityAnalyticsRange}
        />
      ) : null}
      {isOwnerAdminCommunityView ? (
        <WorkspaceCommunityOperations
          operations={community.operations}
          onApprove={props.onApproveCommunityJoinRequest}
          onDeny={props.onDenyCommunityJoinRequest}
          onOpenMembers={props.onOpenActiveCommunityMembers}
        />
      ) : null}
      {panelRecentSignals.length > 0 ? (
        <section className="workspace-community-section">
          <div className="workspace-community-section__title">Recent signal</div>
          <div
            className={`workspace-community-signal-viewport${isRecentSignalsExpanded ? " is-expanded" : ""}`}
          >
            <div
              ref={recentSignalsViewportRef}
              className="workspace-community-signal-scroll-region"
              onScroll={updateRecentSignalsScrollState}
            >
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
              </div>
            </div>
            {shouldShowRecentSignalsScrollBottom ? (
              <button
                type="button"
                className="scroll-to-bottom workspace workspace-community-signal-scroll-bottom"
                onClick={scrollRecentSignalsToBottom}
                aria-label="Scroll recent signal to bottom"
                title="Scroll to bottom"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14" />
                  <path d="M19 12l-7 7-7-7" />
                </svg>
              </button>
            ) : null}
          </div>
          <div className="workspace-community-signal-actions">
            {canExpandRecentSignals ? (
              <button
                type="button"
                className="workspace-community-signal-view-more"
                onClick={toggleRecentSignalsExpanded}
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
