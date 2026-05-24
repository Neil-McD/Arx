import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Bot,
  Check,
  Circle,
  FileText,
  Image,
  Link2,
  LockKeyhole,
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
    draft_pages?: number;
    source_inbox_items?: number;
    missing_default_modules?: string[];
    missing_scaffold_pages?: string[];
    issue_count?: number;
  };
  issues?: {
    unreferencedSources?: unknown[];
    staleDrafts?: unknown[];
    sparsePages?: unknown[];
  };
};

export type CommunityLaunchKnowledgeScaffoldResult = {
  summary?: {
    modules_created?: string[];
    pages_created?: string[];
  };
  health?: CommunityLaunchKnowledgeHealth;
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
  };
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
  web_url?: string | null;
  modified_time?: string | null;
  size?: string | null;
};

export type CommunityLaunchGoogleDriveFileListResult = {
  ok?: boolean;
  connection?: CommunityLaunchGoogleDriveConnection | null;
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
  knowledgeAutoOpenProvider?: "google_drive" | null;
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
  onIngestKnowledgeSources?: () => Promise<CommunityLaunchKnowledgeSourceIngestionResult | null>;
  onLoadKnowledgeGoogleDriveConnection?: () => Promise<CommunityLaunchGoogleDriveConnection | null>;
  onConnectKnowledgeGoogleDrive?: () => Promise<{ ok?: boolean; error_message?: string | null } | null>;
  onListKnowledgeGoogleDriveFiles?: (query?: string | null) => Promise<CommunityLaunchGoogleDriveFileListResult | null>;
  onImportKnowledgeGoogleDriveFiles?: (fileIds: string[]) => Promise<CommunityLaunchGoogleDriveImportResult | null>;
  onKnowledgeAutoOpenHandled?: (provider: "google_drive") => void;
  onLoadKnowledgeGitHubConnection?: () => Promise<CommunityLaunchGitHubConnection | null>;
  onConnectKnowledgeGitHub?: () => Promise<{ ok?: boolean; error_message?: string | null } | null>;
  onListKnowledgeGitHubRepositories?: (query?: string | null) => Promise<CommunityLaunchGitHubRepositoryListResult | null>;
  onListKnowledgeGitHubFiles?: (
    repoFullName: string,
    ref?: string | null,
    query?: string | null,
  ) => Promise<CommunityLaunchGitHubFileListResult | null>;
  onImportKnowledgeGitHubFiles?: (fileIds: string[]) => Promise<CommunityLaunchGitHubImportResult | null>;
  onLoadKnowledgeHealth?: () => Promise<CommunityLaunchKnowledgeHealth | null>;
  onEnsureKnowledgeScaffold?: () => Promise<CommunityLaunchKnowledgeScaffoldResult | null>;
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

export function WebCommunityLaunchSetupModal(
  props: WebCommunityLaunchSetupModalProps,
) {
  const {
    isOpen,
    mode = "setup",
    initialStep = null,
    knowledgeIntegrationReloadKey = null,
    knowledgeAutoOpenProvider = null,
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
    onIngestKnowledgeSources,
    onLoadKnowledgeGoogleDriveConnection,
    onConnectKnowledgeGoogleDrive,
    onListKnowledgeGoogleDriveFiles,
    onImportKnowledgeGoogleDriveFiles,
    onKnowledgeAutoOpenHandled,
    onLoadKnowledgeGitHubConnection,
    onConnectKnowledgeGitHub,
    onListKnowledgeGitHubRepositories,
    onListKnowledgeGitHubFiles,
    onImportKnowledgeGitHubFiles,
    onLoadKnowledgeHealth,
    onEnsureKnowledgeScaffold,
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
  const [knowledgeSourceFileNames, setKnowledgeSourceFileNames] = useState<string[]>([]);
  const [knowledgeSourceDragOver, setKnowledgeSourceDragOver] = useState(false);
  const [knowledgeDriveConnection, setKnowledgeDriveConnection] =
    useState<CommunityLaunchGoogleDriveConnection | null>(null);
  const [knowledgeDriveFiles, setKnowledgeDriveFiles] = useState<CommunityLaunchGoogleDriveFile[]>([]);
  const [knowledgeDriveSelectedIds, setKnowledgeDriveSelectedIds] = useState<string[]>([]);
  const [knowledgeDriveLoading, setKnowledgeDriveLoading] = useState(false);
  const [knowledgeGitHubConnection, setKnowledgeGitHubConnection] =
    useState<CommunityLaunchGitHubConnection | null>(null);
  const [knowledgeGitHubRepositories, setKnowledgeGitHubRepositories] = useState<CommunityLaunchGitHubRepository[]>([]);
  const [knowledgeGitHubSelectedRepository, setKnowledgeGitHubSelectedRepository] =
    useState<CommunityLaunchGitHubRepository | null>(null);
  const [knowledgeGitHubFiles, setKnowledgeGitHubFiles] = useState<CommunityLaunchGitHubFile[]>([]);
  const [knowledgeGitHubSelectedIds, setKnowledgeGitHubSelectedIds] = useState<string[]>([]);
  const [knowledgeGitHubLoading, setKnowledgeGitHubLoading] = useState(false);
  const [knowledgeHealthLoading, setKnowledgeHealthLoading] = useState(false);
  const [agentDraft, setAgentDraft] = useState<CommunityLaunchAgentSaveDraft>({
    systemPrompt: "",
    starterPrompts: ["", "", ""],
  });
  const [accessDraft, setAccessDraft] = useState<CommunityEntryPolicy>("open");

  useEffect(() => {
    if (!isOpen) return;
    setStepOverride(requestedInitialStep);
    setActiveStep(requestedInitialStep ?? (isCreateMode ? "profile" : normalizeActiveStep(status)));
  }, [community?.id, isCreateMode, isOpen, requestedInitialStep]);

  useEffect(() => {
    if (!isOpen || stepOverride) return;
    setActiveStep(isCreateMode ? "profile" : normalizeActiveStep(status));
  }, [isCreateMode, isOpen, status?.current_step, stepOverride]);

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
      setKnowledgeSourceFileNames([]);
      setKnowledgeSourceDragOver(false);
      setKnowledgeDriveConnection(null);
      setKnowledgeDriveFiles([]);
      setKnowledgeDriveSelectedIds([]);
      setKnowledgeDriveLoading(false);
      setKnowledgeGitHubConnection(null);
      setKnowledgeGitHubRepositories([]);
      setKnowledgeGitHubSelectedRepository(null);
      setKnowledgeGitHubFiles([]);
      setKnowledgeGitHubSelectedIds([]);
      setKnowledgeGitHubLoading(false);
      setKnowledgeHealthLoading(false);
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
    setKnowledgeSourceFileNames([]);
    setKnowledgeSourceDragOver(false);
    setKnowledgeDriveConnection(null);
    setKnowledgeDriveFiles([]);
    setKnowledgeDriveSelectedIds([]);
    setKnowledgeDriveLoading(false);
    setKnowledgeGitHubConnection(null);
    setKnowledgeGitHubRepositories([]);
    setKnowledgeGitHubSelectedRepository(null);
    setKnowledgeGitHubFiles([]);
    setKnowledgeGitHubSelectedIds([]);
    setKnowledgeGitHubLoading(false);
    setKnowledgeHealthLoading(false);
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
    if (!isOpen || activeStep !== "knowledge" || !onLoadKnowledgeGoogleDriveConnection) return;
    let cancelled = false;
    setKnowledgeDriveLoading(true);
    void onLoadKnowledgeGoogleDriveConnection()
      .then((connection) => {
        if (!cancelled) setKnowledgeDriveConnection(connection ?? null);
      })
      .catch(() => {
        if (!cancelled) setKnowledgeDriveConnection(null);
      })
      .finally(() => {
        if (!cancelled) setKnowledgeDriveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeStep, isOpen, knowledgeIntegrationReloadKey, onLoadKnowledgeGoogleDriveConnection]);

  useEffect(() => {
    if (!isOpen || activeStep !== "knowledge" || !onLoadKnowledgeGitHubConnection) return;
    let cancelled = false;
    setKnowledgeGitHubLoading(true);
    void onLoadKnowledgeGitHubConnection()
      .then((connection) => {
        if (!cancelled) setKnowledgeGitHubConnection(connection ?? null);
      })
      .catch(() => {
        if (!cancelled) setKnowledgeGitHubConnection(null);
      })
      .finally(() => {
        if (!cancelled) setKnowledgeGitHubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeStep, isOpen, knowledgeIntegrationReloadKey, onLoadKnowledgeGitHubConnection]);

  const createModeStatus = useMemo(
    () =>
      buildCommunityLaunchSetupStatus({
        name: profileDraft.name,
        oneLiner: profileDraft.oneLiner,
        avatarUrl: profileDraft.avatarUrl,
        bannerUrl: profileDraft.bannerUrl,
        about: null,
        hasKnowledgeMaterial: false,
        hasPublishedKnowledge: false,
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

  const loadGoogleDriveFiles = useCallback(async (): Promise<boolean> => {
    if (!onListKnowledgeGoogleDriveFiles) {
      setStepError("Google Drive file selection is unavailable.");
      return false;
    }
    setKnowledgeDriveLoading(true);
    try {
      const result = await onListKnowledgeGoogleDriveFiles();
      if (!result?.ok) throw new Error("Could not load Google Drive files.");
      setKnowledgeDriveConnection(result.connection ?? knowledgeDriveConnection);
      setKnowledgeDriveFiles(result.files ?? []);
      setKnowledgeDriveSelectedIds([]);
      setStepSuccess((result.files ?? []).length > 0 ? "Choose Drive files to import." : "No readable Drive files found.");
      return true;
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Could not load Google Drive files.");
      return false;
    } finally {
      setKnowledgeDriveLoading(false);
    }
  }, [knowledgeDriveConnection, onListKnowledgeGoogleDriveFiles]);

  useEffect(() => {
    if (
      !isOpen ||
      activeStep !== "knowledge" ||
      knowledgeAutoOpenProvider !== "google_drive" ||
      !knowledgeDriveConnection?.connected ||
      knowledgeDriveLoading
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
    knowledgeDriveLoading,
    loadGoogleDriveFiles,
    onKnowledgeAutoOpenHandled,
  ]);

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

  const renderFinishLaterButton = () => (
    <button type="button" className="polynet-onboarding-back" onClick={onClose}>
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
      void runStepSave(
        "profile",
        () => onCreateCommunity(profileDraft),
        "Community created.",
      );
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
    successMessage?: string,
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
    }
  };

  const handleAddKnowledgeLink = (event: FormEvent) => {
    event.preventDefault();
    void saveKnowledgeLinkDrafts("Links added.");
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
      setKnowledgeSourceFileNames(sourceFiles.map((file) => file.name).filter(Boolean));
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
    if (savingStep || knowledgeDriveLoading) return;
    setStepError(null);
    setStepSuccess(null);
    void (async () => {
      if (!knowledgeDriveConnection?.connected) {
        if (!onConnectKnowledgeGoogleDrive) {
          setStepError("Google Drive connection is unavailable.");
          return;
        }
        setKnowledgeDriveLoading(true);
        try {
          const result = await onConnectKnowledgeGoogleDrive();
          if (!result?.ok) {
            setStepError(result?.error_message || "Could not start Google Drive connection.");
          }
        } catch (error) {
          setStepError(error instanceof Error ? error.message : "Could not start Google Drive connection.");
        } finally {
          setKnowledgeDriveLoading(false);
        }
        return;
      }
      await loadGoogleDriveFiles();
    })();
  };

  const handleToggleGoogleDriveFile = (fileId: string) => {
    setKnowledgeDriveSelectedIds((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId].slice(0, COMMUNITY_LAUNCH_MAX_GOOGLE_DRIVE_FILES),
    );
  };

  const handleImportGoogleDriveFiles = () => {
    if (savingStep || knowledgeDriveLoading || knowledgeDriveSelectedIds.length === 0) return;
    if (!onImportKnowledgeGoogleDriveFiles) {
      setStepError("Google Drive import is unavailable.");
      return;
    }
    setSavingStep("knowledge");
    setStepError(null);
    setStepSuccess(null);
    void onImportKnowledgeGoogleDriveFiles(knowledgeDriveSelectedIds)
      .then((result) => {
        const failedIds = new Set(
          (result?.failures ?? [])
            .map((failure) => String(failure.id ?? "").trim())
            .filter(Boolean),
        );
        if (failedIds.size > 0) {
          setKnowledgeDriveSelectedIds((ids) => ids.filter((id) => failedIds.has(id)));
        } else {
          setKnowledgeDriveSelectedIds([]);
          setKnowledgeDriveFiles([]);
        }
        if (result?.imported) {
          setStepSuccess(`${result.imported} Drive source${result.imported === 1 ? "" : "s"} queued.`);
        } else if (!result?.failed) {
          setStepSuccess("Selected Drive files were already queued.");
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

  const handleGitHubPrimaryAction = () => {
    if (savingStep || knowledgeGitHubLoading) return;
    setStepError(null);
    setStepSuccess(null);
    void (async () => {
      if (!knowledgeGitHubConnection?.connected) {
        if (!onConnectKnowledgeGitHub) {
          setStepError("GitHub connection is unavailable.");
          return;
        }
        setKnowledgeGitHubLoading(true);
        try {
          const result = await onConnectKnowledgeGitHub();
          if (!result?.ok) {
            setStepError(result?.error_message || "Could not start GitHub connection.");
          }
        } catch (error) {
          setStepError(error instanceof Error ? error.message : "Could not start GitHub connection.");
        } finally {
          setKnowledgeGitHubLoading(false);
        }
        return;
      }
      if (!onListKnowledgeGitHubRepositories) {
        setStepError("GitHub repository selection is unavailable.");
        return;
      }
      setKnowledgeGitHubLoading(true);
      try {
        const result = await onListKnowledgeGitHubRepositories();
        if (!result?.ok) throw new Error("Could not load GitHub repositories.");
        setKnowledgeGitHubConnection(result.connection ?? knowledgeGitHubConnection);
        setKnowledgeGitHubRepositories(result.repositories ?? []);
        setKnowledgeGitHubSelectedRepository(null);
        setKnowledgeGitHubFiles([]);
        setKnowledgeGitHubSelectedIds([]);
        setStepSuccess(
          (result.repositories ?? []).length > 0
            ? "Choose a GitHub repository."
            : "No GitHub repositories found.",
        );
      } catch (error) {
        setStepError(error instanceof Error ? error.message : "Could not load GitHub repositories.");
      } finally {
        setKnowledgeGitHubLoading(false);
      }
    })();
  };

  const handleSelectGitHubRepository = (repository: CommunityLaunchGitHubRepository) => {
    if (savingStep || knowledgeGitHubLoading || !onListKnowledgeGitHubFiles) return;
    setStepError(null);
    setStepSuccess(null);
    setKnowledgeGitHubLoading(true);
    setKnowledgeGitHubSelectedRepository(repository);
    setKnowledgeGitHubFiles([]);
    setKnowledgeGitHubSelectedIds([]);
    void onListKnowledgeGitHubFiles(repository.full_name, repository.default_branch)
      .then((result) => {
        if (!result?.ok) throw new Error("Could not load GitHub files.");
        setKnowledgeGitHubConnection(result.connection ?? knowledgeGitHubConnection);
        setKnowledgeGitHubFiles(result.files ?? []);
        setStepSuccess(
          (result.files ?? []).length > 0
            ? "Choose GitHub files to import."
            : "No readable GitHub files found.",
        );
      })
      .catch((error) => {
        setStepError(error instanceof Error ? error.message : "Could not load GitHub files.");
      })
      .finally(() => setKnowledgeGitHubLoading(false));
  };

  const handleToggleGitHubFile = (fileId: string) => {
    setKnowledgeGitHubSelectedIds((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId].slice(0, COMMUNITY_LAUNCH_MAX_GITHUB_FILES),
    );
  };

  const handleImportGitHubFiles = () => {
    if (savingStep || knowledgeGitHubLoading || knowledgeGitHubSelectedIds.length === 0) return;
    if (!onImportKnowledgeGitHubFiles) {
      setStepError("GitHub import is unavailable.");
      return;
    }
    setSavingStep("knowledge");
    setStepError(null);
    setStepSuccess(null);
    void onImportKnowledgeGitHubFiles(knowledgeGitHubSelectedIds)
      .then((result) => {
        const failedIds = new Set(
          (result?.failures ?? [])
            .map((failure) => String(failure.id ?? "").trim())
            .filter(Boolean),
        );
        if (failedIds.size > 0) {
          setKnowledgeGitHubSelectedIds((ids) => ids.filter((id) => failedIds.has(id)));
        } else {
          setKnowledgeGitHubSelectedIds([]);
          setKnowledgeGitHubFiles([]);
        }
        if (result?.imported) {
          setStepSuccess(`${result.imported} GitHub source${result.imported === 1 ? "" : "s"} queued.`);
        } else if (!result?.failed) {
          setStepSuccess("Selected GitHub files were already queued.");
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

  const handlePrepareKnowledgeResources = () => {
    if (savingStep || knowledgeHealthLoading) return;
    setStepError(null);
    setStepSuccess(null);
    void (async () => {
      const saved = await saveKnowledgeLinkDrafts();
      if (!saved) return;
      if (
        !onIngestKnowledgeSources ||
        !onLoadKnowledgeHealth ||
        !onGenerateKnowledgePlan ||
        !onApplyKnowledgePlan ||
        !onDraftKnowledgeResources
      ) {
        setStepSuccess(
          "Sources saved. Continue once draft resources are ready in Resources.",
        );
        onOpenStep("knowledge");
        return;
      }
      setSavingStep("knowledge");
      setKnowledgeHealthLoading(true);
      try {
        const ingestionResult = await onIngestKnowledgeSources();
        if (!ingestionResult?.ok) {
          const firstFailure = ingestionResult?.failures?.[0];
          throw new Error(
            firstFailure?.message ||
              ingestionResult?.message ||
              "Could not read source material yet.",
          );
        }
        const currentHealth = await onLoadKnowledgeHealth();
        const missingDefaultModules =
          currentHealth?.summary?.missing_default_modules ?? [];
        const missingScaffoldPages =
          currentHealth?.summary?.missing_scaffold_pages ?? [];
        if (
          onEnsureKnowledgeScaffold &&
          (missingDefaultModules.length > 0 || missingScaffoldPages.length > 0)
        ) {
          await onEnsureKnowledgeScaffold();
        }
        const planResult = await onGenerateKnowledgePlan({
          builderIntent: "",
        });
        if (!planResult?.ok || !planResult.proposal) {
          throw new Error(
            planResult?.message || "Could not prepare draft resources.",
          );
        }
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
        const draftResult = await onDraftKnowledgeResources();
        if (!draftResult?.ok) {
          const firstFailure = draftResult?.failures?.[0];
          throw new Error(
            firstFailure?.message ||
              draftResult?.message ||
              "Could not draft resource content.",
          );
        }
        setStepSuccess(
          draftResult.drafted
            ? "Resources drafted for review."
            : "Draft resources prepared for review.",
        );
        onOpenStep("knowledge");
      } catch (error) {
        setStepError(
          error instanceof Error
            ? error.message
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
                  ? "Create community"
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
      const canAddKnowledgeLink = knowledgeLinkDrafts.some((url) => url.trim());
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
                {knowledgeSourceFileNames.length > 0 ? (
                  <div className="community-launch-knowledge-file-list">
                    {knowledgeSourceFileNames.map((name) => (
                      <span key={name}>{name}</span>
                    ))}
                  </div>
                ) : null}
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
                      className="secondary"
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
                      Add new link
                    </button>
                    <span>
                      {knowledgeLinkDrafts.length}/
                      {COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS}
                    </span>
                    <button
                      type="submit"
                      disabled={!canAddKnowledgeLink || isSavingActiveStep}
                    >
                      {isSavingActiveStep ? "Adding..." : "Add links"}
                    </button>
                  </div>
                </form>
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
                  <button
                    type="button"
                    className={`community-launch-knowledge-integration-chip${knowledgeDriveConnection?.connected ? " is-connected" : ""}`}
                    disabled={
                      isSavingActiveStep ||
                      knowledgeDriveLoading ||
                      (knowledgeDriveConnection?.connected
                        ? !onListKnowledgeGoogleDriveFiles
                        : !onConnectKnowledgeGoogleDrive)
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
                      {knowledgeDriveLoading
                        ? "Loading"
                        : knowledgeDriveConnection?.connected
                          ? "Select files"
                          : "Connect"}
                    </small>
                  </button>
                  <button
                    type="button"
                    className={`community-launch-knowledge-integration-chip${knowledgeGitHubConnection?.connected ? " is-connected" : ""}`}
                    disabled={
                      isSavingActiveStep ||
                      knowledgeGitHubLoading ||
                      (knowledgeGitHubConnection?.connected
                        ? !onListKnowledgeGitHubRepositories
                        : !onConnectKnowledgeGitHub)
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
                      {knowledgeGitHubLoading
                        ? "Loading"
                        : knowledgeGitHubConnection?.connected
                          ? "Select repo"
                          : "Connect"}
                    </small>
                  </button>
                </div>
                {knowledgeDriveConnection?.connected ? (
                  <p className="community-launch-knowledge-integration-note">
                    Connected{knowledgeDriveConnection.email ? ` as ${knowledgeDriveConnection.email}` : ""}.
                  </p>
                ) : null}
                {knowledgeGitHubConnection?.connected ? (
                  <p className="community-launch-knowledge-integration-note">
                    GitHub connected
                    {knowledgeGitHubConnection.login
                      ? ` as ${knowledgeGitHubConnection.login}`
                      : knowledgeGitHubConnection.email
                        ? ` as ${knowledgeGitHubConnection.email}`
                        : ""}
                    .
                  </p>
                ) : null}
                {knowledgeDriveFiles.length > 0 ? (
                  <div className="community-launch-knowledge-drive-picker">
                    {knowledgeDriveFiles.map((file) => (
                      <label key={file.id}>
                        <input
                          type="checkbox"
                          checked={knowledgeDriveSelectedIds.includes(file.id)}
                          onChange={() => handleToggleGoogleDriveFile(file.id)}
                        />
                        <span>{file.name}</span>
                        <small>{file.mime_type.replace("application/vnd.google-apps.", "Google ")}</small>
                      </label>
                    ))}
                    <button
                      type="button"
                      className="secondary"
                      disabled={knowledgeDriveSelectedIds.length === 0 || isSavingActiveStep || knowledgeDriveLoading}
                      onClick={handleImportGoogleDriveFiles}
                    >
                      Import selected
                    </button>
                  </div>
                ) : null}
                {knowledgeGitHubRepositories.length > 0 ? (
                  <div className="community-launch-knowledge-drive-picker">
                    {knowledgeGitHubRepositories.map((repository) => (
                      <button
                        key={repository.id}
                        type="button"
                        className="secondary"
                        disabled={isSavingActiveStep || knowledgeGitHubLoading || !onListKnowledgeGitHubFiles}
                        onClick={() => handleSelectGitHubRepository(repository)}
                      >
                        {repository.full_name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {knowledgeGitHubFiles.length > 0 ? (
                  <div className="community-launch-knowledge-drive-picker">
                    {knowledgeGitHubSelectedRepository ? (
                      <p className="community-launch-knowledge-integration-note">
                        {knowledgeGitHubSelectedRepository.full_name}
                      </p>
                    ) : null}
                    {knowledgeGitHubFiles.map((file) => (
                      <label key={file.id}>
                        <input
                          type="checkbox"
                          checked={knowledgeGitHubSelectedIds.includes(file.id)}
                          onChange={() => handleToggleGitHubFile(file.id)}
                        />
                        <span>{file.path}</span>
                        <small>{file.size ? `${Math.ceil(file.size / 1024)} KB` : file.ref}</small>
                      </label>
                    ))}
                    <button
                      type="button"
                      className="secondary"
                      disabled={knowledgeGitHubSelectedIds.length === 0 || isSavingActiveStep || knowledgeGitHubLoading}
                      onClick={handleImportGitHubFiles}
                    >
                      Import selected
                    </button>
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
