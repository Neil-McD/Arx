import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityLaunchSetupStatus } from "./communityLaunchSetup";

type CloudCommunityLaunchSetupGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityLaunchProfileSaveInput = {
  name?: string;
  slug?: string;
  oneLiner?: string | null;
  about?: string | null;
  avatarUrl?: string | null;
  avatarStorageId?: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
  bannerUrl?: string | null;
  bannerStorageId?: string | null;
  bannerFocusX?: number | null;
  bannerFocusY?: number | null;
  bannerZoom?: number | null;
  visibility?: string;
};

export type CloudCommunityLaunchProfileSaveResult = {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
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
  entry_policy?: "open" | "approval" | "paid_subscription" | null;
  created_at: string;
  updated_at: string;
};

export type CloudCommunityWorkflowImportDraft = {
  id: string;
  community_id: string;
  builder_user_id: string;
  source_harness: string;
  source_kind?: "pasted_output" | "workflow_export_zip";
  status: "working" | "ready_for_review" | "applied" | "failed";
  current_ledger_json: unknown | null;
  error_message: string | null;
  package_filename?: string | null;
  package_sha256?: string | null;
  package_byte_count?: number | null;
  package_summary?: unknown | null;
  created_at: string;
  updated_at: string;
};

export type CloudCommunityWorkflowImportApplyOutcome = {
  id: string;
  kind: "mcp" | "skill" | "repo";
  name: string;
  status:
    | "connected"
    | "attached"
    | "needs_manual_setup"
    | "needs_skill_body_review"
    | "next_action_recorded"
    | "failed";
  reason: string;
  referenceId?: string | null;
};

export type CloudCommunityWorkflowImportApplyResult =
  CloudCommunityWorkflowImportDraft & {
    selected_item_ids: string[];
    outcomes: CloudCommunityWorkflowImportApplyOutcome[];
    summary: {
      selected_count: number;
      mcp_connected: number;
      mcp_needs_setup: number;
      skills_attached: number;
      skills_need_review: number;
      repo_next_actions: number;
    };
  };

export async function loadCloudCommunityLaunchSetupStatus<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CommunityLaunchSetupStatus | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.query("community:getCommunityLaunchSetupStatus" as any, {
    authSubject,
    communityId: params.communityId,
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as CommunityLaunchSetupStatus;
}

export async function saveCloudCommunityLaunchProfile<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
    input: CloudCommunityLaunchProfileSaveInput;
  },
): Promise<CloudCommunityLaunchProfileSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.mutation("community:saveCommunityLaunchProfile" as any, {
    authSubject,
    communityId: params.communityId,
    ...params.input,
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as CloudCommunityLaunchProfileSaveResult;
}

export async function createCloudCommunityWorkflowImportDraft<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
    sourceHarness: string;
    rawHarnessOutput: string;
  },
): Promise<CloudCommunityWorkflowImportDraft | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.mutation("community:createCommunityWorkflowImportDraft" as any, {
    authSubject,
    communityId: params.communityId,
    sourceHarness: params.sourceHarness,
    rawHarnessOutput: params.rawHarnessOutput,
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as CloudCommunityWorkflowImportDraft;
}

async function requestCloudCommunityWorkflowImportPackageUploadUrl<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.mutation("community:generateCommunityWorkflowImportPackageUploadUrl" as any, {
    authSubject,
    communityId: params.communityId,
  });
  const uploadUrl =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? String((payload as { uploadUrl?: unknown }).uploadUrl ?? "").trim()
      : "";
  if (!uploadUrl) throw new Error("workflow_import_package_upload_failed");
  return uploadUrl;
}

async function uploadCloudCommunityWorkflowImportPackage<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
    file: File;
  },
): Promise<string> {
  const uploadUrl = await requestCloudCommunityWorkflowImportPackageUploadUrl({
    session: params.session,
    communityId: params.communityId,
  });
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": params.file.type || "application/zip",
    },
    body: params.file,
  });
  if (!response.ok) throw new Error("workflow_import_package_upload_failed");
  const payload = (await response.json()) as { storageId?: string | null };
  const storageId = String(payload?.storageId ?? "").trim();
  if (!storageId) throw new Error("workflow_import_package_upload_failed");
  return storageId;
}

export async function createCloudCommunityWorkflowImportDraftFromPackage<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
    sourceHarness: string;
    file: File;
  },
): Promise<CloudCommunityWorkflowImportDraft | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const storageId = await uploadCloudCommunityWorkflowImportPackage({
    session: params.session,
    communityId: params.communityId,
    file: params.file,
  });
  const payload = await client.action("community:createCommunityWorkflowImportDraftFromPackage" as any, {
    authSubject,
    communityId: params.communityId,
    sourceHarness: params.sourceHarness,
    storageId,
    sourceFilename: params.file.name,
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as CloudCommunityWorkflowImportDraft;
}

export async function loadCloudCommunityWorkflowImportDraft<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
    draftId: string;
  },
): Promise<CloudCommunityWorkflowImportDraft | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.query("community:getCommunityWorkflowImportDraft" as any, {
    authSubject,
    communityId: params.communityId,
    draftId: params.draftId,
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as CloudCommunityWorkflowImportDraft;
}

export async function applyCloudCommunityWorkflowImportReview<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
    draftId: string;
    selectedItemIds: string[];
  },
): Promise<CloudCommunityWorkflowImportApplyResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.action("community:applyCommunityWorkflowImportReview" as any, {
    authSubject,
    communityId: params.communityId,
    draftId: params.draftId,
    selectedItemIds: params.selectedItemIds,
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as CloudCommunityWorkflowImportApplyResult;
}
