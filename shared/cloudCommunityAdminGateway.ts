import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import { coerceGatewayRows, firstGatewayRow, parseGatewayNumberLike } from "./cloudGateway";
import type { CommunityAnalyticsSnapshot } from "./communityTypes";
import type { CommunityMemberOnboardingConfig } from "./communityMemberOnboarding";
import { readConvexRuntimeUrl } from "./convexRuntime";

type CloudCommunityAdminGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityRevenueSeriesRow = {
  bucket_start: string;
  net_base_units: number | string | null;
  currency: string | null;
  currency_decimals: number | null;
};

export type CloudCommunityCreatedAtRow = {
  created_at: string;
};

export type CloudCommunityAnalyticsSummaryRow = {
  page_visits_window: number | null;
  total_members: number | null;
  new_members_window: number | null;
  conversion_rate_window: number | null;
  mrr_base_units: number | null;
  currency: string | null;
  currency_decimals: number | null;
};

export type CloudCommunityMemberBillingHistoryEvent = {
  id: string;
  kind: "checkout" | "subscription" | "subscription_event";
  status: string;
  source: string | null;
  billing_period: "monthly" | "annual" | null;
  amount_base_units: number | null;
  currency: string | null;
  currency_decimals: number | null;
  occurred_at: string;
  created_at: string | null;
  updated_at: string | null;
  current_period_start_at: string | null;
  current_period_end_at: string | null;
  ended_at: string | null;
  cancel_at_period_end: boolean | null;
};

export type CloudCommunityMemberBillingCurrentPlan = {
  status: string;
  source: string | null;
  billing_period: "monthly" | "annual" | null;
  amount_base_units: number | null;
  currency: string | null;
  currency_decimals: number | null;
  current_period_start_at: string | null;
  current_period_end_at: string | null;
  cancel_at_period_end: boolean | null;
};

export type CloudCommunityMemberBillingHistory = {
  community_id: string;
  member_id: string;
  current_plan: CloudCommunityMemberBillingCurrentPlan | null;
  events: CloudCommunityMemberBillingHistoryEvent[];
};

export type CloudCommunitySettingsSaveResult = {
  community_id: string;
  name: string;
  slug: string;
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
  member_onboarding?: CommunityMemberOnboardingConfig | null;
  updated_at: string;
};

export type CloudCommunityMemberOnboardingSaveResult = {
  community_id: string;
  member_onboarding: CommunityMemberOnboardingConfig;
  updated_at: string;
};

export type CloudCommunityOneLinerSaveResult = {
  community_id: string;
  one_liner: string | null;
  updated_at: string;
};

export type CloudCommunityArchiveHealthRow = {
  community_id: string;
  total_documents: number;
  status_counts: {
    pending: number;
    embedded: number;
    failed: number;
  };
  source_counts: {
    chat: number;
    ai_feed: number;
    resource: number;
  };
  pdf_counts: {
    pdf_documents: number;
  };
  last_embedding_updated_at: string | null;
  latest_failure_message: string | null;
};

export type CloudCommunityArchiveBackfillResult = {
  chat: number;
  ai_feed: number;
  resource: number;
};

export type CloudCommunityArchiveProcessResult = {
  processed: number;
  succeeded: number;
  failed: number;
  pdf_extraction_attempted: number;
  pdf_extraction_succeeded: number;
  embedding_model: string | null;
  error: string | null;
};

export type CloudCommunityArchiveRetryResult = CloudCommunityArchiveProcessResult & {
  retried: number;
};

export type CloudCommunitySourceLinkIngestionResult = {
  ok: boolean;
  kind:
    | "community_source_ingestion"
    | "community_source_link_ingestion"
    | "community_source_file_ingestion"
    | "community_source_google_drive_ingestion"
    | "community_source_github_ingestion";
  processed: number;
  succeeded: number;
  failed: number;
  ready_sources: number;
  total_sources: number;
  pending_url_sources: number;
  pending_file_sources?: number;
  pending_google_drive_sources?: number;
  pending_github_sources?: number;
  pending_sources?: number;
  failures: Array<{
    resource_id: string;
    title: string;
    url: string | null;
    message: string;
  }>;
  duration_ms: number;
  code: string | null;
  message: string;
};

export type CloudCommunitySourceIngestionResult = CloudCommunitySourceLinkIngestionResult;

export type CloudGoogleDriveSourceConnectionStatus = {
  provider: "google_drive";
  auth_kind: "oauth_tokens";
  connected: boolean;
  email: string | null;
  account_id: string | null;
  scope: string | null;
  access_token_expires_at: string | null;
  validated_at: string | null;
  updated_at: string | null;
};

export type CloudGoogleDriveSourceFile = {
  id: string;
  name: string;
  mime_type: string;
  kind: "file" | "folder";
  importable: boolean;
  web_url: string | null;
  modified_time: string | null;
  size: string | null;
};

export type CloudGoogleDriveSourceFileListResult = {
  ok: boolean;
  provider: "google_drive";
  connection: CloudGoogleDriveSourceConnectionStatus;
  folder_id: string | null;
  query: string | null;
  next_page_token: string | null;
  files: CloudGoogleDriveSourceFile[];
};

export type CloudGitHubSourceConnectionStatus = {
  provider: "github";
  auth_kind: "oauth_tokens";
  connected: boolean;
  email: string | null;
  login: string | null;
  account_id: string | null;
  scope: string | null;
  access_token_expires_at: string | null;
  validated_at: string | null;
  updated_at: string | null;
};

export type CloudGitHubSourceRepository = {
  id: string;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  web_url: string | null;
  default_branch: string;
  updated_at: string | null;
  pushed_at: string | null;
};

export type CloudGitHubSourceRepositoryListResult = {
  ok: boolean;
  provider: "github";
  connection: CloudGitHubSourceConnectionStatus;
  repositories: CloudGitHubSourceRepository[];
};

export type CloudGitHubSourceFile = {
  id: string;
  repo_full_name: string;
  path: string;
  name: string;
  ref: string;
  sha: string | null;
  size: number | null;
  web_url: string | null;
};

export type CloudGitHubSourceFileListResult = {
  ok: boolean;
  provider: "github";
  connection: CloudGitHubSourceConnectionStatus;
  repo_full_name: string | null;
  ref: string | null;
  truncated: boolean;
  file_limit: number | null;
  files: CloudGitHubSourceFile[];
};

export type CloudCommunityLaunchKnowledgeSource = {
  id: string;
  title: string;
  source_ingestion_status: "not_required" | "queued" | "processing" | "ready" | "failed";
  source_ingestion_kind: "manual" | "url" | "file" | "google_drive" | "github";
  source_ingestion_error: string | null;
  source_external_provider: "google_drive" | "github" | null;
  source_external_id: string | null;
  source_external_name: string | null;
  source_external_url: string | null;
  source_external_mime_type: string | null;
  source_external_modified_at: string | null;
  credential_status: "available" | "missing";
  credential_message: string | null;
  updated_at: string | null;
};

export type CloudCommunityLaunchKnowledgeSourceListResult = {
  ok: boolean;
  kind: "community_launch_knowledge_sources";
  community_id: string | null;
  sources: CloudCommunityLaunchKnowledgeSource[];
};

type CloudCommunityFreeAccessModeResult = {
  community_id?: string;
  entry_policy?: "open" | "approval" | "paid_subscription";
  updated_at?: string;
};

export type CloudCommunityBrandingKind = "avatar" | "banner";

export type CloudCommunityBrandingFieldInput = {
  storageId?: string | null;
  url?: string | null;
};

function isInlineImageDataUrl(raw: unknown): raw is string {
  return String(raw ?? "").trim().toLowerCase().startsWith("data:image/");
}

function dataUrlToUploadPayload(dataUrl: string): { blob: Blob; mimeType: string } {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }
  const mimeType = match[1]!.trim() || "application/octet-stream";
  const base64 = match[2]!.trim();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return {
    blob: new Blob([bytes], { type: mimeType }),
    mimeType,
  };
}

async function requestCloudCommunityBrandingUploadUrl<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    kind: CloudCommunityBrandingKind;
  },
): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:generateCommunityBrandingUploadUrl" as any, {
    authSubject,
    kind: params.kind,
  });
  const uploadUrl =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? String((payload as Record<string, unknown>).uploadUrl ?? "").trim()
      : "";
  if (!uploadUrl) {
    throw new Error("Failed to start image upload.");
  }
  return uploadUrl;
}

async function uploadCloudCommunityBrandingDataUrl<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    kind: CloudCommunityBrandingKind;
    dataUrl: string;
  },
): Promise<string> {
  const uploadUrl = await requestCloudCommunityBrandingUploadUrl({
    session: params.session,
    kind: params.kind,
  });
  const { blob, mimeType } = dataUrlToUploadPayload(params.dataUrl);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
    },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Failed to upload ${params.kind}.`);
  }
  const payload = (await response.json()) as { storageId?: string | null };
  const storageId = String(payload?.storageId ?? "").trim();
  if (!storageId) {
    throw new Error(`Failed to upload ${params.kind}.`);
  }
  return storageId;
}

async function requestCloudCommunityResourceSourceUploadUrl<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:generateCommunityResourceSourceUploadUrl" as any, {
    authSubject,
    communityId: params.communityId,
  });
  const uploadUrl =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? String((payload as Record<string, unknown>).uploadUrl ?? "").trim()
      : "";
  if (!uploadUrl) {
    throw new Error("Failed to start source upload.");
  }
  return uploadUrl;
}

export async function uploadCloudCommunityResourceSourceFile<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    file: File | Blob;
  },
): Promise<string> {
  const uploadUrl = await requestCloudCommunityResourceSourceUploadUrl({
    session: params.session,
    communityId: params.communityId,
  });
  const contentType =
    params.file && typeof params.file === "object" && "type" in params.file
      ? String((params.file as File | Blob).type ?? "").trim() || "application/octet-stream"
      : "application/octet-stream";
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: params.file as BodyInit,
  });
  if (!response.ok) {
    throw new Error("Failed to upload source file.");
  }
  const payload = (await response.json()) as { storageId?: string | null };
  const storageId = String(payload?.storageId ?? "").trim();
  if (!storageId) {
    throw new Error("Failed to upload source file.");
  }
  return storageId;
}

function normalizeGoogleDriveSourceConnection(payload: unknown): CloudGoogleDriveSourceConnectionStatus {
  const row = (payload ?? null) as Partial<CloudGoogleDriveSourceConnectionStatus> | null;
  return {
    provider: "google_drive",
    auth_kind: "oauth_tokens",
    connected: row?.connected === true,
    email: typeof row?.email === "string" && row.email.trim() ? row.email.trim() : null,
    account_id: typeof row?.account_id === "string" && row.account_id.trim() ? row.account_id.trim() : null,
    scope: typeof row?.scope === "string" && row.scope.trim() ? row.scope.trim() : null,
    access_token_expires_at:
      typeof row?.access_token_expires_at === "string" && row.access_token_expires_at.trim()
        ? row.access_token_expires_at.trim()
        : null,
    validated_at:
      typeof row?.validated_at === "string" && row.validated_at.trim()
        ? row.validated_at.trim()
        : null,
    updated_at:
      typeof row?.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at.trim()
        : null,
  };
}

function normalizeGoogleDriveSourceFiles(payload: unknown): CloudGoogleDriveSourceFile[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => {
      const record = (row ?? null) as Record<string, unknown> | null;
      const id = typeof record?.id === "string" ? record.id.trim() : "";
      const name = typeof record?.name === "string" ? record.name.trim() : "";
      const mimeType = typeof record?.mime_type === "string" ? record.mime_type.trim() : "";
      if (!id || !name || !mimeType) return null;
      const kind = record?.kind === "folder" ? "folder" : "file";
      return {
        id,
        name,
        mime_type: mimeType,
        kind,
        importable: kind === "file" && record?.importable !== false,
        web_url: typeof record?.web_url === "string" && record.web_url.trim() ? record.web_url.trim() : null,
        modified_time:
          typeof record?.modified_time === "string" && record.modified_time.trim()
            ? record.modified_time.trim()
            : null,
        size: typeof record?.size === "string" && record.size.trim() ? record.size.trim() : null,
      } satisfies CloudGoogleDriveSourceFile;
    })
    .filter((row): row is CloudGoogleDriveSourceFile => Boolean(row));
}

function normalizeGitHubSourceConnection(payload: unknown): CloudGitHubSourceConnectionStatus {
  const row = (payload ?? null) as Partial<CloudGitHubSourceConnectionStatus> | null;
  return {
    provider: "github",
    auth_kind: "oauth_tokens",
    connected: row?.connected === true,
    email: typeof row?.email === "string" && row.email.trim() ? row.email.trim() : null,
    login: typeof row?.login === "string" && row.login.trim() ? row.login.trim() : null,
    account_id: typeof row?.account_id === "string" && row.account_id.trim() ? row.account_id.trim() : null,
    scope: typeof row?.scope === "string" && row.scope.trim() ? row.scope.trim() : null,
    access_token_expires_at:
      typeof row?.access_token_expires_at === "string" && row.access_token_expires_at.trim()
        ? row.access_token_expires_at.trim()
        : null,
    validated_at:
      typeof row?.validated_at === "string" && row.validated_at.trim()
        ? row.validated_at.trim()
        : null,
    updated_at:
      typeof row?.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at.trim()
        : null,
  };
}

function normalizeGitHubSourceRepositories(payload: unknown): CloudGitHubSourceRepository[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => {
      const record = (row ?? null) as Record<string, unknown> | null;
      const id = typeof record?.id === "string" ? record.id.trim() : "";
      const name = typeof record?.name === "string" ? record.name.trim() : "";
      const fullName = typeof record?.full_name === "string" ? record.full_name.trim() : "";
      const owner = typeof record?.owner === "string" ? record.owner.trim() : "";
      const defaultBranch =
        typeof record?.default_branch === "string" && record.default_branch.trim()
          ? record.default_branch.trim()
          : "main";
      if (!id || !name || !fullName || !owner) return null;
      return {
        id,
        name,
        full_name: fullName,
        owner,
        private: record?.private === true,
        web_url: typeof record?.web_url === "string" && record.web_url.trim() ? record.web_url.trim() : null,
        default_branch: defaultBranch,
        updated_at: typeof record?.updated_at === "string" && record.updated_at.trim()
          ? record.updated_at.trim()
          : null,
        pushed_at: typeof record?.pushed_at === "string" && record.pushed_at.trim()
          ? record.pushed_at.trim()
          : null,
      } satisfies CloudGitHubSourceRepository;
    })
    .filter((row): row is CloudGitHubSourceRepository => Boolean(row));
}

function normalizeGitHubSourceFiles(payload: unknown): CloudGitHubSourceFile[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => {
      const record = (row ?? null) as Record<string, unknown> | null;
      const id = typeof record?.id === "string" ? record.id.trim() : "";
      const repoFullName = typeof record?.repo_full_name === "string" ? record.repo_full_name.trim() : "";
      const path = typeof record?.path === "string" ? record.path.trim() : "";
      const name = typeof record?.name === "string" ? record.name.trim() : "";
      const ref = typeof record?.ref === "string" ? record.ref.trim() : "";
      if (!id || !repoFullName || !path || !name || !ref) return null;
      return {
        id,
        repo_full_name: repoFullName,
        path,
        name,
        ref,
        sha: typeof record?.sha === "string" && record.sha.trim() ? record.sha.trim() : null,
        size: typeof record?.size === "number" && Number.isFinite(record.size)
          ? Math.max(0, Math.floor(record.size))
          : null,
        web_url: typeof record?.web_url === "string" && record.web_url.trim() ? record.web_url.trim() : null,
      } satisfies CloudGitHubSourceFile;
    })
    .filter((row): row is CloudGitHubSourceFile => Boolean(row));
}

function normalizeCommunityLaunchKnowledgeSources(payload: unknown): CloudCommunityLaunchKnowledgeSource[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => {
      const record = (row ?? null) as Record<string, unknown> | null;
      const id = typeof record?.id === "string" ? record.id.trim() : "";
      const title = typeof record?.title === "string" ? record.title.trim() : "";
      const provider = record?.source_external_provider === "github"
        ? "github"
        : record?.source_external_provider === "google_drive"
          ? "google_drive"
          : null;
      const status = (
        record?.source_ingestion_status === "not_required" ||
        record?.source_ingestion_status === "queued" ||
        record?.source_ingestion_status === "processing" ||
        record?.source_ingestion_status === "ready" ||
        record?.source_ingestion_status === "failed"
      )
        ? record.source_ingestion_status
        : "queued";
      const kind = (
        record?.source_ingestion_kind === "manual" ||
        record?.source_ingestion_kind === "url" ||
        record?.source_ingestion_kind === "file" ||
        record?.source_ingestion_kind === "google_drive" ||
        record?.source_ingestion_kind === "github"
      )
        ? record.source_ingestion_kind
        : provider ?? "manual";
      if (!id || !title) return null;
      return {
        id,
        title,
        source_ingestion_status: status,
        source_ingestion_kind: kind,
        source_ingestion_error:
          typeof record?.source_ingestion_error === "string" && record.source_ingestion_error.trim()
            ? record.source_ingestion_error.trim()
            : null,
        source_external_provider: provider,
        source_external_id:
          typeof record?.source_external_id === "string" && record.source_external_id.trim()
            ? record.source_external_id.trim()
            : null,
        source_external_name:
          typeof record?.source_external_name === "string" && record.source_external_name.trim()
            ? record.source_external_name.trim()
            : null,
        source_external_url:
          typeof record?.source_external_url === "string" && record.source_external_url.trim()
            ? record.source_external_url.trim()
            : null,
        source_external_mime_type:
          typeof record?.source_external_mime_type === "string" && record.source_external_mime_type.trim()
            ? record.source_external_mime_type.trim()
            : null,
        source_external_modified_at:
          typeof record?.source_external_modified_at === "string" && record.source_external_modified_at.trim()
            ? record.source_external_modified_at.trim()
            : null,
        credential_status: !provider || record?.credential_status === "available" ? "available" : "missing",
        credential_message:
          typeof record?.credential_message === "string" && record.credential_message.trim()
            ? record.credential_message.trim()
            : null,
        updated_at:
          typeof record?.updated_at === "string" && record.updated_at.trim()
            ? record.updated_at.trim()
            : null,
      } satisfies CloudCommunityLaunchKnowledgeSource;
    })
    .filter((row): row is CloudCommunityLaunchKnowledgeSource => Boolean(row));
}

export async function listCloudCommunityLaunchKnowledgeSources<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<CloudCommunityLaunchKnowledgeSourceListResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.query("community:listCommunityLaunchKnowledgeSources" as any, {
    authSubject,
    communityId: params.communityId,
    limit: typeof params.limit === "number" && Number.isFinite(params.limit)
      ? Math.max(1, Math.floor(params.limit))
      : undefined,
  })) as Record<string, unknown> | null;
  return {
    ok: payload?.ok === true,
    kind: "community_launch_knowledge_sources",
    community_id:
      typeof payload?.community_id === "string" && payload.community_id.trim()
        ? payload.community_id.trim()
        : null,
    sources: normalizeCommunityLaunchKnowledgeSources(payload?.sources),
  };
}

export async function loadCloudCommunityGoogleDriveSourceConnection<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudGoogleDriveSourceConnectionStatus> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getGoogleDriveSourceConnectionStatus" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return normalizeGoogleDriveSourceConnection(payload);
}

export async function beginCloudCommunityGoogleDriveSourceOAuth<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    returnToPath?: string | null;
  },
): Promise<{
  ok: boolean;
  provider: "google_drive";
  authorize_url: string | null;
  redirect_uri: string | null;
  error_message: string | null;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:beginGoogleDriveSourceOAuth" as any, {
    authSubject,
    communityId: params.communityId,
    returnToPath: String(params.returnToPath ?? "").trim() || "/discover",
    callbackBaseUrl: readConvexRuntimeUrl() ?? undefined,
  })) as Record<string, unknown> | null;
  const authorizeUrl = typeof payload?.authorize_url === "string" ? payload.authorize_url.trim() : "";
  return {
    ok: payload?.ok === true && Boolean(authorizeUrl),
    provider: "google_drive",
    authorize_url: authorizeUrl || null,
    redirect_uri: typeof payload?.redirect_uri === "string" && payload.redirect_uri.trim()
      ? payload.redirect_uri.trim()
      : null,
    error_message: authorizeUrl ? null : "Google Drive authorization URL was not returned.",
  };
}

export async function disconnectCloudCommunityGoogleDriveSourceConnection<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudGoogleDriveSourceConnectionStatus> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("community:disconnectGoogleDriveSourceConnection" as any, {
    authSubject,
    communityId: params.communityId,
  })) as Record<string, unknown> | null;
  return normalizeGoogleDriveSourceConnection(payload?.connection);
}

export async function finalizeCloudCommunityGoogleDriveSourceOAuth<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    state: string;
    finalizeToken: string;
  },
): Promise<{
  ok: boolean;
  provider: "google_drive";
  community_id: string | null;
  return_context_kind: "community_launch_knowledge" | null;
  email: string | null;
  error_message: string | null;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:finalizeGoogleDriveSourceOAuth" as any, {
    authSubject,
    state: params.state,
    finalizeToken: params.finalizeToken,
  })) as Record<string, unknown> | null;
  return {
    ok: payload?.ok === true,
    provider: "google_drive",
    community_id:
      typeof payload?.community_id === "string" && payload.community_id.trim()
        ? payload.community_id.trim()
        : null,
    return_context_kind:
      payload?.return_context_kind === "community_launch_knowledge"
        ? "community_launch_knowledge"
        : null,
    email: typeof payload?.email === "string" && payload.email.trim() ? payload.email.trim() : null,
    error_message:
      typeof payload?.error_message === "string" && payload.error_message.trim()
        ? payload.error_message.trim()
        : null,
  };
}

export async function listCloudCommunityGoogleDriveSourceFiles<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    folderId?: string | null;
    pageToken?: string | null;
    query?: string | null;
  },
): Promise<CloudGoogleDriveSourceFileListResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:listGoogleDriveSourceFiles" as any, {
    authSubject,
    communityId: params.communityId,
    folderId: String(params.folderId ?? "").trim() || undefined,
    pageToken: String(params.pageToken ?? "").trim() || undefined,
    query: String(params.query ?? "").trim() || undefined,
  })) as Record<string, unknown> | null;
  return {
    ok: payload?.ok === true,
    provider: "google_drive",
    connection: normalizeGoogleDriveSourceConnection(payload?.connection),
    folder_id:
      typeof payload?.folder_id === "string" && payload.folder_id.trim()
        ? payload.folder_id.trim()
        : null,
    query: typeof payload?.query === "string" && payload.query.trim() ? payload.query.trim() : null,
    next_page_token:
      typeof payload?.next_page_token === "string" && payload.next_page_token.trim()
        ? payload.next_page_token.trim()
        : null,
    files: normalizeGoogleDriveSourceFiles(payload?.files),
  };
}

export async function importCloudCommunityGoogleDriveSourceFiles<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    fileIds: string[];
  },
): Promise<{
  ok: boolean;
  provider: "google_drive";
  imported: number;
  skipped: number;
  failed: number;
  failures: Array<{ id: string; name: string | null; message: string }>;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:importGoogleDriveSourceFiles" as any, {
    authSubject,
    communityId: params.communityId,
    fileIds: params.fileIds,
  })) as Record<string, unknown> | null;
  return {
    ok: payload?.ok === true,
    provider: "google_drive",
    imported: typeof payload?.imported === "number" && Number.isFinite(payload.imported)
      ? Math.max(0, Math.floor(payload.imported))
      : 0,
    skipped: typeof payload?.skipped === "number" && Number.isFinite(payload.skipped)
      ? Math.max(0, Math.floor(payload.skipped))
      : 0,
    failed: typeof payload?.failed === "number" && Number.isFinite(payload.failed)
      ? Math.max(0, Math.floor(payload.failed))
      : 0,
    failures: Array.isArray(payload?.failures)
      ? payload.failures
          .map((failure) => {
            const row = failure as Record<string, unknown>;
            return {
              id: String(row.id ?? "").trim(),
              name: row.name == null ? null : String(row.name).trim() || null,
              message: String(row.message ?? "").trim() || "Google Drive file import failed.",
            };
          })
          .filter((failure) => failure.id)
      : [],
  };
}

export async function loadCloudCommunityGitHubSourceConnection<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudGitHubSourceConnectionStatus> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getGitHubSourceConnectionStatus" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return normalizeGitHubSourceConnection(payload);
}

export async function beginCloudCommunityGitHubSourceOAuth<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    returnToPath?: string | null;
  },
): Promise<{
  ok: boolean;
  provider: "github";
  authorize_url: string | null;
  redirect_uri: string | null;
  error_message: string | null;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:beginGitHubSourceOAuth" as any, {
    authSubject,
    communityId: params.communityId,
    returnToPath: String(params.returnToPath ?? "").trim() || "/discover",
    callbackBaseUrl: readConvexRuntimeUrl() ?? undefined,
  })) as Record<string, unknown> | null;
  const authorizeUrl = typeof payload?.authorize_url === "string" ? payload.authorize_url.trim() : "";
  return {
    ok: payload?.ok === true && Boolean(authorizeUrl),
    provider: "github",
    authorize_url: authorizeUrl || null,
    redirect_uri: typeof payload?.redirect_uri === "string" && payload.redirect_uri.trim()
      ? payload.redirect_uri.trim()
      : null,
    error_message: authorizeUrl ? null : "GitHub authorization URL was not returned.",
  };
}

export async function disconnectCloudCommunityGitHubSourceConnection<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudGitHubSourceConnectionStatus> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("community:disconnectGitHubSourceConnection" as any, {
    authSubject,
    communityId: params.communityId,
  })) as Record<string, unknown> | null;
  return normalizeGitHubSourceConnection(payload?.connection);
}

export async function finalizeCloudCommunityGitHubSourceOAuth<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    state: string;
    finalizeToken: string;
  },
): Promise<{
  ok: boolean;
  provider: "github";
  community_id: string | null;
  return_context_kind: "community_launch_knowledge" | null;
  login: string | null;
  email: string | null;
  error_message: string | null;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:finalizeGitHubSourceOAuth" as any, {
    authSubject,
    state: params.state,
    finalizeToken: params.finalizeToken,
  })) as Record<string, unknown> | null;
  return {
    ok: payload?.ok === true,
    provider: "github",
    community_id:
      typeof payload?.community_id === "string" && payload.community_id.trim()
        ? payload.community_id.trim()
        : null,
    return_context_kind:
      payload?.return_context_kind === "community_launch_knowledge"
        ? "community_launch_knowledge"
        : null,
    login: typeof payload?.login === "string" && payload.login.trim() ? payload.login.trim() : null,
    email: typeof payload?.email === "string" && payload.email.trim() ? payload.email.trim() : null,
    error_message:
      typeof payload?.error_message === "string" && payload.error_message.trim()
        ? payload.error_message.trim()
        : null,
  };
}

export async function listCloudCommunityGitHubSourceRepositories<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    query?: string | null;
  },
): Promise<CloudGitHubSourceRepositoryListResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:listGitHubSourceRepositories" as any, {
    authSubject,
    communityId: params.communityId,
    query: String(params.query ?? "").trim() || undefined,
  })) as Record<string, unknown> | null;
  return {
    ok: payload?.ok === true,
    provider: "github",
    connection: normalizeGitHubSourceConnection(payload?.connection),
    repositories: normalizeGitHubSourceRepositories(payload?.repositories),
  };
}

export async function listCloudCommunityGitHubSourceFiles<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    repoFullName: string;
    ref?: string | null;
    query?: string | null;
  },
): Promise<CloudGitHubSourceFileListResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:listGitHubSourceFiles" as any, {
    authSubject,
    communityId: params.communityId,
    repoFullName: params.repoFullName,
    ref: String(params.ref ?? "").trim() || undefined,
    query: String(params.query ?? "").trim() || undefined,
  })) as Record<string, unknown> | null;
  return {
    ok: payload?.ok === true,
    provider: "github",
    connection: normalizeGitHubSourceConnection(payload?.connection),
    repo_full_name:
      typeof payload?.repo_full_name === "string" && payload.repo_full_name.trim()
        ? payload.repo_full_name.trim()
        : null,
    ref: typeof payload?.ref === "string" && payload.ref.trim() ? payload.ref.trim() : null,
    truncated: payload?.truncated === true,
    file_limit:
      typeof payload?.file_limit === "number" && Number.isFinite(payload.file_limit)
        ? Math.max(1, Math.floor(payload.file_limit))
        : null,
    files: normalizeGitHubSourceFiles(payload?.files),
  };
}

export async function importCloudCommunityGitHubSourceFiles<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    fileIds: string[];
  },
): Promise<{
  ok: boolean;
  provider: "github";
  imported: number;
  skipped: number;
  failed: number;
  failures: Array<{ id: string; name: string | null; message: string }>;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:importGitHubSourceFiles" as any, {
    authSubject,
    communityId: params.communityId,
    fileIds: params.fileIds,
  })) as Record<string, unknown> | null;
  return {
    ok: payload?.ok === true,
    provider: "github",
    imported: typeof payload?.imported === "number" && Number.isFinite(payload.imported)
      ? Math.max(0, Math.floor(payload.imported))
      : 0,
    skipped: typeof payload?.skipped === "number" && Number.isFinite(payload.skipped)
      ? Math.max(0, Math.floor(payload.skipped))
      : 0,
    failed: typeof payload?.failed === "number" && Number.isFinite(payload.failed)
      ? Math.max(0, Math.floor(payload.failed))
      : 0,
    failures: Array.isArray(payload?.failures)
      ? payload.failures
          .map((failure) => {
            const row = failure as Record<string, unknown>;
            return {
              id: String(row.id ?? "").trim(),
              name: row.name == null ? null : String(row.name).trim() || null,
              message: String(row.message ?? "").trim() || "GitHub file import failed.",
            };
          })
          .filter((failure) => failure.id)
      : [],
  };
}

export async function prepareCloudCommunityBrandingField<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    kind: CloudCommunityBrandingKind;
    nextValue: string | null | undefined;
    currentStorageId?: string | null;
    currentResolvedUrl?: string | null;
  },
): Promise<CloudCommunityBrandingFieldInput> {
  const trimmedNext = String(params.nextValue ?? "").trim();
  if (!trimmedNext) {
    return {
      storageId: null,
      url: null,
    };
  }
  if (isInlineImageDataUrl(trimmedNext)) {
    const storageId = await uploadCloudCommunityBrandingDataUrl({
      session: params.session,
      kind: params.kind,
      dataUrl: trimmedNext,
    });
    return {
      storageId,
      url: null,
    };
  }
  const currentStorageId = String(params.currentStorageId ?? "").trim();
  const currentResolvedUrl = String(params.currentResolvedUrl ?? "").trim();
  if (currentStorageId && currentResolvedUrl && trimmedNext === currentResolvedUrl) {
    return {
      storageId: currentStorageId,
      url: null,
    };
  }
  return {
    storageId: null,
    url: trimmedNext,
  };
}

export async function listCloudCommunityRevenueSeriesRows<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    range: string;
  },
): Promise<CloudCommunityRevenueSeriesRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityRevenueSeries" as any, {
    authSubject,
    communityId: params.communityId,
    range: params.range,
  });
  return coerceGatewayRows<CloudCommunityRevenueSeriesRow>(payload);
}

export async function listCloudCommunityFunnelVisitCreatedAtRows<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    sinceIso?: string | null;
    limit?: number;
  },
): Promise<CloudCommunityCreatedAtRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityFunnelVisitCreatedAtRows" as any, {
    authSubject,
    communityId: params.communityId,
    sinceIso: params.sinceIso ?? null,
    limit: params.limit,
  });
  return coerceGatewayRows<CloudCommunityCreatedAtRow>(payload);
}

export async function fetchCloudCommunityAnalyticsSummary<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    range: string;
  },
): Promise<CloudCommunityAnalyticsSummaryRow | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityAnalyticsSummary" as any, {
    authSubject,
    communityId: params.communityId,
    range: params.range,
  });
  return firstGatewayRow<CloudCommunityAnalyticsSummaryRow>(payload);
}

export async function fetchCloudCommunityAnalyticsSnapshot<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    range: string;
  },
): Promise<CommunityAnalyticsSnapshot | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityAnalyticsSnapshot" as any, {
    authSubject,
    communityId: params.communityId,
    range: params.range,
  });
  return firstGatewayRow<CommunityAnalyticsSnapshot>(payload);
}

export async function fetchCloudCommunityMemberBillingHistory<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    membershipId: string;
    limit?: number;
  },
): Promise<CloudCommunityMemberBillingHistory | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityMemberBillingHistory" as any, {
    authSubject,
    communityId: params.communityId,
    targetMembershipId: params.membershipId,
    limit: params.limit ?? 20,
  });
  return firstGatewayRow<CloudCommunityMemberBillingHistory>(payload);
}

export async function setCloudCommunityMemberRole<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    membershipId: string;
    role: "admin" | "moderator" | "member";
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:setCommunityMemberRole" as any, {
    authSubject,
    communityId: params.communityId,
    targetMembershipId: params.membershipId,
    role: params.role,
  });
}

export async function removeCloudCommunityMember<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    membershipId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.action("community:removeCommunityMember" as any, {
    authSubject,
    communityId: params.communityId,
    targetMembershipId: params.membershipId,
  });
}

export async function banCloudCommunityMember<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    membershipId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.action("community:banCommunityMember" as any, {
    authSubject,
    communityId: params.communityId,
    targetMembershipId: params.membershipId,
  });
}

export async function countCloudCommunityResourceRows<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    sinceIso?: string | null;
  },
): Promise<number | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  try {
    const payload = await client.query("community:countCommunityResources" as any, {
      authSubject,
      communityId: params.communityId,
      sinceIso: params.sinceIso ?? null,
    });
    return parseGatewayNumberLike(payload);
  } catch {
    return null;
  }
}

export async function listCloudCommunityJoinRequestRows<SessionT, TJoinRequest = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TJoinRequest[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityJoinRequests" as any, {
    authSubject,
    communityId: params.communityId,
    limit: 200,
    includeStatuses: ["pending"],
  });
  return coerceGatewayRows<TJoinRequest>(payload);
}

export async function fetchCloudCommunityMemberSettingsRow<SessionT, TRow = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TRow | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityMemberSettings" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<TRow>(payload);
}

export async function approveCloudCommunityJoinRequest<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    requestId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:approveCommunityJoinRequest" as any, {
    authSubject,
    requestId: params.requestId,
  });
}

export async function denyCloudCommunityJoinRequest<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    requestId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:denyCommunityJoinRequest" as any, {
    authSubject,
    requestId: params.requestId,
  });
}

export async function listCloudCommunityPricePointRows<SessionT, TPricingRow = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TPricingRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityPricePoints" as any, {
    authSubject,
    communityId: params.communityId,
    activeOnly: true,
  });
  return coerceGatewayRows<TPricingRow>(payload);
}

export async function listCloudCommunityResourceRows<SessionT, TResource = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<TResource[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityResources" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : 200,
  });
  return coerceGatewayRows<TResource>(payload);
}

export async function listCloudCommunityResourceModuleRows<SessionT, TModule = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<TModule[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityResourceModules" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : 200,
  });
  return coerceGatewayRows<TModule>(payload);
}

export async function saveCloudCommunityResource<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    resourceId: string | null;
    isPatch: boolean;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:saveCommunityResource" as any, {
    authSubject,
    resourceId: params.resourceId,
    isPatch: params.isPatch,
    payload: params.payload,
  });
}

export async function createCloudCommunityResourcePageDraftFromSource<SessionT, TResource = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    sourceResourceId: string;
  },
): Promise<TResource> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:createCommunityResourcePageDraftFromSource" as any, {
    authSubject,
    sourceResourceId: params.sourceResourceId,
  });
  return payload as TResource;
}

export async function getCloudCommunityResourceBuilderHealth<SessionT, THealth = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<THealth> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityResourceBuilderHealth" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return payload as THealth;
}

export async function ensureCloudCommunityResourceWikiScaffold<SessionT, TResult = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:ensureCommunityResourceWikiScaffold" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return payload as TResult;
}

export async function ingestCloudCommunitySourceLinks<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<CloudCommunitySourceLinkIngestionResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("community:ingestCommunitySourceLinks" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : undefined,
    retryFailed: true,
  });
  return firstGatewayRow<CloudCommunitySourceLinkIngestionResult>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunitySourceLinkIngestionResult)
      : null);
}

export async function ingestCloudCommunitySources<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<CloudCommunitySourceIngestionResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("community:ingestCommunitySources" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : undefined,
    retryFailed: true,
  });
  return firstGatewayRow<CloudCommunitySourceIngestionResult>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunitySourceIngestionResult)
      : null);
}

export async function runCloudCommunityWikiArchitectProposal<SessionT, TResult = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    builderIntent?: string | null;
  },
): Promise<TResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("community:runCommunityWikiArchitectProposal" as any, {
    authSubject,
    communityId: params.communityId,
    builderIntent:
      typeof params.builderIntent === "string" && params.builderIntent.trim()
        ? params.builderIntent.trim()
        : null,
  });
  return payload as TResult;
}

export async function applyCloudCommunityWikiArchitectProposal<SessionT, TResult = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    proposal: unknown;
  },
): Promise<TResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:applyCommunityWikiArchitectProposal" as any, {
    authSubject,
    communityId: params.communityId,
    proposal: params.proposal,
  });
  return payload as TResult;
}

export async function draftCloudCommunityResourceContentFromSources<SessionT, TResult = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<TResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("community:draftCommunityResourceContentFromSources" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : undefined,
  });
  return payload as TResult;
}

export async function saveCloudCommunityResourceModule<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    moduleId: string | null;
    isPatch: boolean;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:saveCommunityResourceModule" as any, {
    authSubject,
    moduleId: params.moduleId,
    isPatch: params.isPatch,
    payload: params.payload,
  });
}

export async function reorderCloudCommunityResourceModules<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    moduleIds: string[];
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:reorderCommunityResourceModules" as any, {
    authSubject,
    communityId: params.communityId,
    moduleIds: params.moduleIds,
  });
}

export async function reorderCloudCommunityResources<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    moduleId: string | null;
    resourceIds: string[];
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:reorderCommunityResources" as any, {
    authSubject,
    communityId: params.communityId,
    moduleId: params.moduleId,
    resourceIds: params.resourceIds,
  });
}

export async function deleteCloudCommunityResource<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    resourceId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:deleteCommunityResource" as any, {
    authSubject,
    resourceId: params.resourceId,
  });
}

export async function deleteCloudCommunityResourceModule<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    moduleId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:deleteCommunityResourceModule" as any, {
    authSubject,
    moduleId: params.moduleId,
  });
}

export async function createCloudCommunity<SessionT, TCommunity = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    name: string;
    slug: string;
    visibility: string;
    avatarStorageId?: string | null;
    avatarUrl?: string | null;
    avatarFocusX?: number | null;
    avatarFocusY?: number | null;
    avatarZoom?: number | null;
    oneLiner: string | null;
    bannerStorageId?: string | null;
    bannerUrl?: string | null;
    bannerFocusX?: number | null;
    bannerFocusY?: number | null;
    bannerZoom?: number | null;
  },
): Promise<TCommunity | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:createCommunity" as any, {
    authSubject,
    name: params.name,
    slug: params.slug,
    visibility: params.visibility,
    avatarStorageId: params.avatarStorageId ?? null,
    avatarUrl: params.avatarUrl ?? null,
    avatarFocusX: params.avatarFocusX ?? 0.5,
    avatarFocusY: params.avatarFocusY ?? 0.5,
    avatarZoom: params.avatarZoom ?? 1,
    oneLiner: params.oneLiner,
    bannerStorageId: params.bannerStorageId ?? null,
    bannerUrl: params.bannerUrl ?? null,
    bannerFocusX: params.bannerFocusX ?? 0.5,
    bannerFocusY: params.bannerFocusY ?? 0.5,
    bannerZoom: params.bannerZoom ?? 1,
  });
  return firstGatewayRow<TCommunity>(payload);
}

export async function setCloudCommunityFreeAccessMode<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    mode: "open" | "approval";
  },
): Promise<CloudCommunityFreeAccessModeResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:setCommunityFreeAccessMode" as any, {
    authSubject,
    communityId: params.communityId,
    mode: params.mode,
  });
  return firstGatewayRow<CloudCommunityFreeAccessModeResult>(payload);
}

export async function saveCloudCommunityMemberOnboardingConfig<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    config: CommunityMemberOnboardingConfig;
  },
): Promise<CloudCommunityMemberOnboardingSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:saveCommunityMemberOnboardingConfig" as any, {
    authSubject,
    communityId: params.communityId,
    config: params.config,
  });
  return firstGatewayRow<CloudCommunityMemberOnboardingSaveResult>(payload);
}

export async function leaveCloudCommunity<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:leaveCommunity" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

export async function saveCloudCommunitySettings<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    name: string;
    slug: string;
    oneLiner: string | null;
    about: string | null;
    avatarStorageId?: string | null;
    avatarUrl?: string | null;
    avatarFocusX?: number | null;
    avatarFocusY?: number | null;
    avatarZoom?: number | null;
    bannerStorageId?: string | null;
    bannerUrl?: string | null;
    bannerFocusX?: number | null;
    bannerFocusY?: number | null;
    bannerZoom?: number | null;
    visibility: string;
    monthlyAmountBaseUnits: number | null;
    annualAmountBaseUnits: number | null;
  },
): Promise<CloudCommunitySettingsSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:saveCommunitySettings" as any, {
    authSubject,
    communityId: params.communityId,
    name: params.name,
    slug: params.slug,
    oneLiner: params.oneLiner,
    about: params.about,
    avatarStorageId: params.avatarStorageId ?? null,
    avatarUrl: params.avatarUrl ?? null,
    avatarFocusX: params.avatarFocusX ?? 0.5,
    avatarFocusY: params.avatarFocusY ?? 0.5,
    avatarZoom: params.avatarZoom ?? 1,
    bannerStorageId: params.bannerStorageId ?? null,
    bannerUrl: params.bannerUrl ?? null,
    bannerFocusX: params.bannerFocusX ?? 0.5,
    bannerFocusY: params.bannerFocusY ?? 0.5,
    bannerZoom: params.bannerZoom ?? 1,
    visibility: params.visibility,
    monthlyAmountBaseUnits: params.monthlyAmountBaseUnits,
    annualAmountBaseUnits: params.annualAmountBaseUnits,
    currency: "usd",
    currencyDecimals: 2,
  });
  return firstGatewayRow<CloudCommunitySettingsSaveResult>(payload);
}

export async function saveCloudCommunityOneLiner<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    oneLiner: string | null;
  },
): Promise<CloudCommunityOneLinerSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:saveCommunityOneLiner" as any, {
    authSubject,
    communityId: params.communityId,
    oneLiner: params.oneLiner,
  });
  return firstGatewayRow<CloudCommunityOneLinerSaveResult>(payload);
}

export async function saveCloudCommunityMemberSettings<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    muted: boolean;
    mutedUntil?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:saveCommunityMemberSettings" as any, {
    authSubject,
    communityId: params.communityId,
    muted: params.muted,
    mutedUntilIso: params.mutedUntil ?? null,
  });
}

export async function deleteCloudCommunity<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:deleteCommunity" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

export async function fetchCloudCommunityArchiveHealth<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityArchiveHealthRow | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityArchiveHealth" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<CloudCommunityArchiveHealthRow>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunityArchiveHealthRow)
      : null);
}

export async function requestCloudCommunityArchiveBackfill<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityArchiveBackfillResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:requestCommunityArchiveBackfill" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<CloudCommunityArchiveBackfillResult>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunityArchiveBackfillResult)
      : null);
}

export async function processCloudCommunityArchivePending<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityArchiveProcessResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("community:processCommunityArchivePending" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<CloudCommunityArchiveProcessResult>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunityArchiveProcessResult)
      : null);
}

export async function retryCloudCommunityArchiveFailures<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityArchiveRetryResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("community:retryCommunityArchiveFailures" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<CloudCommunityArchiveRetryResult>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunityArchiveRetryResult)
      : null);
}
