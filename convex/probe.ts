import { action, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedActor } from "./authActor";
import { loadDaytonaConfig, daytonaHeaders } from "./daytonaSandboxClient";
import { isCreatorDevTierOverrideEmail } from "../shared/devTierOverride";

export const health = query({
  args: {},
  handler: async () => {
    return {
      ok: true,
      nowMs: Date.now(),
      source: "convex",
    };
  },
});

type DaytonaProbeResult = {
  label: string;
  method: "GET";
  path: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  bodyPreview: string | null;
};

function truncatePreview(value: string, maxLength = 280): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

async function runDaytonaProbeRequest(params: {
  apiBaseUrl: string;
  headers: Record<string, string>;
  label: string;
  path: string;
}): Promise<DaytonaProbeResult> {
  try {
    const response = await fetch(`${params.apiBaseUrl}${params.path}`, {
      method: "GET",
      headers: params.headers,
    });
    const text = await response.text();
    return {
      label: params.label,
      method: "GET",
      path: params.path,
      ok: response.ok,
      status: response.status,
      contentType: (response.headers.get("content-type") ?? "").trim() || null,
      bodyPreview: truncatePreview(text) || null,
    };
  } catch (error) {
    return {
      label: params.label,
      method: "GET",
      path: params.path,
      ok: false,
      status: null,
      contentType: null,
      bodyPreview: truncatePreview(error instanceof Error ? error.message : String(error)) || null,
    };
  }
}

export const probeDaytonaWorkspaceAccess = action({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    if (!isCreatorDevTierOverrideEmail(actor.email)) {
      throw new Error("daytona_probe_forbidden");
    }

    const loadedConfig = loadDaytonaConfig();
    if (!loadedConfig.ok) {
      return {
        ok: false,
        summary: loadedConfig.message,
        config: {
          api_base_url: null,
          auth_header_mode: "bearer",
          has_org_id: false,
          has_target: false,
          has_snapshot: false,
        },
        probes: [] as DaytonaProbeResult[],
      };
    }

    const config = loadedConfig.config;
    const headers = daytonaHeaders(config, false);
    const probes = await Promise.all([
      runDaytonaProbeRequest({
        apiBaseUrl: config.apiBaseUrl,
        headers,
        label: "list_volumes",
        path: "/volumes",
      }),
      runDaytonaProbeRequest({
        apiBaseUrl: config.apiBaseUrl,
        headers,
        label: "lookup_workspace_volume_by_name",
        path: "/volumes/by-name/arx-workspace-probe",
      }),
      runDaytonaProbeRequest({
        apiBaseUrl: config.apiBaseUrl,
        headers,
        label: "list_sandboxes",
        path: "/sandbox",
      }),
    ]);

    const ok = probes.every((probe) => probe.ok || probe.status === 404);
    const firstFailure = probes.find((probe) => !probe.ok && probe.status !== 404) ?? null;

    return {
      ok,
      summary:
        firstFailure
          ? `Daytona ${firstFailure.method} ${firstFailure.path} failed (${firstFailure.status ?? "network"}).`
          : "Daytona workspace access probe passed.",
      config: {
        api_base_url: config.apiBaseUrl,
        auth_header_mode: "bearer",
        has_org_id: Boolean(config.orgId),
        has_target: Boolean(config.target),
        has_snapshot: Boolean(config.snapshot),
      },
      probes,
    };
  },
});
