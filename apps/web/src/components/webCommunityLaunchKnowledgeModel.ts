import type {
  CloudCommunityLaunchKnowledgeSource,
  CloudGitHubSourceFile,
  CloudGitHubSourceRepository,
  CloudGoogleDriveSourceFile,
} from "../../../../shared/cloudCommunityAdminGateway";
import type { CommunityWikiArchitectProposal } from "../../../../shared/communityWikiArchitectPrompt";

export type CommunityLaunchKnowledgeOAuthProvider =
  | "google_drive"
  | "github";

export type CommunityLaunchKnowledgeOAuthRedirectRequest = {
  provider: CommunityLaunchKnowledgeOAuthProvider;
  authorizeUrl: string;
  communityId: string;
  communitySlug: string;
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
    url?: string | null;
    message?: string;
  }>;
};

export type CommunityLaunchGoogleDriveConnection = {
  connected: boolean;
  email?: string | null;
  updated_at?: string | null;
};

export type CommunityLaunchGoogleDriveFile = CloudGoogleDriveSourceFile;

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

export type CommunityLaunchKnowledgeImportedSource =
  CloudCommunityLaunchKnowledgeSource;

export type CommunityLaunchGitHubConnection = {
  connected: boolean;
  login?: string | null;
  email?: string | null;
  updated_at?: string | null;
};

export type CommunityLaunchGitHubRepository = CloudGitHubSourceRepository;

export type CommunityLaunchGitHubRepositoryListResult = {
  ok?: boolean;
  connection?: CommunityLaunchGitHubConnection | null;
  repositories?: CommunityLaunchGitHubRepository[];
};

export type CommunityLaunchGitHubFile = CloudGitHubSourceFile;

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

export type WebCommunityLaunchKnowledgeSourceGroups = {
  links: CommunityLaunchKnowledgeImportedSource[];
  files: CommunityLaunchKnowledgeImportedSource[];
  googleDrive: CommunityLaunchKnowledgeImportedSource[];
  github: CommunityLaunchKnowledgeImportedSource[];
};

export type WebCommunityLaunchKnowledgeModel = {
  sources: WebCommunityLaunchKnowledgeSourceGroups;
  sourceActions: {
    addLinks: (
      draft: CommunityLaunchKnowledgeLinkSaveDraft,
    ) => Promise<void>;
    addFiles: (
      draft: CommunityLaunchKnowledgeFileSaveDraft,
    ) => Promise<void>;
    load: () => Promise<void>;
    remove: (resourceId: string) => Promise<boolean | void>;
    ingest: () => Promise<CommunityLaunchKnowledgeSourceIngestionResult | null>;
  };
  googleDrive: {
    loadConnection: () => Promise<CommunityLaunchGoogleDriveConnection | null>;
    connect: () => Promise<{
      ok?: boolean;
      error_message?: string | null;
    } | null>;
    listFiles: (
      request?: CommunityLaunchGoogleDriveFileListRequest | null,
    ) => Promise<CommunityLaunchGoogleDriveFileListResult | null>;
    importFiles: (
      fileIds: string[],
    ) => Promise<CommunityLaunchGoogleDriveImportResult | null>;
    disconnect: () => Promise<CommunityLaunchGoogleDriveConnection | null>;
  };
  github: {
    loadConnection: () => Promise<CommunityLaunchGitHubConnection | null>;
    connect: () => Promise<{
      ok?: boolean;
      error_message?: string | null;
    } | null>;
    listRepositories: (
      query?: string | null,
    ) => Promise<CommunityLaunchGitHubRepositoryListResult | null>;
    listFiles: (
      repoFullName: string,
      ref?: string | null,
      query?: string | null,
    ) => Promise<CommunityLaunchGitHubFileListResult | null>;
    importFiles: (
      fileIds: string[],
    ) => Promise<CommunityLaunchGitHubImportResult | null>;
    disconnect: () => Promise<CommunityLaunchGitHubConnection | null>;
  };
  assembly: {
    generatePlan: (draft: {
      builderIntent: string;
    }) => Promise<CommunityLaunchKnowledgePlanResult | null>;
    applyPlan: (draft: {
      proposal: CommunityWikiArchitectProposal;
    }) => Promise<CommunityLaunchKnowledgePlanApplyResult | null>;
    draftResources: () => Promise<CommunityLaunchKnowledgeContentDraftResult | null>;
  };
};
