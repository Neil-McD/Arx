import { type AuthSessionLike } from "./authSession";
import { bootstrapGatewayAuthContext } from "./cloudGateway";
import {
  normalizeProjectContextLinks,
  normalizeProjectInstructions,
  type ProjectContextLink,
} from "./projectContext";
import { normalizeProjectDisplayName } from "./projectNaming";
import {
  DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE,
  normalizeWorkspaceVolumeRetentionState,
  resolveWorkspaceProjectResourceTruth,
  type WorkspaceVolumeRetentionState,
} from "./workspaceProjectResources";

type CloudProjectsWarn = (message: string, error?: unknown) => void;

export type CloudProjectRecord = {
  id: string;
  name: string | null;
  description: string | null;
  instructions: string | null;
  context_links: ProjectContextLink[];
  slug: string | null;
  status: string;
  provider_volume_id: string | null;
  provider_volume_name: string | null;
  provider_volume_state: string | null;
  provider_volume_last_seen_at: number | null;
  provider_sandbox_id: string | null;
  provider_sandbox_state: string | null;
  provider_sandbox_last_seen_at: number | null;
  volume_retention_state: WorkspaceVolumeRetentionState;
  volume_retain_until: number | null;
  volume_delete_after: number | null;
  volume_deletion_warning_sent_at: number | null;
  volume_deleted_at: number | null;
  volume_deletion_reason: string | null;
  created_at: number;
  updated_at: number;
  root_path: string;
};

type ConvexCloudProjectRow = {
  _id: string;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  instructions?: string | null;
  contextLinks?: ProjectContextLink[] | null;
  status?: string | null;
  providerVolumeId?: string | null;
  providerVolumeName?: string | null;
  providerVolumeProviderId?: string | null;
  providerVolumeState?: string | null;
  providerVolumeLastSeenAt?: number | null;
  providerSandboxId?: string | null;
  providerSandboxProviderId?: string | null;
  providerSandboxState?: string | null;
  providerSandboxLastSeenAt?: number | null;
  workspaceVolumeRetentionState?: WorkspaceVolumeRetentionState | null;
  workspaceVolumeRetainUntil?: number | null;
  workspaceVolumeDeleteAfter?: number | null;
  workspaceVolumeDeletionWarningSentAt?: number | null;
  workspaceVolumeDeletedAt?: number | null;
  workspaceVolumeDeletionReason?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
};

// Gateway class: authenticated read/mutation/action bridge, caller-hardened session, fail-closed.

function readProjectInstructions(row: ConvexCloudProjectRow): string | null {
  try {
    return normalizeProjectInstructions(row.instructions) ?? null;
  } catch {
    return null;
  }
}

function readProjectContextLinks(row: ConvexCloudProjectRow): ProjectContextLink[] {
  try {
    return normalizeProjectContextLinks(row.contextLinks ?? []);
  } catch {
    return [];
  }
}

function mapConvexProjectRowToRecord(row: ConvexCloudProjectRow): CloudProjectRecord {
  const id = String(row._id ?? "").trim();
  const createdAtMs = Number(row.createdAt ?? Date.now());
  const updatedAtMs = Number(row.updatedAt ?? Date.now());
  const slug = typeof row.slug === "string" && row.slug.trim() ? row.slug.trim() : null;
  const name = normalizeProjectDisplayName(typeof row.name === "string" ? row.name : null);
  const resourceTruth = resolveWorkspaceProjectResourceTruth(row);
  return {
    id,
    name,
    description: typeof row.description === "string" && row.description.trim() ? row.description.trim() : null,
    instructions: readProjectInstructions(row),
    context_links: readProjectContextLinks(row),
    slug,
    status: typeof row.status === "string" && row.status.trim() ? row.status.trim() : "active",
    provider_volume_id: resourceTruth.volume.resourceId,
    provider_volume_name: resourceTruth.volume.name,
    provider_volume_state: resourceTruth.volume.providerState,
    provider_volume_last_seen_at: resourceTruth.volume.lastSeenAt,
    provider_sandbox_id: resourceTruth.sandbox.resourceId,
    provider_sandbox_state: resourceTruth.sandbox.providerState,
    provider_sandbox_last_seen_at: resourceTruth.sandbox.lastSeenAt,
    volume_retention_state: normalizeWorkspaceVolumeRetentionState(
      resourceTruth.volume.retentionState ?? DEFAULT_WORKSPACE_VOLUME_RETENTION_STATE,
    ),
    volume_retain_until: resourceTruth.volume.retainUntil,
    volume_delete_after: resourceTruth.volume.deleteAfter,
    volume_deletion_warning_sent_at: resourceTruth.volume.deletionWarningSentAt,
    volume_deleted_at: resourceTruth.volume.deletedAt,
    volume_deletion_reason: resourceTruth.volume.deletionReason,
    created_at: Number.isFinite(createdAtMs) ? Math.floor(createdAtMs / 1000) : Math.floor(Date.now() / 1000),
    updated_at: Number.isFinite(updatedAtMs) ? Math.floor(updatedAtMs / 1000) : Math.floor(Date.now() / 1000),
    root_path: slug || "workspace",
  };
}

async function fetchMappedCloudProjectsViaConvex<TSession>(params: {
  session: TSession;
}): Promise<CloudProjectRecord[]> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const rows = (await client.query("projects:listCloudProjectsForOwner" as any, {
    authSubject,
  })) as ConvexCloudProjectRow[];
  return Array.isArray(rows) ? rows.map((row) => mapConvexProjectRowToRecord(row)) : [];
}

export async function fetchMappedCloudProjects<TSession>(params: {
  session: TSession;
  onWarn?: CloudProjectsWarn;
}): Promise<CloudProjectRecord[]> {
  void params.onWarn;
  return await fetchMappedCloudProjectsViaConvex({
    session: params.session,
  });
}
