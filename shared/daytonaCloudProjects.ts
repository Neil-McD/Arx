import { normalizeDaytonaSandboxStatus, type DaytonaSandboxStatus } from "./daytonaSandboxStatus";

export const DAYTONA_SANDBOX_STATUS_SELECT_QUERY =
  "daytona_sandboxes?select=project_id,status&provider=eq.daytona";

export type DaytonaAuthenticatedFetch<TSession> = (
  input: string,
  init: RequestInit,
  session: TSession,
) => Promise<Response>;

export type DaytonaReadSupabaseError = (response: Response) => Promise<string>;

type DaytonaCloudProjectsWarn = (message: string, error?: unknown) => void;

export type DaytonaSandboxStatusRow = {
  project_id?: string | null;
  status?: string | null;
};

export type DaytonaCloudProjectRow = {
  id: string;
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
  created_at: number;
  updated_at: number;
  root_path: string;
};

let daytonaSyncStatusesBackoffUntilMs = 0;
const DAYTONA_SYNC_STATUSES_AUTH_BACKOFF_MS = 5 * 60 * 1000;

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
        created_at: params.toEpochSeconds(row.created_at) ?? nowEpochSeconds,
        updated_at: params.toEpochSeconds(row.updated_at) ?? nowEpochSeconds,
        root_path: slug ? `cloud/${slug}` : `cloud/${id}`,
      };
    })
    .filter((project) => Boolean(project.id));
}

export async function fetchMappedDaytonaCloudProjects<TSession>(params: {
  supabaseUrl: string;
  session: TSession;
  fetchWithSupabaseAuth: DaytonaAuthenticatedFetch<TSession>;
  readSupabaseError: DaytonaReadSupabaseError;
  toEpochSeconds: (value: string | null | undefined) => number | null;
  onWarn?: DaytonaCloudProjectsWarn;
}): Promise<DaytonaCloudProjectRecord[]> {
  const warn = params.onWarn ?? ((message: string, error?: unknown) => console.warn(message, error));
  const nowMs = Date.now();
  if (nowMs >= daytonaSyncStatusesBackoffUntilMs) {
    try {
      const syncResponse = await params.fetchWithSupabaseAuth(
        `${params.supabaseUrl}/functions/v1/daytona_sync_statuses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        params.session,
      );
      if (!syncResponse.ok) {
        if (syncResponse.status === 401 || syncResponse.status === 403) {
          daytonaSyncStatusesBackoffUntilMs = Date.now() + DAYTONA_SYNC_STATUSES_AUTH_BACKOFF_MS;
        }
        warn("Failed to sync Daytona sandbox statuses:", await params.readSupabaseError(syncResponse));
      }
    } catch (error) {
      warn("Failed to sync Daytona sandbox statuses:", error);
    }
  }

  const projectsResponse = await params.fetchWithSupabaseAuth(
    `${params.supabaseUrl}/rest/v1/rpc/list_cloud_projects`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
    params.session,
  );
  if (!projectsResponse.ok) {
    throw new Error(await params.readSupabaseError(projectsResponse));
  }

  const rows = (await projectsResponse.json()) as DaytonaCloudProjectRow[];
  let sandboxRows: DaytonaSandboxStatusRow[] = [];
  try {
    const sandboxesResponse = await params.fetchWithSupabaseAuth(
      `${params.supabaseUrl}/rest/v1/${DAYTONA_SANDBOX_STATUS_SELECT_QUERY}`,
      { method: "GET" },
      params.session,
    );
    if (!sandboxesResponse.ok) {
      warn("Failed to load Daytona sandbox statuses:", await params.readSupabaseError(sandboxesResponse));
    } else {
      sandboxRows = (await sandboxesResponse.json()) as DaytonaSandboxStatusRow[];
    }
  } catch (error) {
    warn("Failed to load Daytona sandbox statuses:", error);
  }

  return mapActiveDaytonaCloudProjects({
    rows,
    sandboxRows,
    toEpochSeconds: params.toEpochSeconds,
  });
}

export async function ensureDefaultCloudProject<TSession>(params: {
  supabaseUrl: string;
  session: TSession;
  fetchWithSupabaseAuth: DaytonaAuthenticatedFetch<TSession>;
  readSupabaseError: DaytonaReadSupabaseError;
}): Promise<void> {
  const response = await params.fetchWithSupabaseAuth(
    `${params.supabaseUrl}/rest/v1/rpc/ensure_default_cloud_project`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
    params.session,
  );
  if (!response.ok) {
    throw new Error(await params.readSupabaseError(response));
  }
}
