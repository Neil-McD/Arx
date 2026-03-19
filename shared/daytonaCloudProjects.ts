import { type CloudAuthSession } from "./cloudAuthSession";
import { bootstrapGatewayAuthContext } from "./cloudGateway";

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
  providerVolumeId?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
};

// Gateway class: authenticated read/mutation/action bridge, caller-hardened session, fail-closed.

function mapConvexProjectRowToRecord(row: ConvexCloudProjectRow): DaytonaCloudProjectRecord {
  const id = String(row._id ?? "").trim();
  const createdAtMs = Number(row.createdAt ?? Date.now());
  const updatedAtMs = Number(row.updatedAt ?? Date.now());
  return {
    id,
    name: "Workspace",
    description: null,
    slug: null,
    status: "active",
    provider_volume_id: typeof row.providerVolumeId === "string" ? row.providerVolumeId : null,
    provider_volume_name: null,
    created_at: Number.isFinite(createdAtMs) ? Math.floor(createdAtMs / 1000) : Math.floor(Date.now() / 1000),
    updated_at: Number.isFinite(updatedAtMs) ? Math.floor(updatedAtMs / 1000) : Math.floor(Date.now() / 1000),
    root_path: "workspace",
  };
}

async function fetchMappedDaytonaCloudProjectsViaConvex<TSession>(params: {
  session: TSession;
}): Promise<DaytonaCloudProjectRecord[]> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as CloudAuthSession);
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
}): Promise<string> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session as CloudAuthSession);
  const row = (await client.mutation("projects:ensureDefaultCloudProjectForOwner" as any, {
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
