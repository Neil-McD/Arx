import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import {
  coerceGatewayRows,
  firstGatewayObjectRow,
  firstGatewayRow,
  normalizeGatewayNullableString,
  parseGatewayNumberLike,
} from "./cloudGateway";
import type { CommunityAnalyticsSnapshot } from "./communityTypes";

type CloudCommunityAdminGatewayParams<SessionT> = {
  session: SessionT;
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
  avatar_storage_id: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
  banner_url: string | null;
  banner_storage_id: string | null;
  banner_focus_x: number;
  banner_focus_y: number;
  banner_zoom: number;
  visibility: "published" | "unlisted";
  updated_at: string;
  branding_revision?: number | null;
  settings_revision: number;
  pricing: {
    mode: "free" | "monthly" | "annual";
    monthly_amount_base_units: number | null;
    annual_amount_base_units: number | null;
    currency: "usd";
    currency_decimals: 2;
  };
  visual_identity?: import("./communityVisualIdentity").CommunityVisualIdentity | null;
};

export type CloudCommunitySettingsSnapshot = CloudCommunitySettingsSaveResult;

export function parseCloudCommunitySettingsSnapshot(
  payload: unknown,
): CloudCommunitySettingsSnapshot | null {
  const row = firstGatewayObjectRow(payload);
  if (!row) return null;
  const communityId = String(row.community_id ?? row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  const slug = String(row.slug ?? "").trim();
  const visibilityRaw = String(row.visibility ?? "").trim().toLowerCase();
  const updatedAt = String(row.updated_at ?? "").trim();
  const settingsRevision = parseGatewayNumberLike(row.settings_revision);
  const brandingRevision = parseGatewayNumberLike(row.branding_revision);
  const pricingRow =
    row.pricing && typeof row.pricing === "object" && !Array.isArray(row.pricing)
      ? (row.pricing as Record<string, unknown>)
      : null;
  const pricingMode = String(pricingRow?.mode ?? "").trim().toLowerCase();
  if (
    !communityId ||
    !name ||
    !slug ||
    !updatedAt ||
    (visibilityRaw !== "published" && visibilityRaw !== "unlisted") ||
    !Number.isSafeInteger(settingsRevision) ||
    Number(settingsRevision) < 0 ||
    (brandingRevision !== null &&
      (!Number.isSafeInteger(brandingRevision) || brandingRevision < 0)) ||
    !pricingRow ||
    !["free", "monthly", "annual"].includes(pricingMode)
  ) {
    throw new Error("community_settings_snapshot_invalid");
  }
  const requiredNumber = (value: unknown, field: string): number => {
    const parsed = parseGatewayNumberLike(value);
    if (parsed === null) throw new Error(`community_settings_snapshot_invalid:${field}`);
    return parsed;
  };
  const requiredRange = (
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
  ): number => {
    const parsed = requiredNumber(value, field);
    if (parsed < minimum || parsed > maximum) {
      throw new Error(`community_settings_snapshot_invalid:${field}`);
    }
    return parsed;
  };
  const nullableAmount = (value: unknown, field: string): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = parseGatewayNumberLike(value);
    if (parsed === null || parsed < 0) {
      throw new Error(`community_settings_snapshot_invalid:${field}`);
    }
    return Math.floor(parsed);
  };
  const currency = String(pricingRow.currency ?? "").trim().toLowerCase();
  const currencyDecimals = requiredNumber(
    pricingRow.currency_decimals,
    "currency_decimals",
  );
  if (currency !== "usd" || currencyDecimals !== 2) {
    throw new Error("community_settings_snapshot_invalid:currency");
  }
  return {
    community_id: communityId,
    name,
    slug,
    one_liner: normalizeGatewayNullableString(row.one_liner),
    about: normalizeGatewayNullableString(row.about),
    avatar_url: normalizeGatewayNullableString(row.avatar_url),
    avatar_storage_id: normalizeGatewayNullableString(row.avatar_storage_id),
    avatar_focus_x: requiredRange(row.avatar_focus_x, "avatar_focus_x", 0, 1),
    avatar_focus_y: requiredRange(row.avatar_focus_y, "avatar_focus_y", 0, 1),
    avatar_zoom: requiredRange(row.avatar_zoom, "avatar_zoom", 1, 2.5),
    banner_url: normalizeGatewayNullableString(row.banner_url),
    banner_storage_id: normalizeGatewayNullableString(row.banner_storage_id),
    banner_focus_x: requiredRange(row.banner_focus_x, "banner_focus_x", 0, 1),
    banner_focus_y: requiredRange(row.banner_focus_y, "banner_focus_y", 0, 1),
    banner_zoom: requiredRange(row.banner_zoom, "banner_zoom", 1, 2.5),
    visibility: visibilityRaw,
    updated_at: updatedAt,
    branding_revision: brandingRevision,
    settings_revision: Math.floor(Number(settingsRevision)),
    pricing: {
      mode: pricingMode as "free" | "monthly" | "annual",
      monthly_amount_base_units: nullableAmount(
        pricingRow.monthly_amount_base_units,
        "monthly_amount_base_units",
      ),
      annual_amount_base_units: nullableAmount(
        pricingRow.annual_amount_base_units,
        "annual_amount_base_units",
      ),
      currency: "usd",
      currency_decimals: 2,
    },
    visual_identity:
      row.visual_identity && typeof row.visual_identity === "object"
        ? (row.visual_identity as import("./communityVisualIdentity").CommunityVisualIdentity)
        : null,
  };
}

export type CloudCommunitySourceIngestionResult = {
  ok: boolean;
  kind: "community_source_ingestion";
  processed: number;
  succeeded: number;
  failed: number;
  failed_sources: number;
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

export type CloudCommunitySourceCrawlJobStatus =
  | "queued"
  | "crawling"
  | "saving_sources"
  | "ready"
  | "failed";

export type CloudCommunitySourceCrawlJob = {
  id: string;
  community_id: string | null;
  provider: "simple";
  root_url: string;
  status: CloudCommunitySourceCrawlJobStatus;
  max_pages: number;
  max_depth: number;
  page_count: number;
  ready_page_count: number;
  failed_page_count: number;
  saved_source_count: number;
  skipped_source_count: number;
  source_resource_ids: string[];
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CloudCommunitySourceCrawlJobResult = {
  ok: boolean;
  kind: "community_source_root_crawl_job" | "community_source_crawl_job";
  job: CloudCommunitySourceCrawlJob | null;
};

export type CloudCommunitySourceCrawlJobsResult = {
  ok: boolean;
  kind: "community_source_crawl_jobs";
  community_id: string | null;
  jobs: CloudCommunitySourceCrawlJob[];
};

export type CloudCommunitySourceCrawlerStatus = {
  ok: boolean;
  kind: "community_source_crawler_status";
  community_id: string | null;
  provider: "simple";
  configured: boolean;
  default_max_pages: number;
  default_max_depth: number;
  max_pages: number;
  max_depth: number;
  missing: string[];
  code: string | null;
  message: string | null;
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
  approved_pending_request_count?: number;
  pending_request_overflow?: boolean;
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
  const payload = await client.mutation("communityLifecycle:generateCommunityBrandingUploadUrl" as any, {
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
  const payload = await client.mutation("communityResources:generateCommunityResourceSourceUploadUrl" as any, {
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

const RESOURCE_IMAGE_ERRORS: Record<string, string> = {
  community_resource_image_type: "Use a PNG, JPEG, GIF, WebP or AVIF image.",
  community_resource_image_too_large: "Images can be up to 10 MB.",
};

/** Uploads a picture for a lesson body and returns the address to link it by. */
export async function uploadCloudCommunityResourceImage<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    file: File | Blob;
  },
): Promise<string> {
  const storageId = await uploadCloudCommunityResourceSourceFile(params);
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityResources:resolveCommunityResourceImageUrl" as any, {
    authSubject,
    communityId: params.communityId,
    storageId,
  });
  const row = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const url = String(row.url ?? "").trim();
  if (!url) throw new Error(RESOURCE_IMAGE_ERRORS[String(row.problem ?? "")] ?? "That image didn't upload. Try again.");
  return url;
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

function normalizeCommunitySourceCrawlJob(payload: unknown): CloudCommunitySourceCrawlJob | null {
  const record = (payload ?? null) as Record<string, unknown> | null;
  const id = typeof record?.id === "string" ? record.id.trim() : "";
  const rootUrl = typeof record?.root_url === "string" ? record.root_url.trim() : "";
  const provider = "simple";
  const status =
    record?.status === "queued" ||
    record?.status === "crawling" ||
    record?.status === "saving_sources" ||
    record?.status === "ready" ||
    record?.status === "failed"
      ? record.status
      : "failed";
  if (!id || !rootUrl) return null;
  return {
    id,
    community_id: typeof record?.community_id === "string" && record.community_id.trim()
      ? record.community_id.trim()
      : null,
    provider,
    root_url: rootUrl,
    status,
    max_pages: Math.max(0, Math.floor(parseGatewayNumberLike(record?.max_pages) ?? 0)),
    max_depth: Math.max(0, Math.floor(parseGatewayNumberLike(record?.max_depth) ?? 0)),
    page_count: Math.max(0, Math.floor(parseGatewayNumberLike(record?.page_count) ?? 0)),
    ready_page_count: Math.max(0, Math.floor(parseGatewayNumberLike(record?.ready_page_count) ?? 0)),
    failed_page_count: Math.max(0, Math.floor(parseGatewayNumberLike(record?.failed_page_count) ?? 0)),
    saved_source_count: Math.max(0, Math.floor(parseGatewayNumberLike(record?.saved_source_count) ?? 0)),
    skipped_source_count: Math.max(0, Math.floor(parseGatewayNumberLike(record?.skipped_source_count) ?? 0)),
    source_resource_ids: Array.isArray(record?.source_resource_ids)
      ? record.source_resource_ids
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      : [],
    error: typeof record?.error === "string" && record.error.trim() ? record.error.trim() : null,
    started_at: typeof record?.started_at === "string" && record.started_at.trim() ? record.started_at.trim() : null,
    completed_at: typeof record?.completed_at === "string" && record.completed_at.trim()
      ? record.completed_at.trim()
      : null,
    created_at: typeof record?.created_at === "string" && record.created_at.trim() ? record.created_at.trim() : null,
    updated_at: typeof record?.updated_at === "string" && record.updated_at.trim() ? record.updated_at.trim() : null,
  };
}

function normalizeCommunitySourceCrawlerStatus(payload: unknown): CloudCommunitySourceCrawlerStatus | null {
  const record = (payload ?? null) as Record<string, unknown> | null;
  if (!record || record.kind !== "community_source_crawler_status") return null;
  return {
    ok: record.ok !== false,
    kind: "community_source_crawler_status",
    community_id: typeof record.community_id === "string" && record.community_id.trim()
      ? record.community_id.trim()
      : null,
    provider: "simple",
    configured: record.configured === true,
    default_max_pages: Math.max(0, Math.floor(parseGatewayNumberLike(record.default_max_pages) ?? 0)),
    default_max_depth: Math.max(0, Math.floor(parseGatewayNumberLike(record.default_max_depth) ?? 0)),
    max_pages: Math.max(0, Math.floor(parseGatewayNumberLike(record.max_pages) ?? 0)),
    max_depth: Math.max(0, Math.floor(parseGatewayNumberLike(record.max_depth) ?? 0)),
    missing: Array.isArray(record.missing)
      ? record.missing
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      : [],
    code: typeof record.code === "string" && record.code.trim() ? record.code.trim() : null,
    message: typeof record.message === "string" && record.message.trim() ? record.message.trim() : null,
  };
}

export async function listCloudCommunityLaunchKnowledgeSources<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<CloudCommunityLaunchKnowledgeSourceListResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.query("communityResources:listCommunityLaunchKnowledgeSources" as any, {
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

export async function getCloudCommunitySourceCrawlerStatus<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunitySourceCrawlerStatus | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityResources:getCommunitySourceCrawlerStatus" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return normalizeCommunitySourceCrawlerStatus(payload);
}

export async function crawlCloudCommunitySourceRoot<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    rootUrl: string;
    maxPages?: number;
    maxDepth?: number;
  },
): Promise<CloudCommunitySourceCrawlJobResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("communityResources:crawlCommunitySourceRoot" as any, {
    authSubject,
    communityId: params.communityId,
    rootUrl: params.rootUrl,
    maxPages:
      typeof params.maxPages === "number" && Number.isFinite(params.maxPages)
        ? Math.max(1, Math.floor(params.maxPages))
        : undefined,
    maxDepth:
      typeof params.maxDepth === "number" && Number.isFinite(params.maxDepth)
        ? Math.max(1, Math.floor(params.maxDepth))
        : undefined,
  });
  const record = (payload ?? null) as Record<string, unknown> | null;
  const job = normalizeCommunitySourceCrawlJob(record?.job);
  if (!record || !job) return null;
  return {
    ok: record.ok !== false,
    kind: "community_source_root_crawl_job",
    job,
  };
}

export async function getCloudCommunitySourceCrawlJob<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    crawlJobId: string;
  },
): Promise<CloudCommunitySourceCrawlJobResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityResources:getCommunitySourceCrawlJob" as any, {
    authSubject,
    communityId: params.communityId,
    crawlJobId: params.crawlJobId,
  });
  const record = (payload ?? null) as Record<string, unknown> | null;
  const job = normalizeCommunitySourceCrawlJob(record?.job);
  if (!record || !job) return null;
  return {
    ok: record.ok !== false,
    kind: "community_source_crawl_job",
    job,
  };
}

export async function listCloudCommunitySourceCrawlJobs<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<CloudCommunitySourceCrawlJobsResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityResources:listCommunitySourceCrawlJobs" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : undefined,
  });
  const record = (payload ?? null) as Record<string, unknown> | null;
  const jobs = Array.isArray(record?.jobs)
    ? record.jobs
        .map(normalizeCommunitySourceCrawlJob)
        .filter((job): job is CloudCommunitySourceCrawlJob => Boolean(job))
    : [];
  return {
    ok: record?.ok !== false,
    kind: "community_source_crawl_jobs",
    community_id: typeof record?.community_id === "string" && record.community_id.trim()
      ? record.community_id.trim()
      : null,
    jobs,
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

export async function fetchCloudCommunityAnalyticsSnapshot<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    range: string;
  },
): Promise<CommunityAnalyticsSnapshot | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityAdmin:getCommunityAnalyticsSnapshot" as any, {
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
  const payload = await client.query("communityAdmin:getCommunityMemberBillingHistory" as any, {
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
    role: "co_creator" | "admin" | "moderator" | "member";
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityAdmin:setCommunityMemberRole" as any, {
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
  await client.action("communityAdmin:removeCommunityMember" as any, {
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
  await client.action("communityAdmin:banCommunityMember" as any, {
    authSubject,
    communityId: params.communityId,
    targetMembershipId: params.membershipId,
  });
}

export async function listCloudCommunityJoinRequestRows<SessionT, TJoinRequest = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TJoinRequest[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityAdmin:listCommunityJoinRequests" as any, {
    authSubject,
    communityId: params.communityId,
    limit: 201,
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
  const payload = await client.query("communityAdmin:getCommunityMemberSettings" as any, {
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
  await client.mutation("communityAdmin:approveCommunityJoinRequest" as any, {
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
  await client.mutation("communityAdmin:denyCommunityJoinRequest" as any, {
    authSubject,
    requestId: params.requestId,
  });
}

export async function listCloudCommunityResourceRows<SessionT, TResource = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<TResource[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityResources:listCommunityResources" as any, {
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
  const payload = await client.query("communityResources:listCommunityResourceModules" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : 200,
  });
  return coerceGatewayRows<TModule>(payload);
}

export async function saveCloudCommunityResource<SessionT, TResult = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    resourceId: string | null;
    isPatch: boolean;
    payload: Record<string, unknown>;
  },
): Promise<TResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityResources:saveCommunityResource" as any, {
    authSubject,
    resourceId: params.resourceId,
    isPatch: params.isPatch,
    payload: params.payload,
  });
  return payload as TResult;
}

/** One earlier version of a lesson, from its Version history. */
export type CloudCommunityResourceRevision = {
  id: string;
  resource_id: string;
  title: string;
  saved_at: string | null;
  replaced_at: string | null;
  body_chars: number;
  body_md: string;
};

export async function listCloudCommunityResourceRevisions<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & { resourceId: string },
): Promise<CloudCommunityResourceRevision[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityResources:listCommunityResourceRevisions" as any, {
    authSubject,
    resourceId: params.resourceId,
  });
  return coerceGatewayRows<CloudCommunityResourceRevision>(payload);
}

export async function restoreCloudCommunityResourceRevision<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & { revisionId: string },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityResources:restoreCommunityResourceRevision" as any, {
    authSubject,
    revisionId: params.revisionId,
  });
}

export type CloudCommunityLessonBoardUpdate = { resourceId: string; stage: string; stageOrder?: number; order?: number; title?: string };

/** Roadmap editing: stages and lesson order (and titles) for many lessons in one write. */
export async function updateCloudCommunityLessonBoard<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & { communityId: string; updates: CloudCommunityLessonBoardUpdate[] },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityResources:updateCommunityLessonBoard" as any, {
    authSubject,
    communityId: params.communityId,
    updates: params.updates,
  });
}

export async function getCloudCommunityResourceBuilderChangesetStatus<SessionT, TResult = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    changesetId: string;
  },
): Promise<TResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityResources:getCommunityResourceBuilderChangesetStatus" as any, {
    authSubject,
    communityId: params.communityId,
    changesetId: params.changesetId,
  });
  return payload as TResult;
}

export async function listCloudPendingCommunityResourceBuilderChangesets<SessionT, TResult = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<TResult[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityResources:listPendingCommunityResourceBuilderChangesets" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(5, Math.floor(params.limit)))
        : 2,
  });
  return coerceGatewayRows<TResult>(payload);
}

export async function applyCloudCommunityResourceBuilderChangeset<SessionT, TResult = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    changesetId: string;
  },
): Promise<TResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityResources:applyCommunityResourceBuilderChangeset" as any, {
    authSubject,
    communityId: params.communityId,
    changesetId: params.changesetId,
  });
  return payload as TResult;
}

export async function rejectCloudCommunityResourceBuilderChangeset<SessionT, TResult = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    changesetId: string;
    reason?: string | null;
  },
): Promise<TResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityResources:rejectCommunityResourceBuilderChangeset" as any, {
    authSubject,
    communityId: params.communityId,
    changesetId: params.changesetId,
    reason: String(params.reason ?? "").trim() || undefined,
  });
  return payload as TResult;
}

export async function ingestCloudCommunitySources<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
    retryFailed?: boolean;
  },
): Promise<CloudCommunitySourceIngestionResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("communityResources:ingestCommunitySources" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : undefined,
    retryFailed: params.retryFailed === true,
  });
  return firstGatewayRow<CloudCommunitySourceIngestionResult>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunitySourceIngestionResult)
      : null);
}

export async function saveCloudCommunityResourceModule<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    moduleId: string | null;
    isPatch: boolean;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityResources:saveCommunityResourceModule" as any, {
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
  await client.mutation("communityResources:reorderCommunityResourceModules" as any, {
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
  await client.mutation("communityResources:reorderCommunityResources" as any, {
    authSubject,
    communityId: params.communityId,
    moduleId: params.moduleId,
    resourceIds: params.resourceIds,
  });
}

export async function moveCloudCommunityResourceToModule<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    resourceId: string;
    targetModuleId: string | null;
    beforeResourceId?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityResources:moveCommunityResourceToModule" as any, {
    authSubject,
    communityId: params.communityId,
    resourceId: params.resourceId,
    targetModuleId: params.targetModuleId,
    beforeResourceId: params.beforeResourceId ?? null,
  });
}

export async function deleteCloudCommunityResource<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    resourceId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityResources:deleteCommunityResource" as any, {
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
  await client.mutation("communityResources:deleteCommunityResourceModule" as any, {
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
    founderSubscriptionId?: string | null;
  },
): Promise<TCommunity | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityLifecycle:createCommunity" as any, {
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
    founderSubscriptionId: params.founderSubscriptionId ?? undefined,
  });
  return firstGatewayRow<TCommunity>(payload);
}

export type CloudBuilderKnowledgeSetupCompletion = {
  ok: true;
  changed: boolean;
  community_id: string;
  builder_knowledge_setup_pending: false;
};

export async function completeCloudBuilderKnowledgeSetup<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudBuilderKnowledgeSetupCompletion> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(
    "communityBuilderKnowledgeSetup:completeBuilderKnowledgeSetup" as any,
    {
      authSubject,
      communityId: params.communityId,
    },
  ) as CloudBuilderKnowledgeSetupCompletion;
}

export type CloudBuilderKnowledgeBuildResult = {
  ok: boolean;
  kind: "builder_knowledge_build";
  code?: string | null;
  message?: string | null;
  community_id?: string;
  builder_knowledge_setup_pending?: false;
};

export async function buildCloudBuilderKnowledgeResources<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudBuilderKnowledgeBuildResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.action(
    "communityBuilderKnowledgeSetup:buildBuilderKnowledgeResources" as any,
    {
      authSubject,
      communityId: params.communityId,
    },
  ) as CloudBuilderKnowledgeBuildResult;
}

export type CloudCommunityArchiveResult = {
  ok: boolean;
  changed: boolean;
  community_id: string;
  lifecycle_status: "archived";
  lifecycle_generation: number;
  billing_cleanup_status: "pending" | "complete" | "blocked";
};

export async function archiveCloudCommunity<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityArchiveResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityColdArchive:archiveCommunity" as any, {
    authSubject,
    communityId: params.communityId,
  }) as CloudCommunityArchiveResult;
}

export type CloudCommunityRestoreResult = {
  ok: boolean;
  changed: boolean;
  community_id: string;
  lifecycle_status: "active";
  lifecycle_generation: number;
  restoration_authority?: "grandfathered" | "operator_comp";
};

export async function restoreCloudCommunityWithoutPayment<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    lifecycleGeneration: number;
  },
): Promise<CloudCommunityRestoreResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityColdArchive:restoreCommunityWithoutPayment" as any, {
    authSubject,
    communityId: params.communityId,
    lifecycleGeneration: params.lifecycleGeneration,
  }) as CloudCommunityRestoreResult;
}

export async function setCloudCommunityFreeAccessMode<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    mode: "open" | "approval";
  },
): Promise<CloudCommunityFreeAccessModeResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityAdmin:setCommunityFreeAccessMode" as any, {
    authSubject,
    communityId: params.communityId,
    mode: params.mode,
  });
  return firstGatewayRow<CloudCommunityFreeAccessModeResult>(payload);
}

export async function leaveCloudCommunity<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityAdmin:leaveCommunity" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

export async function saveCloudCommunitySettings<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    expectedSettingsRevision?: number;
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
  const payload = await client.mutation("communityLifecycle:saveCommunitySettings" as any, {
    authSubject,
    communityId: params.communityId,
    ...(params.expectedSettingsRevision === undefined
      ? {}
      : { expectedSettingsRevision: params.expectedSettingsRevision }),
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
  return parseCloudCommunitySettingsSnapshot(payload);
}

export async function fetchCloudCommunitySettings<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunitySettingsSnapshot | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityLifecycle:getCommunitySettings" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return parseCloudCommunitySettingsSnapshot(payload);
}

export async function saveCloudCommunityMemberSettings<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    muted: boolean;
    mutedUntil?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityAdmin:saveCommunityMemberSettings" as any, {
    authSubject,
    communityId: params.communityId,
    muted: params.muted,
    mutedUntilIso: params.mutedUntil ?? null,
  });
}
