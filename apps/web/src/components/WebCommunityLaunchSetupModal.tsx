import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  Circle,
  ExternalLink,
  FileText,
  Folder,
  Image,
  Link2,
  LockKeyhole,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { getCommunityBannerImageStyle } from "../../../../shared/communityBannerUi";
import type { CommunityWikiArchitectProposal } from "../../../../shared/communityWikiArchitectPrompt";
import type {
  CommunityLaunchSetupMissing,
  CommunityLaunchSetupStatus,
  CommunityLaunchSetupStep,
} from "../../../../shared/communityLaunchSetup";
import { buildCommunityLaunchSetupStatus } from "../../../../shared/communityLaunchSetup";
import { slugifyCommunityName } from "../../../../shared/communitySlug";
import {
  readBannerFileAsWideDataUrlWithinLimit,
  readCommunityAvatarFileAsDataUrlWithinLimit,
} from "../../../../shared/imageTransforms";
import { StripeWordmark } from "./StripeWordmark";

const COMMUNITY_LAUNCH_IMAGE_DATA_URL_MAX_CHARS = 600_000;
const COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS = 5;
const COMMUNITY_LAUNCH_MAX_GOOGLE_DRIVE_FILES = 20;
const COMMUNITY_LAUNCH_MAX_GITHUB_FILES = 20;
const COMMUNITY_LAUNCH_GITHUB_FILE_LIST_LIMIT = 80;

type KnowledgeView = "collect" | "assemble";
type KnowledgeAssemblyWorkStage =
  | "reading"
  | "organizing"
  | "creating"
  | "writing"
  | "checking"
  | "opening";
type KnowledgeAssemblyStage = "idle" | KnowledgeAssemblyWorkStage | "failed";
type KnowledgeAssemblyStepStatus = "pending" | "active" | "complete" | "failed";

const KNOWLEDGE_ASSEMBLY_STEPS: Array<{
  stage: KnowledgeAssemblyWorkStage;
  label: string;
}> = [
  { stage: "reading", label: "Reading source material" },
  { stage: "organizing", label: "Organizing resource structure" },
  { stage: "creating", label: "Creating draft pages" },
  { stage: "writing", label: "Writing source-backed content" },
  { stage: "checking", label: "Checking organization" },
  { stage: "opening", label: "Opening Resources review" },
];

type CommunityEntryPolicy = "open" | "approval" | "paid_subscription";

type CommunityLaunchSetupCommunity = {
  id: string;
  slug: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url: string | null;
  banner_storage_id?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: string;
  entry_policy?: CommunityEntryPolicy | null;
  agent_system_prompt?: string | null;
  agent_starter_prompts?: string[] | null;
};

export type CommunityLaunchProfileSaveDraft = {
  name: string;
  slug: string;
  oneLiner: string;
  avatarUrl: string;
  bannerUrl: string;
};

export type CommunityLaunchAboutSaveDraft = {
  about: string;
};

export type CommunityLaunchKnowledgeLinkSaveDraft = {
  urls: string[];
};

export type CommunityLaunchKnowledgeFileSaveDraft = {
  files: File[];
};

export type CommunityLaunchKnowledgeHealth = {
  summary?: {
    modules?: number;
    pages?: number;
    sources?: number;
    draft_pages?: number;
    source_inbox_items?: number;
    issue_count?: number;
  };
  issues?: {
    unreferencedSources?: unknown[];
    staleDrafts?: unknown[];
    sparsePages?: unknown[];
  };
};

export type CommunityLaunchKnowledgePlanResult = {
  ok?: boolean;
  proposal?: CommunityWikiArchitectProposal | null;
  errors?: Array<{
    path?: string;
    message?: string;
  }>;
  message?: string | null;
  code?: string | null;
  output_preview?: string | null;
  model_id?: string | null;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  } | null;
  context_summary?: {
    modules?: number;
    pages?: number;
    sources?: number;
  } | null;
};

export type CommunityLaunchKnowledgePlanApplyResult = {
  ok?: boolean;
  summary?: {
    modules_created?: string[];
    pages_created?: string[];
    pages_updated?: string[];
    source_modules_updated?: string[];
  };
  architecture_quality?: {
    ok?: boolean;
    warnings?: string[];
    source_backed_pages?: number;
    unsorted_source_backed_pages?: number;
    source_backed_pages_missing_module?: number;
    used_sources?: number;
    used_sources_in_unsorted?: number;
    source_module_mismatches?: number;
    module_distribution?: Array<{
      module?: string;
      pages?: number;
    }>;
  } | null;
  health?: CommunityLaunchKnowledgeHealth;
  errors?: Array<{
    path?: string;
    message?: string;
  }>;
  message?: string | null;
  code?: string | null;
};

export type CommunityLaunchKnowledgeContentDraftResult = {
  ok?: boolean;
  candidates?: number;
  drafted?: number;
  failed?: number;
  message?: string | null;
  code?: string | null;
  pages?: Array<{
    id?: string;
    title?: string;
    status?: string;
    source_resource_id?: string | null;
  }>;
  failures?: Array<{
    resource_id?: string;
    title?: string;
    message?: string;
  }>;
};

export type CommunityLaunchKnowledgeSourceIngestionResult = {
  ok?: boolean;
  message?: string | null;
  code?: string | null;
  processed?: number;
  succeeded?: number;
  failed?: number;
  ready_sources?: number;
  total_sources?: number;
  pending_sources?: number;
  pending_url_sources?: number;
  pending_file_sources?: number;
  pending_google_drive_sources?: number;
  pending_github_sources?: number;
  failures?: Array<{
    title?: string;
    url?: string;
    message?: string;
  }>;
};

export type CommunityLaunchGoogleDriveConnection = {
  connected: boolean;
  email?: string | null;
  updated_at?: string | null;
};

export type CommunityLaunchGoogleDriveFile = {
  id: string;
  name: string;
  mime_type: string;
  kind: "file" | "folder";
  importable: boolean;
  web_url?: string | null;
  modified_time?: string | null;
  size?: string | null;
};

export type CommunityLaunchGoogleDriveFileListRequest = {
  query?: string | null;
  folderId?: string | null;
  pageToken?: string | null;
};

export type CommunityLaunchGoogleDriveFileListResult = {
  ok?: boolean;
  connection?: CommunityLaunchGoogleDriveConnection | null;
  folder_id?: string | null;
  query?: string | null;
  next_page_token?: string | null;
  files?: CommunityLaunchGoogleDriveFile[];
};

export type CommunityLaunchGoogleDriveImportResult = {
  ok?: boolean;
  imported?: number;
  skipped?: number;
  failed?: number;
  failures?: Array<{
    id?: string;
    name?: string | null;
    message?: string | null;
  }>;
};

export type CommunityLaunchKnowledgeImportedSource = {
  id: string;
  title: string;
  source_ingestion_status?: "not_required" | "queued" | "processing" | "ready" | "failed";
  source_ingestion_kind?: "manual" | "url" | "file" | "google_drive" | "github";
  source_ingestion_error?: string | null;
  source_external_provider?: "google_drive" | "github" | null;
  source_external_id?: string | null;
  source_external_name?: string | null;
  source_external_url?: string | null;
  source_external_mime_type?: string | null;
  source_external_modified_at?: string | null;
  credential_status?: "available" | "missing";
  credential_message?: string | null;
};

const EMPTY_COMMUNITY_LAUNCH_IMPORTED_SOURCES: CommunityLaunchKnowledgeImportedSource[] = [];

type ImportedKnowledgeSourceRowsProps = {
  sources: CommunityLaunchKnowledgeImportedSource[];
  fallbackTitle: string;
  resourceLabel: string;
  expanded: boolean;
  removingSourceId: string | null;
  disabled: boolean;
  canRemove: boolean;
  onToggleExpanded: () => void;
  onRemove: (source: CommunityLaunchKnowledgeImportedSource) => void;
};

type ImportedKnowledgeSourceRemovalConfig = {
  source: CommunityLaunchKnowledgeImportedSource;
  providerName: string;
  removingSourceId: string | null;
  setRemovingSourceId: (sourceId: string | null) => void;
  removeSource?: (resourceId: string) => Promise<boolean | void>;
  setSelectedIds?: Dispatch<SetStateAction<string[]>>;
};

function ImportedKnowledgeSourceRows({
  sources,
  fallbackTitle,
  resourceLabel,
  expanded,
  removingSourceId,
  disabled,
  canRemove,
  onToggleExpanded,
  onRemove,
}: ImportedKnowledgeSourceRowsProps) {
  if (sources.length === 0) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        className="community-launch-knowledge-imported-summary"
        onClick={onToggleExpanded}
        aria-expanded="false"
        aria-label={`View ${resourceLabel}`}
      >
        <Check
          className="community-launch-knowledge-imported-check"
          size={11}
          strokeWidth={3}
          aria-hidden="true"
        />
        <span>{resourceLabel}</span>
      </button>
    );
  }

  return (
    <>
      <div className="community-launch-knowledge-imported-sources is-expanded">
        {sources.map((source) => {
          const title = source.title || fallbackTitle;
          const isRemoving = removingSourceId === source.id;
          const credentialMessage = source.credential_message?.trim() || "";

          return (
            <div
              key={source.id}
              className={`community-launch-knowledge-imported-source${
                credentialMessage ? " is-credential-missing" : ""
              }`}
              title={credentialMessage || undefined}
            >
              <Check
                className="community-launch-knowledge-imported-check"
                size={11}
                strokeWidth={3}
                aria-hidden="true"
              />
              <span>{title}</span>
              {source.source_external_url ? (
                <a
                  className="community-launch-knowledge-source-action"
                  href={source.source_external_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${title}`}
                  title="Open"
                >
                  <ExternalLink size={12} strokeWidth={2.2} aria-hidden="true" />
                </a>
              ) : null}
              <button
                type="button"
                className="community-launch-knowledge-source-action is-delete"
                disabled={disabled || isRemoving || !canRemove}
                onClick={() => onRemove(source)}
                aria-label={`${isRemoving ? "Deleting" : "Delete"} ${title}`}
                title="Delete"
              >
                <Trash2 size={12} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="community-launch-knowledge-source-list-toggle"
        onClick={onToggleExpanded}
      >
        Show fewer
      </button>
    </>
  );
}

export type CommunityLaunchGitHubConnection = {
  connected: boolean;
  login?: string | null;
  email?: string | null;
  updated_at?: string | null;
};

export type CommunityLaunchGitHubRepository = {
  id: string;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  web_url?: string | null;
  default_branch: string;
  updated_at?: string | null;
  pushed_at?: string | null;
};

export type CommunityLaunchGitHubRepositoryListResult = {
  ok?: boolean;
  connection?: CommunityLaunchGitHubConnection | null;
  repositories?: CommunityLaunchGitHubRepository[];
};

export type CommunityLaunchGitHubFile = {
  id: string;
  repo_full_name: string;
  path: string;
  name: string;
  ref: string;
  sha?: string | null;
  size?: number | null;
  web_url?: string | null;
};

export type CommunityLaunchGitHubFileListResult = {
  ok?: boolean;
  connection?: CommunityLaunchGitHubConnection | null;
  repo_full_name?: string | null;
  ref?: string | null;
  truncated?: boolean;
  file_limit?: number | null;
  files?: CommunityLaunchGitHubFile[];
};

export type CommunityLaunchGitHubImportResult = {
  ok?: boolean;
  imported?: number;
  skipped?: number;
  failed?: number;
  failures?: Array<{
    id?: string;
    name?: string | null;
    message?: string | null;
  }>;
};

export type CommunityLaunchAgentSaveDraft = {
  systemPrompt: string;
  starterPrompts: string[];
};

export type CommunityLaunchAccessSaveDraft = {
  entryPolicy: "open" | "approval";
};

export type CommunityLaunchPublishSaveDraft = {
  visibility: "published" | "unlisted";
};

type WebCommunityLaunchSetupModalProps = {
  isOpen: boolean;
  mode?: "setup" | "create";
  initialStep?: CommunityLaunchSetupStep | null;
  knowledgeIntegrationReloadKey?: string | number | null;
  knowledgeAutoOpenProvider?: "google_drive" | "github" | null;
  knowledgeLinkSources?: CommunityLaunchKnowledgeImportedSource[];
  knowledgeFileSources?: CommunityLaunchKnowledgeImportedSource[];
  knowledgeGoogleDriveSources?: CommunityLaunchKnowledgeImportedSource[];
  knowledgeGitHubSources?: CommunityLaunchKnowledgeImportedSource[];
  community: CommunityLaunchSetupCommunity | null;
  status: CommunityLaunchSetupStatus | null;
  onClose: () => void;
  onStepChange?: (step: CommunityLaunchSetupStep) => void;
  onOpenStep: (step: CommunityLaunchSetupStep) => void;
  onCreateCommunity?: (draft: CommunityLaunchProfileSaveDraft) => Promise<void>;
  onSaveProfile: (draft: CommunityLaunchProfileSaveDraft) => Promise<void>;
  onSaveAbout: (draft: CommunityLaunchAboutSaveDraft) => Promise<void>;
  onAddKnowledgeLink: (
    draft: CommunityLaunchKnowledgeLinkSaveDraft,
  ) => Promise<void>;
  onAddKnowledgeFile?: (
    draft: CommunityLaunchKnowledgeFileSaveDraft,
  ) => Promise<void>;
  onLoadKnowledgeSources?: () => Promise<void>;
  onRemoveKnowledgeLinkSource?: (resourceId: string) => Promise<boolean | void>;
  onRemoveKnowledgeFileSource?: (resourceId: string) => Promise<boolean | void>;
  onIngestKnowledgeSources?: () => Promise<CommunityLaunchKnowledgeSourceIngestionResult | null>;
  onLoadKnowledgeGoogleDriveConnection?: () => Promise<CommunityLaunchGoogleDriveConnection | null>;
  onConnectKnowledgeGoogleDrive?: () => Promise<{ ok?: boolean; error_message?: string | null } | null>;
  onListKnowledgeGoogleDriveFiles?: (
    request?: CommunityLaunchGoogleDriveFileListRequest | null,
  ) => Promise<CommunityLaunchGoogleDriveFileListResult | null>;
  onImportKnowledgeGoogleDriveFiles?: (fileIds: string[]) => Promise<CommunityLaunchGoogleDriveImportResult | null>;
  onRemoveKnowledgeGoogleDriveSource?: (resourceId: string) => Promise<boolean | void>;
  onDisconnectKnowledgeGoogleDrive?: () => Promise<CommunityLaunchGoogleDriveConnection | null>;
  onKnowledgeAutoOpenHandled?: (provider: "google_drive" | "github") => void;
  onLoadKnowledgeGitHubConnection?: () => Promise<CommunityLaunchGitHubConnection | null>;
  onConnectKnowledgeGitHub?: () => Promise<{ ok?: boolean; error_message?: string | null } | null>;
  onListKnowledgeGitHubRepositories?: (query?: string | null) => Promise<CommunityLaunchGitHubRepositoryListResult | null>;
  onListKnowledgeGitHubFiles?: (
    repoFullName: string,
    ref?: string | null,
    query?: string | null,
  ) => Promise<CommunityLaunchGitHubFileListResult | null>;
  onImportKnowledgeGitHubFiles?: (fileIds: string[]) => Promise<CommunityLaunchGitHubImportResult | null>;
  onRemoveKnowledgeGitHubSource?: (resourceId: string) => Promise<boolean | void>;
  onDisconnectKnowledgeGitHub?: () => Promise<CommunityLaunchGitHubConnection | null>;
  onGenerateKnowledgePlan?: (draft: {
    builderIntent: string;
  }) => Promise<CommunityLaunchKnowledgePlanResult | null>;
  onApplyKnowledgePlan?: (draft: {
    proposal: CommunityWikiArchitectProposal;
  }) => Promise<CommunityLaunchKnowledgePlanApplyResult | null>;
  onDraftKnowledgeResources?: () => Promise<CommunityLaunchKnowledgeContentDraftResult | null>;
  onSaveAgent: (draft: CommunityLaunchAgentSaveDraft) => Promise<void>;
  onSaveAccess: (draft: CommunityLaunchAccessSaveDraft) => Promise<void>;
  onSavePublish: (draft: CommunityLaunchPublishSaveDraft) => Promise<void>;
};

const STEP_ORDER: CommunityLaunchSetupStep[] = [
  "profile",
  "about",
  "agent",
  "access",
  "knowledge",
  "publish",
];

const PUBLISHED_COMMUNITY_GLOBE_ICON = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const STEP_META: Record<
  CommunityLaunchSetupStep,
  {
    label: string;
    title: string;
    action: string;
    icon: ReactNode;
  }
> = {
  profile: {
    label: "Profile",
    title: "Shape the public identity",
    action: "Open profile",
    icon: <Image size={15} strokeWidth={2} aria-hidden="true" />,
  },
  about: {
    label: "About",
    title: "Write the about page",
    action: "Open about",
    icon: <FileText size={15} strokeWidth={2} aria-hidden="true" />,
  },
  agent: {
    label: "Agent",
    title: "Set the agent behavior",
    action: "Open agent",
    icon: <Bot size={15} strokeWidth={2} aria-hidden="true" />,
  },
  access: {
    label: "Access",
    title: "Choose access",
    action: "Open access",
    icon: <LockKeyhole size={15} strokeWidth={2} aria-hidden="true" />,
  },
  knowledge: {
    label: "Knowledge",
    title: "Collect source material",
    action: "Open resources",
    icon: <BookOpen size={15} strokeWidth={2} aria-hidden="true" />,
  },
  publish: {
    label: "Publish",
    title: "Publish the community",
    action: "Open publish",
    icon: PUBLISHED_COMMUNITY_GLOBE_ICON,
  },
};

function isStepComplete(
  status: CommunityLaunchSetupStatus,
  step: CommunityLaunchSetupStep,
): boolean {
  return Boolean(status.steps.find((item) => item.step === step)?.completed);
}

function normalizeActiveStep(
  status: CommunityLaunchSetupStatus | null,
): CommunityLaunchSetupStep {
  const current = status?.current_step;
  if (current && current !== "complete") return current;
  return "profile";
}

function getNextLaunchStep(
  step: CommunityLaunchSetupStep,
): CommunityLaunchSetupStep | null {
  const index = STEP_ORDER.indexOf(step);
  if (index < 0 || index >= STEP_ORDER.length - 1) return null;
  return STEP_ORDER[index + 1];
}

function getStarterPrompts(
  community: CommunityLaunchSetupCommunity | null,
): string[] {
  const prompts = Array.isArray(community?.agent_starter_prompts)
    ? community.agent_starter_prompts
    : [];
  return [0, 1, 2].map((index) => String(prompts[index] ?? "").trim());
}

function isPublishProfileMissing(
  missing: CommunityLaunchSetupMissing,
): boolean {
  return (
    missing === "community_name" ||
    missing === "community_one_liner" ||
    missing === "community_avatar" ||
    missing === "community_banner"
  );
}

function mergeCommunityLaunchGoogleDriveFiles(
  current: CommunityLaunchGoogleDriveFile[],
  next: CommunityLaunchGoogleDriveFile[],
): CommunityLaunchGoogleDriveFile[] {
  const rows = new Map<string, CommunityLaunchGoogleDriveFile>();
  [...current, ...next].forEach((file) => rows.set(file.id, file));
  return Array.from(rows.values());
}

function isImportableGoogleDriveSourceFile(file: CommunityLaunchGoogleDriveFile): boolean {
  return file.kind === "file" && file.importable === true;
}

function getGoogleDriveSourceFileTypeLabel(file: CommunityLaunchGoogleDriveFile): string {
  if (file.kind === "folder") return "Folder";
  return file.mime_type.replace("application/vnd.google-apps.", "Google ");
}

function sourceNeedsIntegrationReconnect(source: CommunityLaunchKnowledgeImportedSource): boolean {
  return source.credential_status === "missing" && source.source_ingestion_status !== "ready";
}

function getGitHubImportedSourceRepoName(source: CommunityLaunchKnowledgeImportedSource): string | null {
  const externalId = String(source.source_external_id ?? "").trim();
  const atIndex = externalId.indexOf("@");
  if (atIndex > 0) {
    const repoName = externalId.slice(0, atIndex).trim();
    if (repoName.includes("/")) return repoName;
  }
  const externalName = String(source.source_external_name ?? "").trim();
  const [owner, repo] = externalName.split("/");
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

function formatReconnectRequiredMessage(
  providerName: "Google Drive" | "GitHub",
  count: number,
): string {
  return `Reconnect required for ${count} queued ${providerName} source${count === 1 ? "" : "s"}.`;
}

function formatKnowledgeResourceLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function toNonNegativeInteger(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function countPendingKnowledgeIngestionSources(
  result: CommunityLaunchKnowledgeSourceIngestionResult | null | undefined,
): number {
  if (!result) return 0;
  if (typeof result.pending_sources === "number") return toNonNegativeInteger(result.pending_sources);
  return (
    toNonNegativeInteger(result.pending_url_sources) +
    toNonNegativeInteger(result.pending_file_sources) +
    toNonNegativeInteger(result.pending_google_drive_sources) +
    toNonNegativeInteger(result.pending_github_sources)
  );
}

function knowledgeIngestionCanContinue(
  result: CommunityLaunchKnowledgeSourceIngestionResult | null | undefined,
): boolean {
  return toNonNegativeInteger(result?.ready_sources) > 0 && countPendingKnowledgeIngestionSources(result) === 0;
}

function formatKnowledgeIngestionFailureMessage(message: unknown): string {
  const code = String(message ?? "").trim();
  if (
    code === "community_source_url_fetcher_failed_413" ||
    code === "community_source_url_too_large"
  ) {
    return "One source link was too large to read. Remove it or add that material as a file.";
  }
  if (code === "community_source_url_no_readable_content") {
    return "One source link did not contain readable text. Remove it or add another source.";
  }
  if (
    code === "community_source_crawl_failed" ||
    code === "community_source_crawl_no_usable_sources" ||
    code === "community_source_crawl4ai_no_results"
  ) {
    return "One source link could not be crawled. Remove it, try again, or add that material as a file.";
  }
  if (code === "community_source_crawl_status_unavailable") {
    return "Source crawling took too long. Try again in a moment.";
  }
  if (
    code === "community_source_crawl4ai_not_configured" ||
    code === "community_source_crawler_not_configured" ||
    code === "community_source_full_site_crawl_not_configured"
  ) {
    return "Full site crawling is not configured yet.";
  }
  if (code === "community_source_crawler_provider_invalid") {
    return "Source crawling is misconfigured.";
  }
  if (code === "community_source_pdf_ingestion_not_supported") {
    return "PDF links are not readable yet. Upload a text export or add another source.";
  }
  if (code.startsWith("community_source_url_fetcher_failed_")) {
    return "One source link could not be read. Remove it or try another source.";
  }
  return code || "Could not read source material yet.";
}

function formatKnowledgeIngestionResultError(
  result: CommunityLaunchKnowledgeSourceIngestionResult | null | undefined,
): string {
  const firstFailure = result?.failures?.[0];
  return formatKnowledgeIngestionFailureMessage(
    firstFailure?.message || result?.message || "Could not read source material yet.",
  );
}

function formatKnowledgeIngestionPartialWarning(
  result: CommunityLaunchKnowledgeSourceIngestionResult | null | undefined,
): string | null {
  const failed = toNonNegativeInteger(result?.failed);
  if (failed <= 0) return null;
  return `${failed} source${failed === 1 ? "" : "s"} could not be read.`;
}

function formatKnowledgeArchitectureQualityWarning(
  quality: CommunityLaunchKnowledgePlanApplyResult["architecture_quality"],
): string | null {
  const warnings = Array.isArray(quality?.warnings) ? quality.warnings : [];
  if (quality?.ok === false || warnings.length > 0) {
    return "Resources drafted, but organization needs review.";
  }
  return null;
}

function getKnowledgeAssemblyStepStatus(args: {
  currentStage: KnowledgeAssemblyStage;
  failedStage: KnowledgeAssemblyWorkStage | null;
  stepStage: KnowledgeAssemblyWorkStage;
}): KnowledgeAssemblyStepStatus {
  if (args.failedStage === args.stepStage) return "failed";
  if (args.currentStage === "failed") {
    if (!args.failedStage) return "pending";
    const failedIndex = KNOWLEDGE_ASSEMBLY_STEPS.findIndex(
      (step) => step.stage === args.failedStage,
    );
    const stepIndex = KNOWLEDGE_ASSEMBLY_STEPS.findIndex(
      (step) => step.stage === args.stepStage,
    );
    return stepIndex < failedIndex ? "complete" : "pending";
  }
  if (args.currentStage === "idle") return "pending";
  const currentIndex = KNOWLEDGE_ASSEMBLY_STEPS.findIndex(
    (step) => step.stage === args.currentStage,
  );
  const stepIndex = KNOWLEDGE_ASSEMBLY_STEPS.findIndex(
    (step) => step.stage === args.stepStage,
  );
  if (stepIndex < currentIndex) return "complete";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

export function WebCommunityLaunchSetupModal(
  props: WebCommunityLaunchSetupModalProps,
) {
  const {
    isOpen,
    mode = "setup",
    initialStep = null,
    knowledgeIntegrationReloadKey = null,
    knowledgeAutoOpenProvider = null,
    knowledgeLinkSources = [],
    knowledgeFileSources = [],
    knowledgeGoogleDriveSources = [],
    knowledgeGitHubSources = [],
    community,
    status,
    onClose,
    onStepChange,
    onOpenStep,
    onCreateCommunity,
    onSaveProfile,
    onSaveAbout,
    onAddKnowledgeLink,
    onAddKnowledgeFile,
    onLoadKnowledgeSources,
    onRemoveKnowledgeLinkSource,
    onRemoveKnowledgeFileSource,
    onIngestKnowledgeSources,
    onLoadKnowledgeGoogleDriveConnection,
    onConnectKnowledgeGoogleDrive,
    onListKnowledgeGoogleDriveFiles,
    onImportKnowledgeGoogleDriveFiles,
    onRemoveKnowledgeGoogleDriveSource,
    onDisconnectKnowledgeGoogleDrive,
    onKnowledgeAutoOpenHandled,
    onLoadKnowledgeGitHubConnection,
    onConnectKnowledgeGitHub,
    onListKnowledgeGitHubRepositories,
    onListKnowledgeGitHubFiles,
    onImportKnowledgeGitHubFiles,
    onRemoveKnowledgeGitHubSource,
    onDisconnectKnowledgeGitHub,
    onGenerateKnowledgePlan,
    onApplyKnowledgePlan,
    onDraftKnowledgeResources,
    onSaveAgent,
    onSaveAccess,
    onSavePublish,
  } = props;
  const isCreateMode = mode === "create";
  const requestedInitialStep = initialStep && STEP_ORDER.includes(initialStep)
    ? initialStep
    : null;
  const [activeStep, setActiveStep] = useState<CommunityLaunchSetupStep>(() =>
    normalizeActiveStep(status),
  );
  const [stepOverride, setStepOverride] =
    useState<CommunityLaunchSetupStep | null>(null);
  const [savingStep, setSavingStep] = useState<CommunityLaunchSetupStep | null>(
    null,
  );
  const [stepError, setStepError] = useState<string | null>(null);
  const [stepSuccess, setStepSuccess] = useState<string | null>(null);
  const [profileMediaError, setProfileMediaError] = useState<string | null>(
    null,
  );
  const [profileAvatarFileName, setProfileAvatarFileName] = useState("");
  const [profileBannerFileName, setProfileBannerFileName] = useState("");
  const [processingProfileMedia, setProcessingProfileMedia] = useState<
    "avatar" | "banner" | null
  >(null);
  const [profileAvatarDragOver, setProfileAvatarDragOver] = useState(false);
  const [profileBannerDragOver, setProfileBannerDragOver] = useState(false);
  const [profileSlugEdited, setProfileSlugEdited] = useState(false);
  const [profileDraft, setProfileDraft] =
    useState<CommunityLaunchProfileSaveDraft>({
      name: "",
      slug: "",
      oneLiner: "",
      avatarUrl: "",
      bannerUrl: "",
    });
  const [aboutDraft, setAboutDraft] = useState("");
  const [knowledgeLinkDrafts, setKnowledgeLinkDrafts] = useState<string[]>([
    "",
  ]);
  const [knowledgeSourceDragOver, setKnowledgeSourceDragOver] = useState(false);
  const [knowledgeFileSourcesExpanded, setKnowledgeFileSourcesExpanded] = useState(false);
  const [knowledgeLinkSourcesExpanded, setKnowledgeLinkSourcesExpanded] = useState(false);
  const [knowledgeDriveSourcesExpanded, setKnowledgeDriveSourcesExpanded] = useState(false);
  const [knowledgeGitHubSourcesExpanded, setKnowledgeGitHubSourcesExpanded] = useState(false);
  const [knowledgeDriveConnection, setKnowledgeDriveConnection] =
    useState<CommunityLaunchGoogleDriveConnection | null>(null);
  const [knowledgeDriveBrowserOpen, setKnowledgeDriveBrowserOpen] = useState(false);
  const [knowledgeDriveFiles, setKnowledgeDriveFiles] = useState<CommunityLaunchGoogleDriveFile[]>([]);
  const [knowledgeDriveSelectedIds, setKnowledgeDriveSelectedIds] = useState<string[]>([]);
  const [knowledgeDriveSearchDraft, setKnowledgeDriveSearchDraft] = useState("");
  const [knowledgeDriveQuery, setKnowledgeDriveQuery] = useState("");
  const [knowledgeDriveFolderTrail, setKnowledgeDriveFolderTrail] = useState<Array<{ id: string; name: string }>>([]);
  const [knowledgeDriveNextPageToken, setKnowledgeDriveNextPageToken] = useState<string | null>(null);
  const [knowledgeDriveConnectionLoading, setKnowledgeDriveConnectionLoading] = useState(false);
  const [knowledgeDriveFilesLoading, setKnowledgeDriveFilesLoading] = useState(false);
  const [knowledgeDriveDisconnecting, setKnowledgeDriveDisconnecting] = useState(false);
  const [knowledgeRemovingSourceId, setKnowledgeRemovingSourceId] = useState<string | null>(null);
  const [knowledgeGitHubConnection, setKnowledgeGitHubConnection] =
    useState<CommunityLaunchGitHubConnection | null>(null);
  const [knowledgeGitHubRepositories, setKnowledgeGitHubRepositories] = useState<CommunityLaunchGitHubRepository[]>([]);
  const [knowledgeGitHubSelectedRepository, setKnowledgeGitHubSelectedRepository] =
    useState<CommunityLaunchGitHubRepository | null>(null);
  const [knowledgeGitHubFiles, setKnowledgeGitHubFiles] = useState<CommunityLaunchGitHubFile[]>([]);
  const [knowledgeGitHubFilesTruncated, setKnowledgeGitHubFilesTruncated] = useState(false);
  const [knowledgeGitHubFileLimit, setKnowledgeGitHubFileLimit] = useState(COMMUNITY_LAUNCH_GITHUB_FILE_LIST_LIMIT);
  const [knowledgeGitHubSelectedIds, setKnowledgeGitHubSelectedIds] = useState<string[]>([]);
  const [knowledgeGitHubConnectionLoading, setKnowledgeGitHubConnectionLoading] = useState(false);
  const [knowledgeGitHubRepositoriesLoading, setKnowledgeGitHubRepositoriesLoading] = useState(false);
  const [knowledgeGitHubFilesLoading, setKnowledgeGitHubFilesLoading] = useState(false);
  const [knowledgeGitHubDisconnecting, setKnowledgeGitHubDisconnecting] = useState(false);
  const [knowledgeHealthLoading, setKnowledgeHealthLoading] = useState(false);
  const [knowledgeView, setKnowledgeView] = useState<KnowledgeView>("collect");
  const [knowledgeAssemblyStage, setKnowledgeAssemblyStage] =
    useState<KnowledgeAssemblyStage>("idle");
  const [knowledgeAssemblyFailedStage, setKnowledgeAssemblyFailedStage] =
    useState<KnowledgeAssemblyWorkStage | null>(null);
  const knowledgeProviderStateCommunityKeyRef = useRef<string | null>(null);
  const [agentDraft, setAgentDraft] = useState<CommunityLaunchAgentSaveDraft>({
    systemPrompt: "",
    starterPrompts: ["", "", ""],
  });
  const [accessDraft, setAccessDraft] = useState<CommunityEntryPolicy>("open");
  const effectiveKnowledgeLinkSources = isCreateMode
    ? EMPTY_COMMUNITY_LAUNCH_IMPORTED_SOURCES
    : knowledgeLinkSources;
  const effectiveKnowledgeFileSources = isCreateMode
    ? EMPTY_COMMUNITY_LAUNCH_IMPORTED_SOURCES
    : knowledgeFileSources;
  const effectiveKnowledgeGoogleDriveSources = isCreateMode
    ? EMPTY_COMMUNITY_LAUNCH_IMPORTED_SOURCES
    : knowledgeGoogleDriveSources;
  const effectiveKnowledgeGitHubSources = isCreateMode
    ? EMPTY_COMMUNITY_LAUNCH_IMPORTED_SOURCES
    : knowledgeGitHubSources;
  const knowledgeDriveMissingCredentialSources = useMemo(
    () => effectiveKnowledgeGoogleDriveSources.filter(sourceNeedsIntegrationReconnect),
    [effectiveKnowledgeGoogleDriveSources],
  );
  const knowledgeGitHubMissingCredentialSources = useMemo(
    () => effectiveKnowledgeGitHubSources.filter(sourceNeedsIntegrationReconnect),
    [effectiveKnowledgeGitHubSources],
  );
  const knowledgeMissingCredentialProviderNames = useMemo(() => {
    const names: Array<"Google Drive" | "GitHub"> = [];
    if (knowledgeDriveMissingCredentialSources.length > 0) names.push("Google Drive");
    if (knowledgeGitHubMissingCredentialSources.length > 0) names.push("GitHub");
    return names;
  }, [knowledgeDriveMissingCredentialSources.length, knowledgeGitHubMissingCredentialSources.length]);
  const knowledgeMissingCredentialMessage = useMemo(() => {
    if (knowledgeMissingCredentialProviderNames.length === 0) return null;
    const providerText =
      knowledgeMissingCredentialProviderNames.length === 1
        ? knowledgeMissingCredentialProviderNames[0]
        : `${knowledgeMissingCredentialProviderNames.slice(0, -1).join(", ")} and ${
            knowledgeMissingCredentialProviderNames[knowledgeMissingCredentialProviderNames.length - 1]
          }`;
    return `Reconnect ${providerText} or remove queued sources before continuing.`;
  }, [knowledgeMissingCredentialProviderNames]);
  const knowledgeDriveImportedExternalIds = useMemo(() => {
    return new Set(
      effectiveKnowledgeGoogleDriveSources
        .map((source) => String(source.source_external_id ?? "").trim())
        .filter(Boolean),
    );
  }, [effectiveKnowledgeGoogleDriveSources]);
  const knowledgeGitHubImportedExternalIds = useMemo(() => {
    return new Set(
      effectiveKnowledgeGitHubSources
        .map((source) => String(source.source_external_id ?? "").trim())
        .filter(Boolean),
    );
  }, [effectiveKnowledgeGitHubSources]);
  const knowledgeGitHubImportedRepoCounts = useMemo(() => {
    const counts = new Map<string, number>();
    effectiveKnowledgeGitHubSources.forEach((source) => {
      const repoName = getGitHubImportedSourceRepoName(source);
      if (!repoName) return;
      counts.set(repoName, (counts.get(repoName) ?? 0) + 1);
    });
    return counts;
  }, [effectiveKnowledgeGitHubSources]);
  const knowledgeGitHubSelectableFileIds = useMemo(
    () =>
      knowledgeGitHubFiles
        .map((file) => file.id)
        .filter((id) => !knowledgeGitHubImportedExternalIds.has(id))
        .slice(0, COMMUNITY_LAUNCH_MAX_GITHUB_FILES),
    [knowledgeGitHubFiles, knowledgeGitHubImportedExternalIds],
  );
  const knowledgeGitHubSelectedIdSet = useMemo(
    () => new Set(knowledgeGitHubSelectedIds),
    [knowledgeGitHubSelectedIds],
  );
  const knowledgeGitHubAllSelectableFilesSelected =
    knowledgeGitHubSelectableFileIds.length > 0 &&
    knowledgeGitHubSelectableFileIds.every((id) => knowledgeGitHubSelectedIdSet.has(id));
  const knowledgeGitHubSelectionAtLimit = knowledgeGitHubSelectedIds.length >= COMMUNITY_LAUNCH_MAX_GITHUB_FILES;
  const onLoadKnowledgeGoogleDriveConnectionRef = useRef(onLoadKnowledgeGoogleDriveConnection);
  const onLoadKnowledgeGitHubConnectionRef = useRef(onLoadKnowledgeGitHubConnection);
  const onLoadKnowledgeSourcesRef = useRef(onLoadKnowledgeSources);

  useEffect(() => {
    onLoadKnowledgeGoogleDriveConnectionRef.current = onLoadKnowledgeGoogleDriveConnection;
  }, [onLoadKnowledgeGoogleDriveConnection]);

  useEffect(() => {
    onLoadKnowledgeGitHubConnectionRef.current = onLoadKnowledgeGitHubConnection;
  }, [onLoadKnowledgeGitHubConnection]);

  useEffect(() => {
    onLoadKnowledgeSourcesRef.current = onLoadKnowledgeSources;
  }, [onLoadKnowledgeSources]);

  useEffect(() => {
    if (!isOpen) return;
    setStepOverride(requestedInitialStep);
    setActiveStep(requestedInitialStep ?? (isCreateMode ? "profile" : normalizeActiveStep(status)));
  }, [community?.id, isCreateMode, isOpen, requestedInitialStep]);

  useEffect(() => {
    if (!isOpen || stepOverride || requestedInitialStep) return;
    setActiveStep(isCreateMode ? "profile" : normalizeActiveStep(status));
  }, [isCreateMode, isOpen, requestedInitialStep, status?.current_step, stepOverride]);

  useEffect(() => {
    if (!isOpen) return;
    if (isCreateMode) {
      setProfileDraft({
        name: "",
        slug: "",
        oneLiner: "",
        avatarUrl: "",
        bannerUrl: "",
      });
      setAboutDraft("");
      setKnowledgeLinkDrafts([""]);
      setKnowledgeSourceDragOver(false);
      setKnowledgeFileSourcesExpanded(false);
      setKnowledgeLinkSourcesExpanded(false);
      setKnowledgeDriveSourcesExpanded(false);
      setKnowledgeGitHubSourcesExpanded(false);
      setKnowledgeDriveConnection(null);
      setKnowledgeDriveBrowserOpen(false);
      setKnowledgeDriveFiles([]);
      setKnowledgeDriveSelectedIds([]);
      setKnowledgeDriveSearchDraft("");
      setKnowledgeDriveQuery("");
      setKnowledgeDriveFolderTrail([]);
      setKnowledgeDriveNextPageToken(null);
      setKnowledgeDriveConnectionLoading(false);
      setKnowledgeDriveFilesLoading(false);
      setKnowledgeDriveDisconnecting(false);
      setKnowledgeRemovingSourceId(null);
      setKnowledgeGitHubConnection(null);
      setKnowledgeGitHubRepositories([]);
      setKnowledgeGitHubSelectedRepository(null);
      setKnowledgeGitHubFiles([]);
      setKnowledgeGitHubSelectedIds([]);
      setKnowledgeGitHubConnectionLoading(false);
      setKnowledgeGitHubRepositoriesLoading(false);
      setKnowledgeGitHubFilesLoading(false);
      setKnowledgeGitHubDisconnecting(false);
      setKnowledgeHealthLoading(false);
      setKnowledgeView("collect");
      setKnowledgeAssemblyStage("idle");
      setKnowledgeAssemblyFailedStage(null);
      knowledgeProviderStateCommunityKeyRef.current = "__create__";
      setAgentDraft({
        systemPrompt: "",
        starterPrompts: ["", "", ""],
      });
      setAccessDraft("approval");
      setStepError(null);
      setStepSuccess(null);
      setProfileMediaError(null);
      setProfileAvatarFileName("");
      setProfileBannerFileName("");
      setProcessingProfileMedia(null);
      setProfileAvatarDragOver(false);
      setProfileBannerDragOver(false);
      setProfileSlugEdited(false);
      return;
    }
    if (!community) return;
    setProfileDraft({
      name: community.name ?? "",
      slug: community.slug ?? "",
      oneLiner: community.one_liner ?? "",
      avatarUrl: community.avatar_url ?? "",
      bannerUrl: community.banner_url ?? "",
    });
    setAboutDraft(community.about ?? "");
    setKnowledgeLinkDrafts([""]);
    setKnowledgeSourceDragOver(false);
    setKnowledgeFileSourcesExpanded(false);
    setKnowledgeLinkSourcesExpanded(false);
    setKnowledgeDriveSourcesExpanded(false);
    setKnowledgeGitHubSourcesExpanded(false);
    const nextKnowledgeProviderStateCommunityKey = String(community.id ?? "").trim() || null;
    if (knowledgeProviderStateCommunityKeyRef.current !== nextKnowledgeProviderStateCommunityKey) {
      knowledgeProviderStateCommunityKeyRef.current = nextKnowledgeProviderStateCommunityKey;
      setKnowledgeDriveConnection(null);
      setKnowledgeDriveBrowserOpen(false);
      setKnowledgeDriveFiles([]);
      setKnowledgeDriveSelectedIds([]);
      setKnowledgeDriveSearchDraft("");
      setKnowledgeDriveQuery("");
      setKnowledgeDriveFolderTrail([]);
      setKnowledgeDriveNextPageToken(null);
      setKnowledgeDriveConnectionLoading(false);
      setKnowledgeDriveFilesLoading(false);
      setKnowledgeDriveDisconnecting(false);
      setKnowledgeRemovingSourceId(null);
      setKnowledgeGitHubConnection(null);
      setKnowledgeGitHubRepositories([]);
      setKnowledgeGitHubSelectedRepository(null);
      setKnowledgeGitHubFiles([]);
      setKnowledgeGitHubSelectedIds([]);
      setKnowledgeGitHubConnectionLoading(false);
      setKnowledgeGitHubRepositoriesLoading(false);
      setKnowledgeGitHubFilesLoading(false);
      setKnowledgeGitHubDisconnecting(false);
    }
    setKnowledgeHealthLoading(false);
    setKnowledgeView("collect");
    setKnowledgeAssemblyStage("idle");
    setKnowledgeAssemblyFailedStage(null);
    setAgentDraft({
      systemPrompt: community.agent_system_prompt ?? "",
      starterPrompts: getStarterPrompts(community),
    });
    setAccessDraft(community.entry_policy ?? "open");
    setStepError(null);
    setStepSuccess(null);
    setProfileMediaError(null);
    setProfileAvatarFileName("");
    setProfileBannerFileName("");
    setProcessingProfileMedia(null);
    setProfileAvatarDragOver(false);
    setProfileBannerDragOver(false);
    setProfileSlugEdited(false);
  }, [
    isOpen,
    isCreateMode,
    community?.id,
    community?.name,
    community?.slug,
    community?.one_liner,
    community?.about,
    community?.avatar_url,
    community?.banner_url,
    community?.entry_policy,
    community?.agent_system_prompt,
    community?.agent_starter_prompts,
  ]);

  useEffect(() => {
    const loadConnection = onLoadKnowledgeGoogleDriveConnectionRef.current;
    if (!isOpen || activeStep !== "knowledge" || !loadConnection) return;
    let cancelled = false;
    void loadConnection()
      .then((connection) => {
        if (!cancelled) setKnowledgeDriveConnection(connection ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeStep, community?.id, isOpen, knowledgeIntegrationReloadKey]);

  useEffect(() => {
    const loadSources = onLoadKnowledgeSourcesRef.current;
    if (!isOpen || isCreateMode || activeStep !== "knowledge" || !community?.id || !loadSources) return;
    void loadSources().catch(() => {});
  }, [activeStep, community?.id, isCreateMode, isOpen, knowledgeIntegrationReloadKey]);

  useEffect(() => {
    const loadConnection = onLoadKnowledgeGitHubConnectionRef.current;
    if (!isOpen || activeStep !== "knowledge" || !loadConnection) return;
    let cancelled = false;
    void loadConnection()
      .then((connection) => {
        if (!cancelled) setKnowledgeGitHubConnection(connection ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeStep, community?.id, isOpen, knowledgeIntegrationReloadKey]);

  const createModeStatus = useMemo(
    () =>
      buildCommunityLaunchSetupStatus({
        name: profileDraft.name,
        oneLiner: profileDraft.oneLiner,
        avatarUrl: profileDraft.avatarUrl,
        bannerUrl: profileDraft.bannerUrl,
        about: null,
        hasKnowledgeMaterial: false,
        hasLiveKnowledge: false,
        hasAgentConfig: false,
        entryPolicy: null,
        visibility: "unlisted",
      }),
    [
      profileDraft.avatarUrl,
      profileDraft.bannerUrl,
      profileDraft.name,
      profileDraft.oneLiner,
    ],
  );
  const effectiveStatus = isCreateMode ? createModeStatus : status;
  const effectiveCommunity: CommunityLaunchSetupCommunity | null = isCreateMode
    ? {
        id: "__new_community__",
        slug: profileDraft.slug,
        name: profileDraft.name.trim() || "New community",
        one_liner: profileDraft.oneLiner.trim() || null,
        about: null,
        avatar_url: profileDraft.avatarUrl || null,
        avatar_focus_x: 0.5,
        avatar_focus_y: 0.5,
        avatar_zoom: 1,
        banner_url: profileDraft.bannerUrl || null,
        banner_focus_x: 0.5,
        banner_focus_y: 0.5,
        banner_zoom: 1,
        visibility: "unlisted",
        entry_policy: "approval",
      }
    : community;

  const progress = Math.max(0, Math.min(100, effectiveStatus?.percent ?? 0));
  const progressCircumference = 2 * Math.PI * 17;
  const progressDashOffset =
    progressCircumference - (progress / 100) * progressCircumference;
  const activeMeta = STEP_META[activeStep];
  const activeTitle = activeMeta.title;
  const activeStatus =
    effectiveStatus?.steps.find((step) => step.step === activeStep) ?? null;
  const activeComplete = Boolean(activeStatus?.completed);
  const missingCount = activeStatus?.missing.length ?? 0;
  const publishMissing =
    effectiveStatus?.missing.filter(isPublishProfileMissing) ?? [];
  const isSavingActiveStep = savingStep === activeStep;
  const stepSummary = useMemo(() => {
    if (!activeStatus) return "Not loaded yet.";
    if (activeStatus.completed) return "Complete";
    if (missingCount === 1) return "1 item left";
    return `${missingCount} items left`;
  }, [activeStatus, missingCount]);

  const loadGoogleDriveFiles = useCallback(async (options?: {
    append?: boolean;
    folderId?: string | null;
    folderTrail?: Array<{ id: string; name: string }>;
    pageToken?: string | null;
    query?: string | null;
  }): Promise<boolean> => {
    if (!onListKnowledgeGoogleDriveFiles) {
      setStepError("Google Drive file selection is unavailable.");
      return false;
    }
    const append = options?.append === true;
    const folderTrail = options?.folderTrail ?? knowledgeDriveFolderTrail;
    const query = String(options?.query ?? knowledgeDriveQuery ?? "").trim();
    const folderId = query
      ? null
      : options?.folderId !== undefined
        ? options.folderId
        : folderTrail[folderTrail.length - 1]?.id ?? null;
    const pageToken = String(options?.pageToken ?? "").trim() || null;
    setKnowledgeDriveBrowserOpen(true);
    setKnowledgeDriveFilesLoading(true);
    try {
      const result = await onListKnowledgeGoogleDriveFiles({
        folderId,
        pageToken,
        query,
      });
      if (!result?.ok) throw new Error("Could not load Google Drive files.");
      setKnowledgeDriveConnection(result.connection ?? knowledgeDriveConnection);
      setKnowledgeDriveFiles((current) =>
        append
          ? mergeCommunityLaunchGoogleDriveFiles(current, result.files ?? [])
          : result.files ?? [],
      );
      setKnowledgeDriveQuery(result.query ?? query);
      setKnowledgeDriveFolderTrail(query ? [] : folderTrail);
      setKnowledgeDriveNextPageToken(result.next_page_token ?? null);
      if (append) {
        setStepSuccess("More Drive items loaded.");
      } else {
        setStepSuccess(
          (result.files ?? []).length > 0
            ? "Choose Drive files or open folders."
            : query
              ? "No matching Drive files or folders found."
              : "This Drive folder has no readable files or folders.",
        );
      }
      return true;
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Could not load Google Drive files.");
      return false;
    } finally {
      setKnowledgeDriveFilesLoading(false);
    }
  }, [
    knowledgeDriveConnection,
    knowledgeDriveFolderTrail,
    knowledgeDriveQuery,
    onListKnowledgeGoogleDriveFiles,
  ]);

  const loadGitHubRepositories = useCallback(async (): Promise<boolean> => {
    if (!onListKnowledgeGitHubRepositories) {
      setStepError("GitHub repository selection is unavailable.");
      return false;
    }
    setKnowledgeGitHubRepositoriesLoading(true);
    try {
      const result = await onListKnowledgeGitHubRepositories();
      if (!result?.ok) throw new Error("Could not load GitHub repositories.");
      setKnowledgeGitHubConnection(result.connection ?? knowledgeGitHubConnection);
      setKnowledgeGitHubRepositories(result.repositories ?? []);
      setKnowledgeGitHubSelectedRepository(null);
      setKnowledgeGitHubFiles([]);
      setStepSuccess(
        (result.repositories ?? []).length > 0
          ? "Select a GitHub repository."
          : "No GitHub repositories found.",
      );
      return true;
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Could not load GitHub repositories.");
      return false;
    } finally {
      setKnowledgeGitHubRepositoriesLoading(false);
    }
  }, [
    knowledgeGitHubConnection,
    onListKnowledgeGitHubRepositories,
  ]);

  useEffect(() => {
    if (
      !isOpen ||
      activeStep !== "knowledge" ||
      knowledgeAutoOpenProvider !== "google_drive" ||
      !knowledgeDriveConnection?.connected ||
      knowledgeDriveFilesLoading
    ) {
      return;
    }
    onKnowledgeAutoOpenHandled?.("google_drive");
    void loadGoogleDriveFiles();
  }, [
    activeStep,
    isOpen,
    knowledgeAutoOpenProvider,
    knowledgeDriveConnection?.connected,
    knowledgeDriveFilesLoading,
    loadGoogleDriveFiles,
    onKnowledgeAutoOpenHandled,
  ]);

  useEffect(() => {
    if (
      !isOpen ||
      activeStep !== "knowledge" ||
      knowledgeAutoOpenProvider !== "github" ||
      !knowledgeGitHubConnection?.connected ||
      knowledgeGitHubRepositoriesLoading ||
      knowledgeGitHubFilesLoading
    ) {
      return;
    }
    onKnowledgeAutoOpenHandled?.("github");
    void loadGitHubRepositories();
  }, [
    activeStep,
    isOpen,
    knowledgeAutoOpenProvider,
    knowledgeGitHubConnection?.connected,
    knowledgeGitHubFilesLoading,
    knowledgeGitHubRepositoriesLoading,
    loadGitHubRepositories,
    onKnowledgeAutoOpenHandled,
  ]);

  const knowledgeDriveVisibleImportableCount =
    knowledgeDriveFiles.filter(isImportableGoogleDriveSourceFile).length;
  const knowledgeDriveCurrentFolder =
    knowledgeDriveFolderTrail[knowledgeDriveFolderTrail.length - 1] ?? null;
  const knowledgeDriveLocationPath = knowledgeDriveQuery
    ? `Search: ${knowledgeDriveQuery}`
    : knowledgeDriveFolderTrail.length > 0
      ? ["Google Drive", ...knowledgeDriveFolderTrail.map((folder) => folder.name)].join(" / ")
      : "Google Drive";

  useEffect(() => {
    if (knowledgeDriveImportedExternalIds.size === 0) return;
    setKnowledgeDriveSelectedIds((ids) =>
      ids.filter((id) => !knowledgeDriveImportedExternalIds.has(id)),
    );
  }, [knowledgeDriveImportedExternalIds]);

  useEffect(() => {
    if (knowledgeGitHubImportedExternalIds.size === 0) return;
    setKnowledgeGitHubSelectedIds((ids) =>
      ids.filter((id) => !knowledgeGitHubImportedExternalIds.has(id)),
    );
  }, [knowledgeGitHubImportedExternalIds]);

  if (!isOpen || !effectiveCommunity || !effectiveStatus) return null;

  const runStepSave = async (
    step: CommunityLaunchSetupStep,
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    if (savingStep) return;
    setSavingStep(step);
    setStepError(null);
    setStepSuccess(null);
    try {
      await action();
      const nextStep = getNextLaunchStep(step);
      if (nextStep) {
        setStepOverride(nextStep);
        setActiveStep(nextStep);
        onStepChange?.(nextStep);
        setStepSuccess(null);
      } else {
        setStepSuccess(successMessage);
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save.";
      setStepError(message);
    } finally {
      setSavingStep(null);
    }
  };

  const renderFinishLaterButton = (disabled = false) => (
    <button
      type="button"
      className="polynet-onboarding-back"
      disabled={disabled}
      onClick={onClose}
    >
      {isCreateMode ? "Cancel" : "Finish later"}
    </button>
  );

  const handleProfileImageDrop = (
    kind: "avatar" | "banner",
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (kind === "avatar") {
      setProfileAvatarDragOver(false);
    } else {
      setProfileBannerDragOver(false);
    }
    const file = event.dataTransfer.files?.[0] ?? null;
    void readProfileImage(kind, file);
  };

  const handleSaveProfile = (event: FormEvent) => {
    event.preventDefault();
    if (isCreateMode) {
      if (!onCreateCommunity) {
        setStepError("Community creation is unavailable.");
        return;
      }
      if (savingStep) return;
      setSavingStep("profile");
      setStepError(null);
      setStepSuccess(null);
      void onCreateCommunity(profileDraft)
        .catch((error) => {
          const message =
            typeof error === "string"
              ? error
              : error instanceof Error
                ? error.message
                : "Failed to create community.";
          setStepError(message);
        })
        .finally(() => {
          setSavingStep(null);
        });
      return;
    }
    void runStepSave(
      "profile",
      () => onSaveProfile(profileDraft),
      "Profile saved.",
    );
  };

  const handleSaveAbout = (event: FormEvent) => {
    event.preventDefault();
    void runStepSave(
      "about",
      () => onSaveAbout({ about: aboutDraft }),
      "About saved.",
    );
  };

  const saveKnowledgeLinkDrafts = async (
    successMessage = "Links added.",
  ): Promise<boolean> => {
    const urls = knowledgeLinkDrafts.map((url) => url.trim()).filter(Boolean);
    if (urls.length === 0) return true;
    if (savingStep) return false;
    setSavingStep("knowledge");
    setStepError(null);
    setStepSuccess(null);
    try {
      await onAddKnowledgeLink({ urls });
      setKnowledgeLinkDrafts([""]);
      if (successMessage) setStepSuccess(successMessage);
      return true;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to add links.";
      setStepError(message);
      return false;
    } finally {
      setSavingStep(null);
      setKnowledgeSourceDragOver(false);
    }
  };

  const handleAddKnowledgeLink = (event: FormEvent) => {
    event.preventDefault();
    void saveKnowledgeLinkDrafts();
  };

  const saveKnowledgeFiles = async (files: File[]): Promise<boolean> => {
    const sourceFiles = files.filter((file) => file.size > 0).slice(0, 5);
    if (sourceFiles.length === 0) return true;
    if (savingStep) return false;
    if (!onAddKnowledgeFile) {
      setStepError("File upload is unavailable.");
      return false;
    }
    setSavingStep("knowledge");
    setStepError(null);
    setStepSuccess(null);
    try {
      await onAddKnowledgeFile({ files: sourceFiles });
      setStepSuccess("Files added.");
      return true;
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Failed to add files.");
      return false;
    } finally {
      setSavingStep(null);
      setKnowledgeSourceDragOver(false);
    }
  };

  const handleKnowledgeFileInput = (files: FileList | null) => {
    if (!files) return;
    void saveKnowledgeFiles(Array.from(files));
  };

  const handleKnowledgeFileDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setKnowledgeSourceDragOver(false);
    void saveKnowledgeFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const handleGoogleDrivePrimaryAction = () => {
    if (savingStep || knowledgeDriveConnectionLoading || knowledgeDriveFilesLoading) return;
    setStepError(null);
    setStepSuccess(null);
    void (async () => {
      if (!knowledgeDriveConnection?.connected) {
        if (!onConnectKnowledgeGoogleDrive) {
          setStepError("Google Drive connection is unavailable.");
          return;
        }
        setKnowledgeDriveConnectionLoading(true);
        try {
          const result = await onConnectKnowledgeGoogleDrive();
          if (!result?.ok) {
            setStepError(result?.error_message || "Could not start Google Drive connection.");
          }
        } catch (error) {
          setStepError(error instanceof Error ? error.message : "Could not start Google Drive connection.");
        } finally {
          setKnowledgeDriveConnectionLoading(false);
        }
        return;
      }
      await loadGoogleDriveFiles();
    })();
  };

  const handleDisconnectGoogleDrive = () => {
    if (savingStep || knowledgeDriveDisconnecting || !knowledgeDriveConnection?.connected) return;
    if (!onDisconnectKnowledgeGoogleDrive) {
      setStepError("Google Drive disconnect is unavailable.");
      return;
    }
    const shouldDisconnect = window.confirm(
      "Disconnect Google Drive? Imported sources stay saved, but queued Drive sources may need you to reconnect before processing.",
    );
    if (!shouldDisconnect) return;
    setKnowledgeDriveDisconnecting(true);
    setStepError(null);
    setStepSuccess(null);
    void onDisconnectKnowledgeGoogleDrive()
      .then((connection) => {
        setKnowledgeDriveConnection(connection ?? { connected: false });
        setKnowledgeDriveBrowserOpen(false);
        setKnowledgeDriveFiles([]);
        setKnowledgeDriveSelectedIds([]);
        setKnowledgeDriveSearchDraft("");
        setKnowledgeDriveQuery("");
        setKnowledgeDriveFolderTrail([]);
        setKnowledgeDriveNextPageToken(null);
        setStepSuccess("Google Drive disconnected. Imported sources remain saved.");
      })
      .catch((error) => {
        setStepError(error instanceof Error ? error.message : "Could not disconnect Google Drive.");
      })
      .finally(() => setKnowledgeDriveDisconnecting(false));
  };

  const handleSearchGoogleDriveFiles = (event: FormEvent) => {
    event.preventDefault();
    if (savingStep || knowledgeDriveFilesLoading) return;
    void loadGoogleDriveFiles({
      folderId: null,
      folderTrail: [],
      query: knowledgeDriveSearchDraft,
    });
  };

  const handleOpenGoogleDriveFolder = (folder: CommunityLaunchGoogleDriveFile) => {
    if (savingStep || knowledgeDriveFilesLoading || folder.kind !== "folder") return;
    const nextTrail = [...knowledgeDriveFolderTrail, { id: folder.id, name: folder.name }];
    setKnowledgeDriveSearchDraft("");
    void loadGoogleDriveFiles({
      folderId: folder.id,
      folderTrail: nextTrail,
      query: "",
    });
  };

  const handleBackGoogleDriveLocation = () => {
    if (savingStep || knowledgeDriveFilesLoading) return;
    const nextTrail = knowledgeDriveQuery
      ? []
      : knowledgeDriveFolderTrail.slice(0, Math.max(0, knowledgeDriveFolderTrail.length - 1));
    const nextFolder = nextTrail[nextTrail.length - 1] ?? null;
    setKnowledgeDriveSearchDraft("");
    void loadGoogleDriveFiles({
      folderId: nextFolder?.id ?? null,
      folderTrail: nextTrail,
      query: "",
    });
  };

  const handleLoadMoreGoogleDriveFiles = () => {
    if (savingStep || knowledgeDriveFilesLoading || !knowledgeDriveNextPageToken) return;
    const currentFolder = knowledgeDriveFolderTrail[knowledgeDriveFolderTrail.length - 1] ?? null;
    void loadGoogleDriveFiles({
      append: true,
      folderId: currentFolder?.id ?? null,
      folderTrail: knowledgeDriveFolderTrail,
      pageToken: knowledgeDriveNextPageToken,
      query: knowledgeDriveQuery,
    });
  };

  const handleCloseGoogleDrivePicker = () => {
    if (savingStep || knowledgeDriveFilesLoading) return;
    setKnowledgeDriveBrowserOpen(false);
    setKnowledgeDriveFiles([]);
    setKnowledgeDriveSearchDraft("");
    setKnowledgeDriveQuery("");
    setKnowledgeDriveFolderTrail([]);
    setKnowledgeDriveNextPageToken(null);
  };

  const handleToggleGoogleDriveFile = (fileId: string) => {
    const file = knowledgeDriveFiles.find((item) => item.id === fileId);
    if (
      !file ||
      !isImportableGoogleDriveSourceFile(file) ||
      knowledgeDriveImportedExternalIds.has(file.id)
    ) {
      return;
    }
    setKnowledgeDriveSelectedIds((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId].slice(0, COMMUNITY_LAUNCH_MAX_GOOGLE_DRIVE_FILES),
    );
  };

  const handleImportGoogleDriveFiles = () => {
    const importFileIds = knowledgeDriveSelectedIds.filter((id) => !knowledgeDriveImportedExternalIds.has(id));
    if (savingStep || knowledgeDriveFilesLoading || importFileIds.length === 0) return;
    if (!onImportKnowledgeGoogleDriveFiles) {
      setStepError("Google Drive import is unavailable.");
      return;
    }
    setSavingStep("knowledge");
    setStepError(null);
    setStepSuccess(null);
    void onImportKnowledgeGoogleDriveFiles(importFileIds)
      .then((result) => {
        const failedIds = new Set(
          (result?.failures ?? [])
            .map((failure) => String(failure.id ?? "").trim())
            .filter(Boolean),
        );
        if (failedIds.size > 0) {
          setKnowledgeDriveSelectedIds((ids) => ids.filter((id) => failedIds.has(id)));
        } else {
          setKnowledgeDriveSelectedIds((ids) => ids.filter((id) => !importFileIds.includes(id)));
        }
        if (result?.imported) {
          setStepSuccess(`${result.imported} Drive source${result.imported === 1 ? "" : "s"} added.`);
        } else if (!result?.failed) {
          setStepSuccess("Selected Drive files were already added.");
        }
        if (result?.failed) {
          const firstFailure = result.failures?.[0];
          setStepError(
            `${result.failed} Drive source${result.failed === 1 ? "" : "s"} failed${firstFailure?.message ? `: ${firstFailure.message}` : "."}`,
          );
        }
      })
      .catch((error) => {
        setStepError(error instanceof Error ? error.message : "Could not import Google Drive files.");
      })
      .finally(() => setSavingStep(null));
  };

  const removeImportedKnowledgeSource = ({
    source,
    providerName,
    removingSourceId,
    setRemovingSourceId,
    removeSource,
    setSelectedIds,
  }: ImportedKnowledgeSourceRemovalConfig) => {
    if (savingStep || removingSourceId || !source.id) return;
    if (!removeSource) {
      setStepError(`${providerName} source removal is unavailable.`);
      return;
    }
    setRemovingSourceId(source.id);
    setStepError(null);
    setStepSuccess(null);
    void removeSource(source.id)
      .then((removed) => {
        if (removed === false) {
          setStepError(`Could not remove ${providerName} source.`);
          return;
        }
        const sourceExternalId = String(source.source_external_id ?? "").trim();
        if (sourceExternalId && setSelectedIds) {
          setSelectedIds((ids) => ids.filter((id) => id !== sourceExternalId));
        }
        setStepSuccess(`${providerName} source removed.`);
      })
      .catch((error) => {
        setStepError(error instanceof Error ? error.message : `Could not remove ${providerName} source.`);
      })
      .finally(() => setRemovingSourceId(null));
  };

  const handleRemoveSavedKnowledgeSource = (source: CommunityLaunchKnowledgeImportedSource) => {
    const providerName =
      source.source_external_provider === "google_drive"
        ? "Drive"
        : source.source_external_provider === "github"
          ? "GitHub"
          : source.source_ingestion_kind === "file"
            ? "File"
            : "Link";
    const removeSource =
      source.source_external_provider === "google_drive"
        ? onRemoveKnowledgeGoogleDriveSource
        : source.source_external_provider === "github"
          ? onRemoveKnowledgeGitHubSource
          : source.source_ingestion_kind === "file"
            ? onRemoveKnowledgeFileSource
            : onRemoveKnowledgeLinkSource;
    const setSelectedIds =
      source.source_external_provider === "google_drive"
        ? setKnowledgeDriveSelectedIds
        : source.source_external_provider === "github"
          ? setKnowledgeGitHubSelectedIds
          : undefined;
    removeImportedKnowledgeSource({
      source,
      providerName,
      removingSourceId: knowledgeRemovingSourceId,
      setRemovingSourceId: setKnowledgeRemovingSourceId,
      removeSource,
      setSelectedIds,
    });
  };

  const handleGitHubPrimaryAction = () => {
    if (savingStep || knowledgeGitHubConnectionLoading || knowledgeGitHubRepositoriesLoading || knowledgeGitHubFilesLoading) return;
    setStepError(null);
    setStepSuccess(null);
    void (async () => {
      if (!knowledgeGitHubConnection?.connected) {
        if (!onConnectKnowledgeGitHub) {
          setStepError("GitHub connection is unavailable.");
          return;
        }
        setKnowledgeGitHubConnectionLoading(true);
        try {
          const result = await onConnectKnowledgeGitHub();
          if (!result?.ok) {
            setStepError(result?.error_message || "Could not start GitHub connection.");
          }
        } catch (error) {
          setStepError(error instanceof Error ? error.message : "Could not start GitHub connection.");
        } finally {
          setKnowledgeGitHubConnectionLoading(false);
        }
        return;
      }
      void loadGitHubRepositories();
    })();
  };

  const handleSelectGitHubRepository = (repository: CommunityLaunchGitHubRepository) => {
    if (savingStep || knowledgeGitHubFilesLoading || !onListKnowledgeGitHubFiles) return;
    setStepError(null);
    setStepSuccess(null);
    setKnowledgeGitHubFilesLoading(true);
    setKnowledgeGitHubSelectedRepository(repository);
    setKnowledgeGitHubFiles([]);
    setKnowledgeGitHubFilesTruncated(false);
    setKnowledgeGitHubFileLimit(COMMUNITY_LAUNCH_GITHUB_FILE_LIST_LIMIT);
    void onListKnowledgeGitHubFiles(repository.full_name, repository.default_branch)
      .then((result) => {
        if (!result?.ok) throw new Error("Could not load GitHub files.");
        setKnowledgeGitHubConnection(result.connection ?? knowledgeGitHubConnection);
        setKnowledgeGitHubFiles(result.files ?? []);
        setKnowledgeGitHubFilesTruncated(result.truncated === true);
        setKnowledgeGitHubFileLimit(
          typeof result.file_limit === "number" && Number.isFinite(result.file_limit)
            ? Math.max(1, Math.floor(result.file_limit))
            : COMMUNITY_LAUNCH_GITHUB_FILE_LIST_LIMIT,
        );
        setStepSuccess(
          (result.files ?? []).length > 0
            ? "Choose GitHub files to import."
            : "No readable GitHub files found.",
        );
      })
      .catch((error) => {
        setStepError(error instanceof Error ? error.message : "Could not load GitHub files.");
      })
      .finally(() => setKnowledgeGitHubFilesLoading(false));
  };

  const handleToggleGitHubFile = (fileId: string) => {
    if (knowledgeGitHubImportedExternalIds.has(fileId)) return;
    setKnowledgeGitHubSelectedIds((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : current.length >= COMMUNITY_LAUNCH_MAX_GITHUB_FILES
          ? current
          : [...current, fileId],
    );
  };

  const handleSelectAllGitHubFiles = () => {
    setKnowledgeGitHubSelectedIds((current) => {
      const selectableFileIds = knowledgeGitHubSelectableFileIds.filter(
        (id) => !knowledgeGitHubImportedExternalIds.has(id),
      );
      const currentSet = new Set(current);
      const selectableSet = new Set(selectableFileIds);
      const currentOutsideVisible = current.filter((id) => !selectableSet.has(id));
      const allSelected =
        selectableFileIds.length > 0 &&
        selectableFileIds.every((id) => currentSet.has(id));
      if (allSelected) return currentOutsideVisible;
      const remainingSlots = Math.max(0, COMMUNITY_LAUNCH_MAX_GITHUB_FILES - currentOutsideVisible.length);
      return [
        ...currentOutsideVisible,
        ...selectableFileIds.filter((id) => !currentSet.has(id)).slice(0, remainingSlots),
      ];
    });
  };

  const handleImportGitHubFiles = () => {
    const importFileIds = knowledgeGitHubSelectedIds.filter((id) => !knowledgeGitHubImportedExternalIds.has(id));
    if (savingStep || knowledgeGitHubFilesLoading || importFileIds.length === 0) return;
    if (!onImportKnowledgeGitHubFiles) {
      setStepError("GitHub import is unavailable.");
      return;
    }
    setSavingStep("knowledge");
    setStepError(null);
    setStepSuccess(null);
    void onImportKnowledgeGitHubFiles(importFileIds)
      .then((result) => {
        const failedIds = new Set(
          (result?.failures ?? [])
            .map((failure) => String(failure.id ?? "").trim())
            .filter(Boolean),
        );
        if (failedIds.size > 0) {
          setKnowledgeGitHubSelectedIds((ids) => ids.filter((id) => failedIds.has(id)));
        } else {
          setKnowledgeGitHubSelectedIds((ids) => ids.filter((id) => !importFileIds.includes(id)));
        }
        if (result?.imported) {
          setStepSuccess(`${result.imported} GitHub source${result.imported === 1 ? "" : "s"} added.`);
        } else if (!result?.failed) {
          setStepSuccess("Selected GitHub files were already added.");
        }
        if (result?.failed) {
          const firstFailure = result.failures?.[0];
          setStepError(
            `${result.failed} GitHub source${result.failed === 1 ? "" : "s"} failed${firstFailure?.message ? `: ${firstFailure.message}` : "."}`,
          );
        }
      })
      .catch((error) => {
        setStepError(error instanceof Error ? error.message : "Could not import GitHub files.");
      })
      .finally(() => setSavingStep(null));
  };

  const handleCloseGitHubPicker = () => {
    setKnowledgeGitHubRepositories([]);
    setKnowledgeGitHubSelectedRepository(null);
    setKnowledgeGitHubFiles([]);
    setKnowledgeGitHubFilesTruncated(false);
    setKnowledgeGitHubFileLimit(COMMUNITY_LAUNCH_GITHUB_FILE_LIST_LIMIT);
    setStepSuccess(null);
  };

  const handleDisconnectGitHub = () => {
    if (savingStep || knowledgeGitHubDisconnecting || !knowledgeGitHubConnection?.connected) return;
    if (!onDisconnectKnowledgeGitHub) {
      setStepError("GitHub disconnect is unavailable.");
      return;
    }
    const shouldDisconnect = window.confirm(
      "Disconnect GitHub? Imported sources stay saved, but queued GitHub sources may need you to reconnect before processing.",
    );
    if (!shouldDisconnect) return;
    setKnowledgeGitHubDisconnecting(true);
    setStepError(null);
    setStepSuccess(null);
    void onDisconnectKnowledgeGitHub()
      .then((connection) => {
        setKnowledgeGitHubConnection(connection ?? { connected: false });
        handleCloseGitHubPicker();
        setKnowledgeGitHubSelectedIds([]);
        setStepSuccess("GitHub disconnected. Imported sources remain saved.");
      })
      .catch((error) => {
        setStepError(error instanceof Error ? error.message : "Could not disconnect GitHub.");
      })
      .finally(() => setKnowledgeGitHubDisconnecting(false));
  };

  const resetKnowledgeAssembly = () => {
    setKnowledgeView("collect");
    setKnowledgeAssemblyStage("idle");
    setKnowledgeAssemblyFailedStage(null);
  };

  const getKnowledgePreparationBlocker = (): string | null => {
    if (knowledgeLinkDrafts.some((url) => url.trim())) {
      return "Add source links before continuing.";
    }
    if (knowledgeDriveSelectedIds.some((id) => !knowledgeDriveImportedExternalIds.has(id))) {
      return "Import selected Google Drive files before continuing.";
    }
    if (knowledgeGitHubSelectedIds.some((id) => !knowledgeGitHubImportedExternalIds.has(id))) {
      return "Import selected GitHub files before continuing.";
    }
    if (knowledgeMissingCredentialMessage) {
      return knowledgeMissingCredentialMessage;
    }
    return null;
  };

  const handleBackToKnowledgeSources = () => {
    if (savingStep || knowledgeHealthLoading) return;
    resetKnowledgeAssembly();
    setStepError(null);
    setStepSuccess(null);
  };

  const handlePrepareKnowledgeResources = () => {
    if (savingStep || knowledgeHealthLoading) return;
    setStepError(null);
    setStepSuccess(null);
    void (async () => {
      const preparationBlocker = getKnowledgePreparationBlocker();
      if (preparationBlocker) {
        resetKnowledgeAssembly();
        setStepError(preparationBlocker);
        return;
      }
      if (
        !onIngestKnowledgeSources ||
        !onGenerateKnowledgePlan ||
        !onApplyKnowledgePlan ||
        !onDraftKnowledgeResources
      ) {
        setStepSuccess(
          "Continue once draft resources are ready in Resources.",
        );
        onOpenStep("knowledge");
        return;
      }
      setSavingStep("knowledge");
      setKnowledgeHealthLoading(true);
      setKnowledgeView("assemble");
      setKnowledgeAssemblyFailedStage(null);
      let currentAssemblyStage: KnowledgeAssemblyWorkStage = "reading";
      const setAssemblyStage = (stage: KnowledgeAssemblyWorkStage) => {
        currentAssemblyStage = stage;
        setKnowledgeAssemblyStage(stage);
      };
      setAssemblyStage("reading");
      try {
        const ingestionResult = await onIngestKnowledgeSources();
        if (!ingestionResult?.ok && !knowledgeIngestionCanContinue(ingestionResult)) {
          throw new Error(formatKnowledgeIngestionResultError(ingestionResult));
        }
        const ingestionWarning = !ingestionResult?.ok
          ? formatKnowledgeIngestionPartialWarning(ingestionResult)
          : null;
        setAssemblyStage("organizing");
        const planResult = await onGenerateKnowledgePlan({
          builderIntent: "",
        });
        if (!planResult?.ok || !planResult.proposal) {
          throw new Error(
            planResult?.message || "Could not prepare draft resources.",
          );
        }
        setAssemblyStage("creating");
        const applyResult = await onApplyKnowledgePlan({
          proposal: planResult.proposal,
        });
        if (!applyResult?.ok) {
          const firstError = applyResult?.errors?.[0];
          throw new Error(
            firstError?.message ||
              applyResult?.message ||
              "Could not prepare draft resources.",
          );
        }
        if (applyResult.architecture_quality?.ok === false) {
          throw new Error("Resource organization failed integrity checks.");
        }
        const architectureWarning = formatKnowledgeArchitectureQualityWarning(
          applyResult.architecture_quality,
        );
        setAssemblyStage("writing");
        const draftResult = await onDraftKnowledgeResources();
        if (!draftResult?.ok) {
          const firstFailure = draftResult?.failures?.[0];
          throw new Error(
            firstFailure?.message ||
              draftResult?.message ||
              "Could not draft resource content.",
          );
        }
        setAssemblyStage("checking");
        const successMessage =
          architectureWarning ||
          (draftResult.drafted
            ? "Resources drafted for review."
            : "Draft resources prepared for review.");
        setStepSuccess(ingestionWarning ? `${successMessage} ${ingestionWarning}` : successMessage);
        setAssemblyStage("opening");
        onOpenStep("knowledge");
      } catch (error) {
        setKnowledgeAssemblyFailedStage(currentAssemblyStage);
        setKnowledgeAssemblyStage("failed");
        setStepError(
          error instanceof Error
            ? formatKnowledgeIngestionFailureMessage(error.message)
            : "Could not prepare draft resources.",
        );
      } finally {
        setKnowledgeHealthLoading(false);
        setSavingStep(null);
      }
    })();
  };

  const handleSaveAgent = (event: FormEvent) => {
    event.preventDefault();
    void runStepSave("agent", () => onSaveAgent(agentDraft), "Agent saved.");
  };

  const handleSaveAccess = (event: FormEvent) => {
    event.preventDefault();
    if (accessDraft === "paid_subscription") {
      setStepError("Stripe Connect needs the full access setup for pricing.");
      return;
    }
    void runStepSave(
      "access",
      () => onSaveAccess({ entryPolicy: accessDraft }),
      "Access saved.",
    );
  };

  const savePublishState = (visibility: "published" | "unlisted") => {
    void runStepSave(
      "publish",
      () => onSavePublish({ visibility }),
      visibility === "published"
        ? "Community published."
        : "Community kept unlisted.",
    );
  };

  const readProfileImage = async (
    kind: "avatar" | "banner",
    file: File | null,
  ) => {
    if (!file) return;
    setProfileMediaError(null);
    setProcessingProfileMedia(kind);
    try {
      const dataUrl =
        kind === "avatar"
          ? await readCommunityAvatarFileAsDataUrlWithinLimit(
              file,
              COMMUNITY_LAUNCH_IMAGE_DATA_URL_MAX_CHARS,
            )
          : await readBannerFileAsWideDataUrlWithinLimit(
              file,
              COMMUNITY_LAUNCH_IMAGE_DATA_URL_MAX_CHARS,
            );
      setProfileDraft((draft) => ({
        ...draft,
        [kind === "avatar" ? "avatarUrl" : "bannerUrl"]: dataUrl,
      }));
      if (kind === "avatar") {
        setProfileAvatarFileName(file.name || "Selected avatar");
      } else {
        setProfileBannerFileName(file.name || "Selected banner");
      }
    } catch (error) {
      setProfileMediaError(
        error instanceof Error
          ? error.message
          : kind === "avatar"
            ? "Could not read avatar image."
            : "Could not read banner image.",
      );
    } finally {
      setProcessingProfileMedia(null);
    }
  };

  const renderStepEditor = () => {
    if (activeStep === "profile") {
      const canSaveProfile = Boolean(
        profileDraft.name.trim() && profileDraft.slug.trim(),
      );
      return (
        <form
          className="community-launch-inline-form"
          onSubmit={handleSaveProfile}
        >
          <div className="community-launch-field-grid">
            <label className="community-launch-field">
              <span>Name</span>
              <input
                value={profileDraft.name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setProfileDraft((draft) => ({
                    ...draft,
                    name: nextName,
                    slug:
                      isCreateMode && !profileSlugEdited
                        ? slugifyCommunityName(nextName)
                        : draft.slug,
                  }));
                }}
                placeholder="Community name"
              />
            </label>
            <label className="community-launch-field">
              <span>Slug</span>
              <input
                value={profileDraft.slug}
                onChange={(event) => {
                  setProfileSlugEdited(true);
                  setProfileDraft((draft) => ({
                    ...draft,
                    slug: event.target.value,
                  }));
                }}
                placeholder="community-slug"
              />
            </label>
          </div>
          <label className="community-launch-field">
            <span>One-liner</span>
            <textarea
              value={profileDraft.oneLiner}
              onChange={(event) =>
                setProfileDraft((draft) => ({
                  ...draft,
                  oneLiner: event.target.value,
                }))
              }
              rows={2}
              placeholder="A short line about who this community is for."
            />
          </label>
          <div className="create-community-branding community-launch-profile-branding">
            <div
              className={`create-community-banner${profileBannerDragOver ? " drag-over" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setProfileBannerDragOver(true);
              }}
              onDragLeave={() => setProfileBannerDragOver(false)}
              onDrop={(event) => handleProfileImageDrop("banner", event)}
            >
              <div className="create-community-banner-media">
                {profileDraft.bannerUrl ? (
                  <img
                    src={profileDraft.bannerUrl}
                    alt="Community banner preview"
                    draggable={false}
                    style={getCommunityBannerImageStyle({
                      focusX: effectiveCommunity.banner_focus_x,
                      focusY: effectiveCommunity.banner_focus_y,
                      zoom: effectiveCommunity.banner_zoom,
                    })}
                  />
                ) : (
                  <div className="create-community-banner-placeholder">
                    Banner preview
                  </div>
                )}
              </div>
              <div className="create-community-branding-actions">
                <label
                  className={`create-banner-btn${processingProfileMedia ? " disabled" : ""}`}
                >
                  {processingProfileMedia === "banner"
                    ? "Reading..."
                    : "Upload banner"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={Boolean(processingProfileMedia)}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      void readProfileImage("banner", file);
                    }}
                  />
                </label>
                {profileDraft.bannerUrl ? (
                  <button
                    type="button"
                    className="create-banner-remove"
                    disabled={Boolean(processingProfileMedia)}
                    onClick={() => {
                      setProfileDraft((draft) => ({ ...draft, bannerUrl: "" }));
                      setProfileBannerFileName("");
                    }}
                  >
                    Remove
                  </button>
                ) : null}
                {profileBannerFileName ? (
                  <span className="create-upload-status">
                    {profileBannerFileName}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="create-community-avatar-row">
              <CommunityAvatar
                className={`create-community-avatar${profileAvatarDragOver ? " drag-over" : ""}`}
                imageUrl={profileDraft.avatarUrl || null}
                focusX={effectiveCommunity.avatar_focus_x}
                focusY={effectiveCommunity.avatar_focus_y}
                zoom={effectiveCommunity.avatar_zoom}
                name={profileDraft.name || effectiveCommunity.name}
                alt="Community avatar preview"
                onDragOver={(event) => {
                  event.preventDefault();
                  setProfileAvatarDragOver(true);
                }}
                onDragLeave={() => setProfileAvatarDragOver(false)}
                onDrop={(event) => handleProfileImageDrop("avatar", event)}
              />
              <div className="create-community-avatar-actions">
                <label
                  className={`create-avatar-btn${processingProfileMedia ? " disabled" : ""}`}
                >
                  {processingProfileMedia === "avatar"
                    ? "Reading..."
                    : "Upload avatar"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={Boolean(processingProfileMedia)}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      void readProfileImage("avatar", file);
                    }}
                  />
                </label>
                {profileDraft.avatarUrl ? (
                  <button
                    type="button"
                    className="create-avatar-remove"
                    disabled={Boolean(processingProfileMedia)}
                    onClick={() => {
                      setProfileDraft((draft) => ({ ...draft, avatarUrl: "" }));
                      setProfileAvatarFileName("");
                    }}
                  >
                    Remove
                  </button>
                ) : null}
                {profileAvatarFileName ? (
                  <span className="create-upload-status">
                    {profileAvatarFileName}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {profileMediaError ? (
            <p className="community-launch-step-message error">
              {profileMediaError}
            </p>
          ) : null}
          <div className="community-launch-step-actions">
            {renderFinishLaterButton()}
            <button
              type="submit"
              className="polynet-onboarding-next"
              disabled={!canSaveProfile || isSavingActiveStep}
            >
              {isSavingActiveStep
                ? isCreateMode
                  ? "Creating..."
                  : "Saving..."
                : isCreateMode
                  ? "Next"
                  : "Save profile"}
            </button>
          </div>
        </form>
      );
    }

    if (activeStep === "about") {
      return (
        <form
          className="community-launch-inline-form"
          onSubmit={handleSaveAbout}
        >
          <label className="community-launch-field">
            <span>About</span>
            <textarea
              value={aboutDraft}
              onChange={(event) => setAboutDraft(event.target.value)}
              rows={7}
              placeholder="Describe the promise, audience, norms, and context members should understand before joining."
            />
          </label>
          <div className="community-launch-step-actions">
            {renderFinishLaterButton()}
            <button
              type="submit"
              className="polynet-onboarding-next"
              disabled={isSavingActiveStep}
            >
              {isSavingActiveStep ? "Saving..." : "Save about"}
            </button>
          </div>
        </form>
      );
    }

    if (activeStep === "knowledge") {
      if (knowledgeView === "assemble") {
        const assemblyFailed = knowledgeAssemblyStage === "failed";
        const assemblyWorking = !assemblyFailed && (knowledgeHealthLoading || isSavingActiveStep);
        return (
          <div className="community-launch-inline-form community-launch-knowledge-assembly">
            <div>
              <span className="community-launch-knowledge-kicker">Knowledge</span>
              <strong>Assembling resources</strong>
              <p>
                Creating your Resources page from the source material you added.
              </p>
            </div>
            <div
              className="community-launch-knowledge-assembly-steps"
              aria-live="polite"
              aria-label="Resource assembly progress"
            >
              {KNOWLEDGE_ASSEMBLY_STEPS.map((step) => {
                const status = getKnowledgeAssemblyStepStatus({
                  currentStage: knowledgeAssemblyStage,
                  failedStage: knowledgeAssemblyFailedStage,
                  stepStage: step.stage,
                });
                return (
                  <div
                    key={step.stage}
                    className={`community-launch-knowledge-assembly-step is-${status}`}
                  >
                    <span aria-hidden="true">
                      {status === "complete" ? (
                        <Check size={13} strokeWidth={2.6} />
                      ) : status === "failed" ? (
                        <X size={13} strokeWidth={2.6} />
                      ) : (
                        <Circle size={12} strokeWidth={2.4} />
                      )}
                    </span>
                    <strong>{step.label}</strong>
                  </div>
                );
              })}
            </div>
            <div className="community-launch-step-actions">
              {assemblyFailed ? (
                <button
                  type="button"
                  className="polynet-onboarding-back"
                  onClick={handleBackToKnowledgeSources}
                >
                  Back to sources
                </button>
              ) : (
                renderFinishLaterButton(assemblyWorking)
              )}
              <button
                type="button"
                className="polynet-onboarding-next"
                disabled={assemblyWorking}
                onClick={assemblyFailed ? handlePrepareKnowledgeResources : undefined}
              >
                {assemblyFailed ? "Try again" : "Working..."}
              </button>
            </div>
          </div>
        );
      }
      const canAddKnowledgeLinkRow =
        knowledgeLinkDrafts.length < COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS;
      return (
        <div className="community-launch-inline-form community-launch-knowledge-gateway">
          <div className="community-launch-knowledge-stack">
            <section className="community-launch-knowledge-row">
              <span
                className="community-launch-knowledge-icon"
                aria-hidden="true"
              >
                <FileText size={15} strokeWidth={2} />
              </span>
              <div>
                <span className="community-launch-knowledge-kicker">
                  Sources
                </span>
                <strong>Drop source material</strong>
                <p>
                  Text files, notes, and structured data enter the canonical
                  resources system here.
                </p>
                <label
                  className={`community-launch-knowledge-dropzone${knowledgeSourceDragOver ? " is-drag-over" : ""}`}
                  aria-label="Upload source files"
                  onDragOver={(event) => {
                    event.preventDefault();
                    setKnowledgeSourceDragOver(true);
                  }}
                  onDragLeave={() => setKnowledgeSourceDragOver(false)}
                  onDrop={handleKnowledgeFileDrop}
                >
                  <input
                    className="community-launch-knowledge-file-input"
                    type="file"
                    multiple
                    accept=".txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.xml,.html,.htm,.yaml,.yml,.toml,.log,text/*,application/json,text/csv"
                    disabled={isSavingActiveStep || !onAddKnowledgeFile}
                    onChange={(event) => {
                      handleKnowledgeFileInput(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <span>
                    {isSavingActiveStep
                      ? "Uploading..."
                      : onAddKnowledgeFile
                        ? "Drop files or choose files"
                        : "File upload unavailable"}
                  </span>
                </label>
                <ImportedKnowledgeSourceRows
                  sources={effectiveKnowledgeFileSources}
                  fallbackTitle="Source file"
                  resourceLabel={formatKnowledgeResourceLabel(effectiveKnowledgeFileSources.length, "file")}
                  expanded={knowledgeFileSourcesExpanded}
                  removingSourceId={knowledgeRemovingSourceId}
                  disabled={isSavingActiveStep}
                  canRemove={Boolean(onRemoveKnowledgeFileSource)}
                  onToggleExpanded={() => setKnowledgeFileSourcesExpanded((expanded) => !expanded)}
                  onRemove={handleRemoveSavedKnowledgeSource}
                />
              </div>
            </section>
            <section className="community-launch-knowledge-row">
              <span
                className="community-launch-knowledge-icon"
                aria-hidden="true"
              >
                <Link2 size={15} strokeWidth={2} />
              </span>
              <div>
                <span className="community-launch-knowledge-kicker">
                  Links
                </span>
                <strong>Add source links</strong>
                <p>
                  Paste docs, videos, articles, or public resource URLs into
                  the community resource directory.
                </p>
                <form
                  className="community-launch-knowledge-link-composer"
                  onSubmit={handleAddKnowledgeLink}
                >
                  <div className="community-launch-knowledge-link-list">
                    {knowledgeLinkDrafts.map((url, index) => (
                      <input
                        key={index}
                        aria-label={`Source link URL ${index + 1}`}
                        value={url}
                        onChange={(event) => {
                          const nextUrls = [...knowledgeLinkDrafts];
                          nextUrls[index] = event.target.value;
                          setKnowledgeLinkDrafts(nextUrls);
                        }}
                        placeholder="https://..."
                      />
                    ))}
                  </div>
                  <div className="community-launch-knowledge-link-actions">
                    <button
                      type="button"
                      className="community-launch-knowledge-link-add"
                      disabled={!canAddKnowledgeLinkRow || isSavingActiveStep}
                      onClick={() => {
                        if (!canAddKnowledgeLinkRow) return;
                        setKnowledgeLinkDrafts((urls) =>
                          [...urls, ""].slice(
                            0,
                            COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS,
                          ),
                        );
                      }}
                    >
                      <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
                      Add new link
                    </button>
                    <span>
                      {knowledgeLinkDrafts.length}/
                      {COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS}
                    </span>
                    <button
                      type="submit"
                      disabled={
                        !knowledgeLinkDrafts.some((url) => url.trim()) ||
                        isSavingActiveStep
                      }
                    >
                      {isSavingActiveStep ? "Adding..." : "Add links"}
                    </button>
                  </div>
                </form>
                <ImportedKnowledgeSourceRows
                  sources={effectiveKnowledgeLinkSources}
                  fallbackTitle="Source link"
                  resourceLabel={formatKnowledgeResourceLabel(effectiveKnowledgeLinkSources.length, "link")}
                  expanded={knowledgeLinkSourcesExpanded}
                  removingSourceId={knowledgeRemovingSourceId}
                  disabled={isSavingActiveStep}
                  canRemove={Boolean(onRemoveKnowledgeLinkSource)}
                  onToggleExpanded={() => setKnowledgeLinkSourcesExpanded((expanded) => !expanded)}
                  onRemove={handleRemoveSavedKnowledgeSource}
                />
              </div>
              <span className="community-launch-knowledge-pill">Available</span>
            </section>
            <section className="community-launch-knowledge-row">
              <span
                className="community-launch-knowledge-icon"
                aria-hidden="true"
              >
                <Link2 size={15} strokeWidth={2} />
              </span>
              <div>
                <span className="community-launch-knowledge-kicker">
                  Integrations
                </span>
                <strong>Connect source systems</strong>
                <p>
                  Connect manager-authorized source access, then choose the
                  exact material to queue for community resources.
                </p>
                <div
                  className="community-launch-knowledge-integrations"
                  aria-label="Knowledge integrations"
                >
                  <div className="community-launch-knowledge-integration-provider">
                    <button
                      type="button"
                      className={`community-launch-knowledge-integration-chip${knowledgeDriveConnection?.connected ? " is-connected" : ""}`}
                      disabled={
                        isSavingActiveStep ||
                        knowledgeDriveDisconnecting ||
                        (knowledgeDriveConnection?.connected
                          ? knowledgeDriveFilesLoading || !onListKnowledgeGoogleDriveFiles
                          : knowledgeDriveConnectionLoading || !onConnectKnowledgeGoogleDrive)
                      }
                      onClick={handleGoogleDrivePrimaryAction}
                    >
                      <img
                        className="community-launch-knowledge-provider-logo drive"
                        src="/app-logos/google-drive.svg"
                        alt=""
                        aria-hidden="true"
                      />
                      <span>Google Drive</span>
                      <small>
                        {knowledgeDriveConnection?.connected
                          ? knowledgeDriveFilesLoading
                            ? "Loading files"
                            : "Select files"
                          : knowledgeDriveConnectionLoading
                            ? "Connecting"
                            : "Connect"}
                      </small>
                    </button>
                    {knowledgeDriveConnection?.connected ? (
                      <div className="community-launch-knowledge-integration-status">
                        <button
                          type="button"
                          className="community-launch-knowledge-disconnect"
                          disabled={isSavingActiveStep || knowledgeDriveDisconnecting || !onDisconnectKnowledgeGoogleDrive}
                          onClick={handleDisconnectGoogleDrive}
                        >
                          {knowledgeDriveDisconnecting ? "Disconnecting..." : "Disconnect"}
                        </button>
                      </div>
                    ) : null}
                    {knowledgeDriveMissingCredentialSources.length > 0 ? (
                      <span className="community-launch-knowledge-reconnect-required">
                        {formatReconnectRequiredMessage(
                          "Google Drive",
                          knowledgeDriveMissingCredentialSources.length,
                        )}
                      </span>
                    ) : null}
                    <ImportedKnowledgeSourceRows
                      sources={effectiveKnowledgeGoogleDriveSources}
                      fallbackTitle="Drive source"
                      resourceLabel={`${effectiveKnowledgeGoogleDriveSources.length} Drive source${
                        effectiveKnowledgeGoogleDriveSources.length === 1 ? "" : "s"
                      }`}
                      expanded={knowledgeDriveSourcesExpanded}
                      removingSourceId={knowledgeRemovingSourceId}
                      disabled={isSavingActiveStep}
                      canRemove={Boolean(onRemoveKnowledgeGoogleDriveSource)}
                      onToggleExpanded={() => setKnowledgeDriveSourcesExpanded((expanded) => !expanded)}
                      onRemove={handleRemoveSavedKnowledgeSource}
                    />
                  </div>
                  <div className="community-launch-knowledge-integration-provider">
                    <button
                      type="button"
                      className={`community-launch-knowledge-integration-chip${knowledgeGitHubConnection?.connected ? " is-connected" : ""}`}
                      disabled={
                        isSavingActiveStep ||
                        knowledgeGitHubDisconnecting ||
                        (knowledgeGitHubConnection?.connected
                          ? knowledgeGitHubRepositoriesLoading || !onListKnowledgeGitHubRepositories
                          : knowledgeGitHubConnectionLoading || !onConnectKnowledgeGitHub)
                      }
                      onClick={handleGitHubPrimaryAction}
                    >
                      <img
                        className="community-launch-knowledge-provider-logo github"
                        src="/app-logos/github.svg"
                        alt=""
                        aria-hidden="true"
                      />
                      <span>GitHub</span>
                      <small>
                        {knowledgeGitHubConnection?.connected
                          ? knowledgeGitHubRepositoriesLoading
                            ? "Loading repos"
                            : knowledgeGitHubFilesLoading
                              ? "Loading files"
                              : "Select repo"
                          : knowledgeGitHubConnectionLoading
                            ? "Connecting"
                            : "Connect"}
                      </small>
                    </button>
                    {knowledgeGitHubConnection?.connected ? (
                      <div className="community-launch-knowledge-integration-status">
                        <button
                          type="button"
                          className="community-launch-knowledge-disconnect"
                          disabled={isSavingActiveStep || knowledgeGitHubDisconnecting || !onDisconnectKnowledgeGitHub}
                          onClick={handleDisconnectGitHub}
                        >
                          {knowledgeGitHubDisconnecting ? "Disconnecting..." : "Disconnect"}
                        </button>
                      </div>
                    ) : null}
                    {knowledgeGitHubMissingCredentialSources.length > 0 ? (
                      <span className="community-launch-knowledge-reconnect-required">
                        {formatReconnectRequiredMessage(
                          "GitHub",
                          knowledgeGitHubMissingCredentialSources.length,
                        )}
                      </span>
                    ) : null}
                    <ImportedKnowledgeSourceRows
                      sources={effectiveKnowledgeGitHubSources}
                      fallbackTitle="GitHub source"
                      resourceLabel={`${effectiveKnowledgeGitHubSources.length} GitHub source${
                        effectiveKnowledgeGitHubSources.length === 1 ? "" : "s"
                      }`}
                      expanded={knowledgeGitHubSourcesExpanded}
                      removingSourceId={knowledgeRemovingSourceId}
                      disabled={isSavingActiveStep}
                      canRemove={Boolean(onRemoveKnowledgeGitHubSource)}
                      onToggleExpanded={() => setKnowledgeGitHubSourcesExpanded((expanded) => !expanded)}
                      onRemove={handleRemoveSavedKnowledgeSource}
                    />
                  </div>
                </div>
                {knowledgeDriveBrowserOpen ? (
                  <div className="community-launch-knowledge-source-picker community-launch-knowledge-source-browser">
                    <form className="community-launch-knowledge-drive-search" onSubmit={handleSearchGoogleDriveFiles}>
                      <Search size={14} strokeWidth={2} aria-hidden="true" />
                      <input
                        type="search"
                        value={knowledgeDriveSearchDraft}
                        onChange={(event) => setKnowledgeDriveSearchDraft(event.target.value)}
                        placeholder="Search Google Drive"
                      />
                      <button type="submit" disabled={isSavingActiveStep || knowledgeDriveFilesLoading}>
                        Search
                      </button>
                    </form>
                    <div className="community-launch-knowledge-drive-location" aria-label="Google Drive location">
                      <div>
                        <span>Current location</span>
                        <strong title={knowledgeDriveLocationPath}>{knowledgeDriveLocationPath}</strong>
                      </div>
                      {knowledgeDriveQuery || knowledgeDriveCurrentFolder ? (
                        <button
                          type="button"
                          className="community-launch-knowledge-drive-back"
                          disabled={isSavingActiveStep || knowledgeDriveFilesLoading}
                          onClick={handleBackGoogleDriveLocation}
                        >
                          <ArrowLeft size={13} strokeWidth={2.25} aria-hidden="true" />
                          {knowledgeDriveQuery ? "Back to Drive" : "Back"}
                        </button>
                      ) : null}
                    </div>
                    {knowledgeDriveFiles.length > 0 ? (
                      knowledgeDriveFiles.map((file) => {
                        const alreadyAdded = knowledgeDriveImportedExternalIds.has(file.id);
                        return file.kind === "folder" ? (
                          <button
                            key={file.id}
                            type="button"
                            className="community-launch-knowledge-drive-folder"
                            disabled={isSavingActiveStep || knowledgeDriveFilesLoading}
                            onClick={() => handleOpenGoogleDriveFolder(file)}
                          >
                            <Folder size={14} strokeWidth={2} aria-hidden="true" />
                            <span>{file.name}</span>
                            <small>Folder</small>
                          </button>
                        ) : (
                          <label key={file.id} className={alreadyAdded ? "is-added" : undefined}>
                            <input
                              type="checkbox"
                              checked={knowledgeDriveSelectedIds.includes(file.id)}
                              disabled={!isImportableGoogleDriveSourceFile(file) || alreadyAdded}
                              onChange={() => handleToggleGoogleDriveFile(file.id)}
                            />
                            <span>{file.name}</span>
                            <small>{alreadyAdded ? "Added" : getGoogleDriveSourceFileTypeLabel(file)}</small>
                          </label>
                        );
                      })
                    ) : (
                      <p className="community-launch-knowledge-source-empty">
                        {knowledgeDriveFilesLoading
                          ? "Loading Drive items..."
                          : knowledgeDriveQuery
                            ? "No matching Drive files or folders."
                            : "No readable files or folders here."}
                      </p>
                    )}
                    <div className="community-launch-knowledge-source-actions">
                      {knowledgeDriveNextPageToken ? (
                        <button
                          type="button"
                          className="secondary"
                          disabled={isSavingActiveStep || knowledgeDriveFilesLoading}
                          onClick={handleLoadMoreGoogleDriveFiles}
                        >
                          Load more
                        </button>
                      ) : null}
                      <span>
                        {knowledgeDriveSelectedIds.length}/{COMMUNITY_LAUNCH_MAX_GOOGLE_DRIVE_FILES} selected
                      </span>
                      <button
                        type="button"
                        className="community-launch-knowledge-source-import"
                        disabled={
                          isSavingActiveStep ||
                          knowledgeDriveFilesLoading ||
                          knowledgeDriveSelectedIds.every((id) => knowledgeDriveImportedExternalIds.has(id))
                        }
                        onClick={handleImportGoogleDriveFiles}
                      >
                        Import selected
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={isSavingActiveStep || knowledgeDriveFilesLoading}
                        onClick={handleCloseGoogleDrivePicker}
                      >
                        Close
                      </button>
                    </div>
                    {knowledgeDriveVisibleImportableCount === 0 && knowledgeDriveFiles.length > 0 ? (
                      <p className="community-launch-knowledge-source-empty">
                        Open a folder or search to find readable files.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {knowledgeGitHubRepositories.length > 0 ? (
                  <div className="community-launch-knowledge-source-picker community-launch-knowledge-github-repo-list">
                    {knowledgeGitHubRepositories.map((repository) => {
                      const isSelectedRepository = knowledgeGitHubSelectedRepository?.id === repository.id;
                      const importedSourceCount = knowledgeGitHubImportedRepoCounts.get(repository.full_name) ?? 0;
                      return (
                        <div key={repository.id} className="community-launch-knowledge-github-repo-item">
                          <button
                            type="button"
                            className={`community-launch-knowledge-github-repo${
                              isSelectedRepository ? " is-selected" : ""
                            }${importedSourceCount > 0 ? " has-imported-sources" : ""}`}
                            disabled={isSavingActiveStep || knowledgeGitHubFilesLoading || !onListKnowledgeGitHubFiles}
                            onClick={() => handleSelectGitHubRepository(repository)}
                            aria-pressed={isSelectedRepository}
                          >
                            {repository.private ? (
                              <LockKeyhole size={13} strokeWidth={2.2} aria-hidden="true" />
                            ) : (
                              <BookOpen size={13} strokeWidth={2.2} aria-hidden="true" />
                            )}
                            <span>
                              <strong>{repository.full_name}</strong>
                              <small>
                                {repository.private ? "Private" : "Public"} / {repository.default_branch}
                                {importedSourceCount > 0
                                  ? ` / ${importedSourceCount} imported`
                                  : ""}
                              </small>
                            </span>
                          </button>
                          {isSelectedRepository ? (
                            <div className="community-launch-knowledge-github-file-panel">
                              {knowledgeGitHubFiles.length > 0 ? (
                                <>
                                  <p className="community-launch-knowledge-github-file-truth">
                                    {knowledgeGitHubFilesTruncated
                                      ? `Showing the first ${knowledgeGitHubFiles.length} readable files. This repo has more than the ${knowledgeGitHubFileLimit}-file selector limit.`
                                      : `Showing ${knowledgeGitHubFiles.length} readable file${knowledgeGitHubFiles.length === 1 ? "" : "s"}.`}{" "}
                                    Import up to {COMMUNITY_LAUNCH_MAX_GITHUB_FILES} at a time.
                                  </p>
                                  <div className="community-launch-knowledge-github-file-list">
                                    {knowledgeGitHubFiles.map((file) => {
                                      const isSelected = knowledgeGitHubSelectedIdSet.has(file.id);
                                      const alreadyAdded = knowledgeGitHubImportedExternalIds.has(file.id);
                                      return (
                                        <label key={file.id} className={alreadyAdded ? "is-added" : undefined}>
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            disabled={
                                              isSavingActiveStep ||
                                              knowledgeGitHubFilesLoading ||
                                              alreadyAdded ||
                                              (!isSelected && knowledgeGitHubSelectionAtLimit)
                                            }
                                            onChange={() => handleToggleGitHubFile(file.id)}
                                          />
                                          <span>{file.path}</span>
                                          <small>{alreadyAdded ? "Added" : file.size ? `${Math.ceil(file.size / 1024)} KB` : file.ref}</small>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </>
                              ) : (
                                <p className="community-launch-knowledge-source-empty">
                                  {knowledgeGitHubFilesLoading ? "Loading GitHub files..." : "No readable GitHub files found."}
                                </p>
                              )}
                              {knowledgeGitHubFiles.length > 0 ? (
                                <div className="community-launch-knowledge-source-actions">
                                  <span>
                                    {knowledgeGitHubSelectedIds.length}/{COMMUNITY_LAUNCH_MAX_GITHUB_FILES} selected
                                  </span>
                                  <button
                                    type="button"
                                    className="community-launch-knowledge-source-list-toggle"
                                    disabled={
                                      isSavingActiveStep ||
                                      knowledgeGitHubFilesLoading ||
                                      knowledgeGitHubSelectableFileIds.length === 0
                                    }
                                    onClick={handleSelectAllGitHubFiles}
                                  >
                                    {knowledgeGitHubAllSelectableFilesSelected
                                      ? "Clear all"
                                      : knowledgeGitHubFiles.length > COMMUNITY_LAUNCH_MAX_GITHUB_FILES
                                        ? `Select first ${COMMUNITY_LAUNCH_MAX_GITHUB_FILES}`
                                        : "Select all"}
                                  </button>
                                  <button
                                    type="button"
                                    className="community-launch-knowledge-source-import"
                                    disabled={
                                      isSavingActiveStep ||
                                      knowledgeGitHubFilesLoading ||
                                      knowledgeGitHubSelectedIds.every((id) => knowledgeGitHubImportedExternalIds.has(id))
                                    }
                                    onClick={handleImportGitHubFiles}
                                  >
                                    Import selected
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    <div className="community-launch-knowledge-source-actions">
                      <span>{knowledgeGitHubRepositories.length} repositories</span>
                      <button
                        type="button"
                        className="secondary"
                        disabled={isSavingActiveStep || knowledgeGitHubFilesLoading}
                        onClick={handleCloseGitHubPicker}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <span className="community-launch-knowledge-pill">
                {knowledgeDriveConnection?.connected || knowledgeGitHubConnection?.connected ? "Connected" : "Available"}
              </span>
            </section>
          </div>
          <div className="community-launch-step-actions">
            {renderFinishLaterButton()}
            <button
              type="button"
              className="polynet-onboarding-next"
              disabled={isSavingActiveStep || knowledgeHealthLoading}
              onClick={handlePrepareKnowledgeResources}
            >
              {knowledgeHealthLoading
                ? "Curating resources..."
                : isSavingActiveStep
                  ? "Saving..."
                  : "Next"}
            </button>
          </div>
        </div>
      );
    }

    if (activeStep === "agent") {
      return (
        <form
          className="community-launch-inline-form"
          onSubmit={handleSaveAgent}
        >
          <label className="community-launch-field">
            <span>Agent instructions</span>
            <textarea
              value={agentDraft.systemPrompt}
              onChange={(event) =>
                setAgentDraft((draft) => ({
                  ...draft,
                  systemPrompt: event.target.value,
                }))
              }
              rows={6}
              placeholder="How should the agent help this community?"
            />
          </label>
          <details className="community-launch-starter-panel">
            <summary>
              <strong>Starter prompts</strong>
              <span>Optional quick questions members can tap.</span>
            </summary>
            <div className="community-launch-starter-list">
              {agentDraft.starterPrompts.map((prompt, index) => (
                <label className="community-launch-field" key={index}>
                  <span>Prompt {index + 1}</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => {
                      const nextPrompts = [...agentDraft.starterPrompts];
                      nextPrompts[index] = event.target.value;
                      setAgentDraft((draft) => ({
                        ...draft,
                        starterPrompts: nextPrompts,
                      }));
                    }}
                    rows={2}
                    placeholder="Suggested first question"
                  />
                </label>
              ))}
            </div>
          </details>
          <div className="community-launch-step-actions">
            {renderFinishLaterButton()}
            <button
              type="submit"
              className="polynet-onboarding-next"
              disabled={isSavingActiveStep}
            >
              {isSavingActiveStep ? "Saving..." : "Save agent"}
            </button>
          </div>
        </form>
      );
    }

    if (activeStep === "access") {
      return (
        <form
          className="community-launch-inline-form"
          onSubmit={handleSaveAccess}
        >
          <div
            className="community-launch-choice-row"
            role="radiogroup"
            aria-label="Community access"
          >
            {[
              ["open", "Open", "Members can join directly."],
              ["approval", "Approval", "Members request access first."],
              [
                "paid_subscription",
                "Stripe Connect",
                "Connect Stripe before paid access.",
              ],
            ].map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                className={`community-launch-choice${accessDraft === value ? " selected" : ""}${
                  value === "paid_subscription" ? " stripe-connect" : ""
                }`}
                onClick={() => setAccessDraft(value as CommunityEntryPolicy)}
                role="radio"
                aria-checked={accessDraft === value}
                aria-label={label}
              >
                <strong>
                  {value === "paid_subscription" ? (
                    <span className="community-launch-stripe-label">
                      <StripeWordmark className="community-launch-stripe-wordmark" />
                      <span>Connect</span>
                    </span>
                  ) : (
                    label
                  )}
                </strong>
                <span>{description}</span>
              </button>
            ))}
          </div>
          <div className="community-launch-step-actions">
            {renderFinishLaterButton()}
            <button
              type="submit"
              className="polynet-onboarding-next"
              disabled={
                accessDraft === "paid_subscription" || isSavingActiveStep
              }
            >
              {isSavingActiveStep ? "Saving..." : "Save access"}
            </button>
          </div>
        </form>
      );
    }

    if (activeStep === "publish") {
      const isPublished =
        String(effectiveCommunity.visibility ?? "")
          .trim()
          .toLowerCase() === "published";
      return (
        <div className="community-launch-inline-form">
          {publishMissing.length > 0 ? (
            <p className="community-launch-inline-note">
              Publish needs the profile requirements above before the community
              can appear in Discover.
            </p>
          ) : (
            <p className="community-launch-inline-note">
              The public profile is ready to publish. The rest of launch setup
              can continue after publishing.
            </p>
          )}
          <div className="community-launch-step-actions">
            {renderFinishLaterButton()}
            <button
              type="button"
              className="polynet-onboarding-next"
              onClick={() => savePublishState("published")}
              disabled={
                publishMissing.length > 0 || isSavingActiveStep || isPublished
              }
            >
              {isSavingActiveStep
                ? "Publishing..."
                : isPublished
                  ? "Published"
                  : "Publish"}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="community-launch-inline-form">
        <p className="community-launch-inline-note">
          This setup step is not available from the launch flow yet.
        </p>
        <div className="community-launch-step-actions">
          {renderFinishLaterButton()}
          <button
            type="button"
            className="polynet-onboarding-next"
            onClick={() => onOpenStep(activeStep)}
          >
            {activeComplete ? `Review ${activeMeta.label}` : activeMeta.action}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="polynet-onboarding-modal-backdrop" role="presentation">
      <div
        className="polynet-onboarding-modal community-launch-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-launch-title"
      >
        <section className="polynet-onboarding-panel">
          <button
            className="polynet-onboarding-close community-launch-close"
            type="button"
            onClick={onClose}
            aria-label="Close community launch setup"
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>

          <div className="polynet-onboarding-header">
            <div
              className="polynet-onboarding-progress-ring"
              aria-hidden="true"
            >
              <svg viewBox="0 0 40 40">
                <circle className="track" cx="20" cy="20" r="17" />
                <circle
                  className="value"
                  cx="20"
                  cy="20"
                  r="17"
                  strokeDasharray={progressCircumference}
                  strokeDashoffset={progressDashOffset}
                />
              </svg>
              <span>{progress}%</span>
            </div>
            <div>
              <p className="polynet-landing-kicker">Community launch</p>
              <h1 id="community-launch-title">
                {isCreateMode
                  ? "Create community"
                  : `Set up ${effectiveCommunity.name}`}
              </h1>
              <p>{progress}% complete</p>
            </div>
          </div>

          <div className="polynet-onboarding-shell">
            <nav
              className="polynet-onboarding-steps"
              aria-label="Community launch steps"
            >
              {STEP_ORDER.map((step) => {
                const active = step === activeStep;
                const complete = isStepComplete(effectiveStatus, step);
                const disabled = isCreateMode && step !== "profile";
                return (
                  <button
                    key={step}
                    type="button"
                    className={`${active ? "active" : ""}${complete ? " complete" : ""}`}
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      setStepOverride(step);
                      setActiveStep(step);
                      onStepChange?.(step);
                      setStepError(null);
                      setStepSuccess(null);
                    }}
                  >
                    <span className="polynet-onboarding-step-icon">
                      {complete ? (
                        <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                      ) : (
                        STEP_META[step].icon
                      )}
                    </span>
                    <span>{STEP_META[step].label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="polynet-onboarding-step-body">
              <div className="community-launch-step-card">
                <div className="community-launch-step-heading">
                  <h2>{activeTitle}</h2>
                </div>
                {stepError ? (
                  <p className="community-launch-step-message error">
                    {stepError}
                  </p>
                ) : null}
                {stepSuccess ? (
                  <p className="community-launch-step-message success">
                    {stepSuccess}
                  </p>
                ) : null}
                {renderStepEditor()}
                <div
                  className={`community-launch-step-summary${activeComplete ? " complete" : ""}`}
                  aria-label={`${activeMeta.label} progress: ${stepSummary}, ${activeStatus?.completed_items ?? 0} of ${activeStatus?.total_items ?? 0}`}
                >
                  {activeComplete ? (
                    <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                  ) : (
                    <Circle size={10} strokeWidth={2.4} aria-hidden="true" />
                  )}
                  <span>{stepSummary}</span>
                  <span className="community-launch-status-count">
                    {activeStatus?.completed_items ?? 0}/
                    {activeStatus?.total_items ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
