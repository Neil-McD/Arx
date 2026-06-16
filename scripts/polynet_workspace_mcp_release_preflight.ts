import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { POLYNET_MCP_PROTOCOL_VERSION } from "../shared/polynetMcp.ts";

type CheckStatus = "pass" | "fail" | "warn";
type LiveClassification =
  | "ready_for_smoke"
  | "not_released_yet"
  | "web_proxy_ready_but_convex_stale"
  | "live_origin_unreachable"
  | "live_origin_unexpected";

type Check = {
  name: string;
  status: CheckStatus;
  message: string;
  expected?: unknown;
  actual?: unknown;
};

type HttpProbe = {
  ok: boolean;
  url: string;
  status: number | null;
  text: string;
  body: unknown;
  error: string | null;
};

const EXPECTED_PUBLIC_MCP_URL = "https://www.polynet.ai/runtime/mcp";
const PROVIDER_TOOLS = [
  "polynet_list_workspaces",
  "polynet_open_workspace",
  "polynet_get_workspace_context",
  "polynet_workspace_memory_search",
  "polynet_workspace_memory_read",
  "polynet_workspace_record_outcome",
] as const;

function argValue(name: string): string | null {
  const equalPrefix = `${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(equalPrefix)) return arg.slice(equalPrefix.length);
  }
  return null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function printHelp(): never {
  console.log(`PolyNet Workspace MCP release preflight

Usage:
  npm run preflight:polynet-workspace-mcp-release
  npm run preflight:polynet-workspace-mcp-release -- --dev
  npm run preflight:polynet-workspace-mcp-release -- --require-live-ready
  node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_release_preflight.ts --prod

Options:
  --prod                  Check production Convex env. Default for the npm script.
  --dev                   Check development Convex env.
  --url=<url>             Public MCP URL to probe. Defaults to ${EXPECTED_PUBLIC_MCP_URL}.
  --timeout-ms=<ms>       Live HTTP timeout. Defaults to 15000.
  --require-live-ready    Exit nonzero unless the live public origin is ready for smoke.
  --mode=report           Never exit nonzero; print the preflight report only.
`);
  process.exit(0);
}

function readFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function normalizeComparableUrl(raw: string): string {
  return new URL(raw).toString().replace(/\/$/, "");
}

function readMode(): "gate" | "report" {
  return argValue("--mode") === "report" ? "report" : "gate";
}

function readMcpUrl(): string {
  const raw = argValue("--url") ?? process.env.POLYNET_MCP_URL ?? EXPECTED_PUBLIC_MCP_URL;
  const url = new URL(raw);
  if (url.pathname === "" || url.pathname === "/") url.pathname = "/runtime/mcp";
  url.search = "";
  url.hash = "";
  return normalizeComparableUrl(url.toString());
}

function wellKnownUrl(mcpUrl: string, pathname: string): string {
  const url = new URL(mcpUrl);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function readTimeoutMs(): number {
  const raw = argValue("--timeout-ms");
  if (!raw) return 15_000;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 120_000
    ? Math.floor(parsed)
    : 15_000;
}

function parseJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function check(name: string, condition: boolean, message: string, extra: Partial<Check> = {}): Check {
  return {
    name,
    status: condition ? "pass" : "fail",
    message,
    ...extra,
  };
}

function buildLocalChecks(): Check[] {
  const checks: Check[] = [];
  const vercelConfig = JSON.parse(readFile("vercel.json")) as {
    routes?: Array<{ src?: string; dest?: string; handle?: string }>;
  };
  const routes = Array.isArray(vercelConfig.routes) ? vercelConfig.routes : [];
  const filesystemIndex = routes.findIndex((route) => route.handle === "filesystem");
  const routeIndex = (src: string, dest: string): number =>
    routes.findIndex((route) => route.src === src && route.dest === dest);

  for (const route of [
    { src: "/runtime/mcp", dest: "/api/mcp/runtime" },
    { src: "/\\.well-known/oauth-protected-resource", dest: "/api/mcp/oauth-protected-resource" },
    { src: "/\\.well-known/oauth-authorization-server", dest: "/api/mcp/oauth-authorization-server" },
  ]) {
    const index = routeIndex(route.src, route.dest);
    checks.push(check(
      `vercel_route_${route.src}`,
      index >= 0 && filesystemIndex >= 0 && index < filesystemIndex,
      "Vercel MCP route exists before filesystem fallback.",
      { expected: route, actual: { index, filesystemIndex } },
    ));
  }

  for (const path of [
    "api/mcp/_proxy.js",
    "api/mcp/runtime.js",
    "api/mcp/oauth-protected-resource.js",
    "api/mcp/oauth-authorization-server.js",
  ]) {
    try {
      readFile(path);
      checks.push(check(`file_${path}`, true, "Required MCP proxy file exists."));
    } catch {
      checks.push(check(`file_${path}`, false, "Required MCP proxy file is missing."));
    }
  }

  const authConfig = readFile("convex/auth.config.ts");
  checks.push(check(
    "convex_auth_requires_mcp_audience",
    authConfig.includes("ARX_MCP_AUTH_JWT_AUDIENCE is required for hosted MCP JWT audience binding."),
    "Convex auth config requires the hosted MCP JWT audience.",
  ));
  checks.push(check(
    "convex_auth_no_generic_audience_list",
    !authConfig.includes("ARX_AUTH_JWT_ADDITIONAL_AUDIENCES"),
    "Convex auth config does not accept a generic JWT audience list.",
  ));

  const httpMcp = readFile("convex/httpMcp.ts");
  checks.push(check(
    "mcp_registration_explicit_only",
    httpMcp.includes('readEnv("ARX_AUTH_REGISTRATION_URL")') && !httpMcp.includes("/oauth2/register"),
    "OAuth registration endpoint is explicit only and is not inferred.",
  ));
  checks.push(check(
    "mcp_provider_tools_present",
    PROVIDER_TOOLS.every((tool) => httpMcp.includes(`toolName === "${tool}"`)),
    "Provider workspace tools are implemented in the MCP route.",
  ));

  return checks;
}

function convexEnvTarget(): "dev" | "prod" {
  if (hasFlag("--dev")) return "dev";
  return "prod";
}

function runConvexEnvGet(name: string, target: "dev" | "prod"): { ok: boolean; value: string; message: string } {
  const args = ["convex", "env", ...(target === "prod" ? ["--prod"] : []), "get", name];
  const result = spawnSync("npx", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  const output = String(result.stdout || result.stderr || "").trim();
  if (result.status !== 0 || /^✖/.test(output) || /not found/i.test(output)) {
    return {
      ok: false,
      value: "",
      message: output || `convex env get ${name} failed`,
    };
  }
  return { ok: true, value: output, message: "ok" };
}

function buildConvexEnvChecks(target: "dev" | "prod", mcpUrl: string): Check[] {
  const checks: Check[] = [];
  const exact = [
    ["ARX_MCP_RESOURCE_URL", mcpUrl],
    ["ARX_MCP_AUTH_JWT_AUDIENCE", mcpUrl],
  ] as const;
  for (const [name, expected] of exact) {
    const env = runConvexEnvGet(name, target);
    checks.push(check(
      `convex_env_${name}`,
      env.ok && normalizeComparableUrl(env.value) === normalizeComparableUrl(expected),
      `${name} must equal the canonical public MCP resource URL.`,
      { expected, actual: env.ok ? env.value : env.message },
    ));
  }

  for (const name of [
    "ARX_AUTH_JWT_ISSUER",
    "ARX_AUTH_AUTHORIZE_URL",
    "ARX_AUTH_TOKEN_URL",
    "ARX_AUTH_JWT_JWKS_URL",
  ]) {
    const env = runConvexEnvGet(name, target);
    checks.push(check(
      `convex_env_${name}`,
      env.ok && Boolean(env.value),
      `${name} must be present for hosted MCP OAuth metadata.`,
      { actual: env.ok ? "present" : env.message },
    ));
  }

  return checks;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<HttpProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readTimeoutMs());
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: true,
      url,
      status: response.status,
      text: text.slice(0, 4000),
      body: parseJson(text),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      status: null,
      text: "",
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function postJsonRpc(mcpUrl: string, method: string, params: Record<string, unknown> = {}): Promise<HttpProbe> {
  return fetchWithTimeout(mcpUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": POLYNET_MCP_PROTOCOL_VERSION,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
}

async function getJson(url: string): Promise<HttpProbe> {
  return fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
}

function extractToolNames(toolsList: HttpProbe): string[] {
  const result = asRecord(asRecord(toolsList.body)?.result);
  return asArray(result?.tools)
    .map((tool) => asString(asRecord(tool)?.name))
    .filter((name): name is string => Boolean(name));
}

function classifyLive(args: {
  initialize: HttpProbe;
  toolsList: HttpProbe | null;
  protectedResource: HttpProbe;
  authorizationServer: HttpProbe;
  mcpUrl: string;
}): LiveClassification {
  if (!args.initialize.ok || !args.protectedResource.ok || !args.authorizationServer.ok) {
    return "live_origin_unreachable";
  }
  if (
    args.initialize.status === 405 ||
    args.protectedResource.status === 404 ||
    args.authorizationServer.status === 404 ||
    /filename="index\.html"/i.test(args.initialize.text)
  ) {
    return "not_released_yet";
  }
  if (args.initialize.status !== 200 || args.protectedResource.status !== 200 || args.authorizationServer.status !== 200) {
    return "live_origin_unexpected";
  }
  const resource = asString(asRecord(args.protectedResource.body)?.resource);
  if (!resource || normalizeComparableUrl(resource) !== normalizeComparableUrl(args.mcpUrl)) {
    return "web_proxy_ready_but_convex_stale";
  }
  const toolNames = args.toolsList ? extractToolNames(args.toolsList) : [];
  if (!PROVIDER_TOOLS.every((tool) => toolNames.includes(tool))) {
    return "web_proxy_ready_but_convex_stale";
  }
  return "ready_for_smoke";
}

async function buildLiveProbe(mcpUrl: string) {
  const initialize = await postJsonRpc(mcpUrl, "initialize", {
    protocolVersion: POLYNET_MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: "polynet-workspace-mcp-release-preflight",
      version: "0.1.0",
    },
  });
  const toolsList = initialize.status === 200
    ? await postJsonRpc(mcpUrl, "tools/list")
    : null;
  const protectedResource = await getJson(wellKnownUrl(mcpUrl, "/.well-known/oauth-protected-resource"));
  const authorizationServer = await getJson(wellKnownUrl(mcpUrl, "/.well-known/oauth-authorization-server"));
  const classification = classifyLive({
    initialize,
    toolsList,
    protectedResource,
    authorizationServer,
    mcpUrl,
  });
  return {
    ok: classification === "ready_for_smoke",
    classification,
    probes: {
      initialize: {
        ok: initialize.ok,
        status: initialize.status,
        error: initialize.error,
      },
      toolsList: toolsList
        ? {
            ok: toolsList.ok,
            status: toolsList.status,
            providerToolsPresent: PROVIDER_TOOLS.every((tool) => extractToolNames(toolsList).includes(tool)),
            toolNames: extractToolNames(toolsList),
          }
        : null,
      protectedResource: {
        ok: protectedResource.ok,
        status: protectedResource.status,
        resource: asString(asRecord(protectedResource.body)?.resource),
        error: protectedResource.error,
      },
      authorizationServer: {
        ok: authorizationServer.ok,
        status: authorizationServer.status,
        issuer: asString(asRecord(authorizationServer.body)?.issuer),
        error: authorizationServer.error,
      },
    },
  };
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) printHelp();
  const mode = readMode();
  const target = convexEnvTarget();
  const requireLiveReady = hasFlag("--require-live-ready");
  const mcpUrl = readMcpUrl();
  const localChecks = buildLocalChecks();
  const convexEnvChecks = buildConvexEnvChecks(target, mcpUrl);
  const live = await buildLiveProbe(mcpUrl);
  const localOk = localChecks.every((item) => item.status !== "fail");
  const convexEnvOk = convexEnvChecks.every((item) => item.status !== "fail");
  const blocksRelease = !localOk || !convexEnvOk;
  const blocksLiveSmoke = !live.ok;
  const report = {
    ok: !blocksRelease && (!requireLiveReady || !blocksLiveSmoke),
    readOnly: true,
    mode,
    target: {
      convex: target,
      mcpUrl,
      requireLiveReady,
    },
    local: {
      ok: localOk,
      checks: localChecks,
    },
    convexEnv: {
      ok: convexEnvOk,
      target,
      checks: convexEnvChecks,
    },
    live,
    releaseGate: {
      blocksRelease,
      blocksLiveSmoke,
      exitCodeWhenRunAsGate: blocksRelease || (requireLiveReady && blocksLiveSmoke) ? 1 : 0,
      reason: blocksRelease
        ? "local_or_convex_env_release_preflight_failed"
        : requireLiveReady && blocksLiveSmoke
          ? `live_public_origin_not_ready:${live.classification}`
          : "release_preflight_passed",
    },
  };
  console.log(JSON.stringify(report, null, 2));
  if (mode === "gate" && report.releaseGate.exitCodeWhenRunAsGate !== 0) {
    process.exitCode = report.releaseGate.exitCodeWhenRunAsGate;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  main().catch((error) => {
    console.error(`polynet_workspace_mcp_release_preflight: failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
