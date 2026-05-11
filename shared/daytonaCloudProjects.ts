import { type AuthSessionLike } from "./authSession";
import { bootstrapGatewayAuthContext } from "./cloudGateway";
import { normalizeComputerDisplayName } from "./projectNaming";

type DaytonaCloudProjectsWarn = (message: string, error?: unknown) => void;

export type DaytonaCloudProjectRecord = {
  id: string;
  name: string | null;
  description: string | null;
  slug: string | null;
  status: string;
  provider_volume_id: string | null;
  provider_volume_name: string | null;
  created_at: number;
  updated_at: number;
  root_path: string;
};

type ConvexCloudProjectRow = {
  _id: string;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  status?: string | null;
  providerVolumeId?: string | null;
  providerVolumeName?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
};

// Gateway class: authenticated read/mutation/action bridge, caller-hardened session, fail-closed.

function mapConvexProjectRowToRecord(row: ConvexCloudProjectRow): DaytonaCloudProjectRecord {
  const id = String(row._id ?? "").trim();
  const createdAtMs = Number(row.createdAt ?? Date.now());
  const updatedAtMs = Number(row.updatedAt ?? Date.now());
  const slug = typeof row.slug === "string" && row.slug.trim() ? row.slug.trim() : null;
  const name = normalizeComputerDisplayName(typeof row.name === "string" ? row.name : null);
  return {
    id,
    name,
    description: typeof row.description === "string" && row.description.trim() ? row.description.trim() : null,
    slug,
    status: typeof row.status === "string" && row.status.trim() ? row.status.trim() : "active",
    provider_volume_id: typeof row.providerVolumeId === "string" ? row.providerVolumeId : null,
    provider_volume_name: typeof row.providerVolumeName === "string" ? row.providerVolumeName : null,
    created_at: Number.isFinite(createdAtMs) ? Math.floor(createdAtMs / 1000) : Math.floor(Date.now() / 1000),
    updated_at: Number.isFinite(updatedAtMs) ? Math.floor(updatedAtMs / 1000) : Math.floor(Date.now() / 1000),
    root_path: slug || "workspace",
  };
}

async function fetchMappedDaytonaCloudProjectsViaConvex<TSession>(params: {
  session: TSession;
}): Promise<DaytonaCloudProjectRecord[]> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const rows = (await client.query("projects:listCloudProjectsForOwner" as any, {
    authSubject,
  })) as ConvexCloudProjectRow[];
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.map((row) => mapConvexProjectRowToRecord(row));
  }
  const row = (await client.mutation("projects:ensureDefaultCloudProjectForOwner" as any, {
    authSubject,
  })) as ConvexCloudProjectRow | null;
  return row ? [mapConvexProjectRowToRecord(row)] : [];
}

export async function fetchMappedDaytonaCloudProjects<TSession>(params: {
  session: TSession;
  onWarn?: DaytonaCloudProjectsWarn;
}): Promise<DaytonaCloudProjectRecord[]> {
  void params.onWarn;
  return await fetchMappedDaytonaCloudProjectsViaConvex({
    session: params.session,
  });
}

export async function ensureDefaultCloudProjectId<TSession>(params: {
  session: TSession;
}): Promise<string | null> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const row = (await client.mutation("projects:ensureDefaultCloudProjectForOwner" as any, {
    authSubject,
  })) as ConvexCloudProjectRow | null;
  const projectId = String(row?._id ?? "").trim();
  return projectId || null;
}

export async function ensureDefaultCloudProject<TSession>(params: {
  session: TSession;
}): Promise<void> {
  await ensureDefaultCloudProjectId(params);
}

export async function createMappedDaytonaCloudProject<TSession>(params: {
  session: TSession;
  name?: string | null;
  description?: string | null;
}): Promise<DaytonaCloudProjectRecord> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const row = (await client.mutation("projects:createCloudProjectForOwner" as any, {
    authSubject,
    ...(typeof params.name === "string" ? { name: params.name } : null),
    ...(typeof params.description === "string" ? { description: params.description } : null),
  })) as ConvexCloudProjectRow | null;
  if (!row) throw new Error("project_create_failed");
  return mapConvexProjectRowToRecord(row);
}

async function requestCloudProjectImportUploadUrl<TSession>(params: {
  session: TSession;
}): Promise<string> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const payload = (await client.mutation("projects:generateCloudProjectImportUploadUrl" as any, {
    authSubject,
  })) as { uploadUrl?: string | null } | null;
  const uploadUrl = String(payload?.uploadUrl ?? "").trim();
  if (!uploadUrl) {
    throw new Error("project_import_upload_failed");
  }
  return uploadUrl;
}

async function uploadCloudProjectImportZip<TSession>(params: {
  session: TSession;
  file: File;
}): Promise<string> {
  const uploadUrl = await requestCloudProjectImportUploadUrl({
    session: params.session,
  });
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": params.file.type || "application/zip",
    },
    body: params.file,
  });
  if (!response.ok) {
    throw new Error("project_import_upload_failed");
  }
  const payload = (await response.json()) as { storageId?: string | null };
  const storageId = String(payload?.storageId ?? "").trim();
  if (!storageId) {
    throw new Error("project_import_upload_failed");
  }
  return storageId;
}

export async function updateMappedDaytonaCloudProject<TSession>(params: {
  session: TSession;
  projectId: string;
  name: string;
  description?: string | null;
}): Promise<DaytonaCloudProjectRecord> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const row = (await client.mutation("projects:updateCloudProjectForOwner" as any, {
    authSubject,
    projectId: params.projectId,
    name: params.name,
    ...(typeof params.description === "string" ? { description: params.description } : null),
  })) as ConvexCloudProjectRow | null;
  if (!row) throw new Error("project_update_failed");
  return mapConvexProjectRowToRecord(row);
}

export async function importMappedDaytonaCloudProjectZip<TSession>(params: {
  session: TSession;
  projectId: string;
  file: File;
}): Promise<{
  ok: true;
  importedBytes: number;
  sourceFilename: string;
  importedFiles: number;
  skippedFiles: number;
  blockedFiles: number;
  commonRootStripped: boolean;
}> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  const storageId = await uploadCloudProjectImportZip({
    session: params.session,
    file: params.file,
  });
  return (await client.action("projects:importCloudProjectZipForOwner" as any, {
    authSubject,
    projectId: params.projectId,
    storageId,
    sourceFilename: params.file.name,
  })) as {
    ok: true;
    importedBytes: number;
    sourceFilename: string;
    importedFiles: number;
    skippedFiles: number;
    blockedFiles: number;
    commonRootStripped: boolean;
  };
}

export async function deleteMappedDaytonaCloudProject<TSession>(params: {
  session: TSession;
  projectId: string;
}): Promise<{ ok: true; archivedThreadCount: number }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as AuthSessionLike);
  return (await client.action("projects:deleteCloudProjectForOwner" as any, {
    authSubject,
    projectId: params.projectId,
  })) as { ok: true; archivedThreadCount: number };
}
