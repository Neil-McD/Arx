import { type CloudAuthSession } from "./cloudAuthSession";
import { bootstrapGatewayAuthContext, normalizeGatewayNullableString } from "./cloudGateway";

export type CloudDaytonaWorkspaceProbeRow = {
  label: string;
  method: "GET";
  path: string;
  ok: boolean;
  status: number | null;
  content_type: string | null;
  body_preview: string | null;
};

export type CloudDaytonaWorkspaceProbeResult = {
  ok: boolean;
  summary: string;
  config: {
    api_base_url: string | null;
    auth_header_mode: string | null;
    has_org_id: boolean;
    has_target: boolean;
    has_snapshot: boolean;
  };
  probes: CloudDaytonaWorkspaceProbeRow[];
};

export async function probeCloudDaytonaWorkspaceAccess(params: {
  session: CloudAuthSession;
}): Promise<CloudDaytonaWorkspaceProbeResult> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = (await client.action("probe:probeDaytonaWorkspaceAccess" as any, {
    authSubject,
  })) as {
    ok?: unknown;
    summary?: unknown;
    config?: {
      api_base_url?: unknown;
      auth_header_mode?: unknown;
      has_org_id?: unknown;
      has_target?: unknown;
      has_snapshot?: unknown;
    } | null;
    probes?: Array<{
      label?: unknown;
      method?: unknown;
      path?: unknown;
      ok?: unknown;
      status?: unknown;
      contentType?: unknown;
      bodyPreview?: unknown;
    }> | null;
  } | null;

  return {
    ok: payload?.ok === true,
    summary: normalizeGatewayNullableString(payload?.summary) || "Daytona probe failed.",
    config: {
      api_base_url: normalizeGatewayNullableString(payload?.config?.api_base_url),
      auth_header_mode: normalizeGatewayNullableString(payload?.config?.auth_header_mode),
      has_org_id: payload?.config?.has_org_id === true,
      has_target: payload?.config?.has_target === true,
      has_snapshot: payload?.config?.has_snapshot === true,
    },
    probes: Array.isArray(payload?.probes)
      ? payload!.probes.map((row) => ({
          label: normalizeGatewayNullableString(row?.label) || "probe",
          method: "GET",
          path: normalizeGatewayNullableString(row?.path) || "/",
          ok: row?.ok === true,
          status: typeof row?.status === "number" && Number.isFinite(row.status) ? row.status : null,
          content_type: normalizeGatewayNullableString(row?.contentType),
          body_preview: normalizeGatewayNullableString(row?.bodyPreview),
        }))
      : [],
  };
}
