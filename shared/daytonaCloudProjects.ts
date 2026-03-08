import { normalizeDaytonaSandboxStatus, type DaytonaSandboxStatus } from "./daytonaSandboxStatus";
import { type CloudAuthSession } from "./cloudAuthSession";
import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";

type DaytonaCloudProjectsWarn = (message: string, error?: unknown) => void;

export type DaytonaSandboxStatusRow = {
  project_id?: string | null;
  status?: string | null;
};

type DaytonaCloudProjectRow = {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  slug?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DaytonaCloudProjectRecord = {
  id: string;
  name: string | null;
  description: string | null;
  slug: string | null;
  status: string;
  sandbox_status: DaytonaSandboxStatus | null;
  provider_volume_id: string | null;
  provider_volume_name: string | null;
  created_at: number;
  updated_at: number;
  root_path: string;
};

type ConvexCloudProjectRow = {
  _id: string;
  name?: string | null;
  description?: string | null;
  slug?: string | null;
  status?: string | null;
  providerSandboxState?: string | null;
  providerVolumeId?: string | null;
  providerVolumeName?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
};

type ConvexCloudProjectProbePayload = {
  sandbox?: {
    status?: string | null;
  } | null;
  probe?: {
    stdout_preview?: string | null;
  } | null;
};

async function bootstrapConvexOwnerId(session: CloudAuthSession): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return { client, authSubject };
}

function mapConvexProjectRowToRecord(row: ConvexCloudProjectRow): DaytonaCloudProjectRecord {
  const id = String(row._id ?? "").trim();
  const slug = String(row.slug ?? "").trim() || null;
  const createdAtMs = Number(row.createdAt ?? Date.now());
  const updatedAtMs = Number(row.updatedAt ?? Date.now());
  return {
    id,
    name: typeof row.name === "string" ? row.name : null,
    description: typeof row.description === "string" ? row.description : null,
    slug,
    status: String(row.status ?? "active").trim().toLowerCase() || "active",
    sandbox_status: normalizeDaytonaSandboxStatus(row.providerSandboxState ?? null),
    provider_volume_id: typeof row.providerVolumeId === "string" ? row.providerVolumeId : null,
    provider_volume_name: typeof row.providerVolumeName === "string" ? row.providerVolumeName : null,
    created_at: Number.isFinite(createdAtMs) ? Math.floor(createdAtMs / 1000) : Math.floor(Date.now() / 1000),
    updated_at: Number.isFinite(updatedAtMs) ? Math.floor(updatedAtMs / 1000) : Math.floor(Date.now() / 1000),
    root_path: slug ? `cloud/${slug}` : `cloud/${id}`,
  };
}

async function fetchMappedDaytonaCloudProjectsViaConvex<TSession>(params: {
  session: TSession;
}): Promise<DaytonaCloudProjectRecord[]> {
  const { client, authSubject } = await bootstrapConvexOwnerId(params.session as CloudAuthSession);
  const rows = (await client.query("projects:listCloudProjectsByOwner" as any, {
    authSubject,
    includeArchived: false,
  })) as ConvexCloudProjectRow[];
  return rows.map((row) => mapConvexProjectRowToRecord(row));
}

export function buildDaytonaSandboxStatusByProject(
  rows: readonly DaytonaSandboxStatusRow[],
): Map<string, DaytonaSandboxStatus> {
  const statusByProject = new Map<string, DaytonaSandboxStatus>();
  for (const row of rows) {
    const projectId = String(row?.project_id ?? "").trim();
    if (!projectId || statusByProject.has(projectId)) continue;
    const status = normalizeDaytonaSandboxStatus(row?.status ?? null);
    if (!status) continue;
    statusByProject.set(projectId, status);
  }
  return statusByProject;
}

export function mapActiveDaytonaCloudProjects(params: {
  rows: readonly DaytonaCloudProjectRow[];
  sandboxRows: readonly DaytonaSandboxStatusRow[];
  toEpochSeconds: (value: string | null | undefined) => number | null;
  nowEpochSeconds?: number;
}): DaytonaCloudProjectRecord[] {
  const nowEpochSeconds = params.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  const sandboxStatusByProject = buildDaytonaSandboxStatusByProject(params.sandboxRows);

  return params.rows
    .filter((row) => String(row?.status ?? "").trim().toLowerCase() === "active")
    .map((row) => {
      const id = String(row.id ?? "").trim();
      const slug = String(row.slug ?? "").trim() || null;
      return {
        id,
        name: typeof row.name === "string" ? row.name : null,
        description: typeof row.description === "string" ? row.description : null,
        slug,
        status: String(row.status ?? "").trim().toLowerCase(),
        sandbox_status: sandboxStatusByProject.get(id) ?? null,
        provider_volume_id: null,
        provider_volume_name: null,
        created_at: params.toEpochSeconds(row.created_at) ?? nowEpochSeconds,
        updated_at: params.toEpochSeconds(row.updated_at) ?? nowEpochSeconds,
        root_path: slug ? `cloud/${slug}` : `cloud/${id}`,
      };
    })
    .filter((project) => Boolean(project.id));
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
}): Promise<string> {
  const { client, authSubject } = await bootstrapConvexOwnerId(params.session as CloudAuthSession);
  const row = (await client.action("projects:ensureDefaultCloudProjectWithVolumeForOwner" as any, {
    authSubject,
  })) as ConvexCloudProjectRow | null;
  const projectId = String(row?._id ?? "").trim();
  if (!projectId) throw new Error("default_project_missing_id");
  return projectId;
}

export async function ensureDefaultCloudProject<TSession>(params: {
  session: TSession;
}): Promise<void> {
  await ensureDefaultCloudProjectId(params);
}

export async function createDaytonaCloudProject<TSession>(params: {
  session: TSession;
  name: string;
  description?: string | null;
}): Promise<DaytonaCloudProjectRecord | null> {
  const cleanedName = String(params.name ?? "").trim();
  if (!cleanedName) throw new Error("project_name_required");
  const cleanedDescription = String(params.description ?? "").trim() || null;
  const { client, authSubject } = await bootstrapConvexOwnerId(params.session as CloudAuthSession);
  const row = (await client.action("projects:createCloudProjectWithVolume" as any, {
    authSubject,
    name: cleanedName,
    description: cleanedDescription ?? undefined,
  })) as ConvexCloudProjectRow;
  return mapConvexProjectRowToRecord(row);
}

export async function renameDaytonaCloudProject<TSession>(params: {
  session: TSession;
  projectId: string;
  name: string;
}): Promise<DaytonaCloudProjectRecord | null> {
  const projectId = String(params.projectId ?? "").trim();
  const cleanedName = String(params.name ?? "").trim();
  if (!projectId) throw new Error("project_id_required");
  if (!cleanedName) throw new Error("project_name_required");
  const { client, authSubject } = await bootstrapConvexOwnerId(params.session as CloudAuthSession);
  const row = (await client.mutation("projects:renameCloudProject" as any, {
    authSubject,
    projectId,
    name: cleanedName,
  })) as ConvexCloudProjectRow;
  return mapConvexProjectRowToRecord(row);
}

export async function attachDaytonaCloudProjectVolume<TSession>(params: {
  session: TSession;
  projectId: string;
  providerVolumeId: string;
  providerVolumeName?: string | null;
}): Promise<DaytonaCloudProjectRecord | null> {
  const projectId = String(params.projectId ?? "").trim();
  const providerVolumeId = String(params.providerVolumeId ?? "").trim();
  if (!projectId) throw new Error("project_id_required");
  if (!providerVolumeId) throw new Error("provider_volume_id_required");
  const { client, authSubject } = await bootstrapConvexOwnerId(params.session as CloudAuthSession);
  const row = (await client.mutation("projects:attachCloudProjectVolume" as any, {
    authSubject,
    projectId,
    providerVolumeId,
    providerVolumeName: String(params.providerVolumeName ?? "").trim() || undefined,
  })) as ConvexCloudProjectRow;
  return mapConvexProjectRowToRecord(row);
}

export async function deleteDaytonaCloudProject<TSession>(params: {
  session: TSession;
  projectId: string;
  force?: boolean;
}): Promise<{ ok: boolean }> {
  const projectId = String(params.projectId ?? "").trim();
  if (!projectId) throw new Error("project_id_required");
  const { client, authSubject } = await bootstrapConvexOwnerId(params.session as CloudAuthSession);
  await client.mutation("projects:deleteCloudProject" as any, {
    authSubject,
    projectId,
  });
  return { ok: true };
}

export async function probeDaytonaCloudProject<TSession>(params: {
  session: TSession;
  projectId: string;
}): Promise<{
  sandbox: { status: string | null };
  probe: { stdout_preview: string | null };
}> {
  const projectId = String(params.projectId ?? "").trim();
  if (!projectId) throw new Error("project_id_required");
  const { client, authSubject } = await bootstrapConvexOwnerId(params.session as CloudAuthSession);
  const payload = (await client.action("projects:probeCloudProject" as any, {
    authSubject,
    projectId,
  })) as ConvexCloudProjectProbePayload | null;
  const status = String(payload?.sandbox?.status ?? "").trim().toLowerCase() || null;
  const stdoutPreview = String(payload?.probe?.stdout_preview ?? "").trim() || null;
  return {
    sandbox: { status },
    probe: { stdout_preview: stdoutPreview },
  };
}
