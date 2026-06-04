"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  CODEX_BRIDGE_EVENT_URL_ENV_NAME,
  CODEX_BRIDGE_FINISH_URL_ENV_NAME,
  CODEX_BRIDGE_RUN_ID_ENV_NAME,
  CODEX_BRIDGE_TOKEN_ENV_NAME,
} from "../shared/codexBridgeContract.ts";
import { verifyCodexBridgeOperatorToken } from "./codexBridgeOperatorGate.ts";
import { mintCodexBridgeRunToken } from "./codexBridgeToken.ts";
import {
  ensureBlaxelWorkspaceComputer,
  executeBlaxelWorkspaceCommand,
} from "./blaxelWorkspaceComputerProvider.ts";
import { buildBlaxelProjectWorkspaceNames } from "./blaxelWorkspaceProjectNames.ts";
import { resolveWorkspaceComputerProviderFromServerEnv } from "./workspaceComputerProviderPolicy.ts";

type BridgeSmokeEvidence = {
  stagingOnly: boolean;
  operatorAuthorized: boolean;
  providerPolicySelected: boolean;
  projectLoaded: boolean;
  sandboxEnsured: boolean;
  runStarted: boolean;
  tokenMinted: boolean;
  commandRan: boolean;
  eventCallbackOk: boolean;
  finishCallbackOk: boolean;
  ledgerEventVisible: boolean;
  runFinished: boolean;
};

type BridgeSmokeError = {
  errorName?: string;
  errorMessage?: string;
  responseStatus?: number;
  providerCode?: string;
};

type BridgeSmokeResult = {
  ok: boolean;
  code: string;
  deploymentKind: string;
  projectId: string;
  threadId: string;
  ownerId: string | null;
  runId: string;
  sandboxName: string | null;
  evidence: BridgeSmokeEvidence;
  outputs: {
    stdout?: string | null;
    stderr?: string | null;
    status?: string | null;
    exitCode?: number | null;
  };
  failures: string[];
  errors: BridgeSmokeError[];
};

const ECHO_COMMAND = `node - <<'POLYNET_CODEX_BRIDGE_NODE'
const token = process.env.POLYNET_CODEX_BRIDGE_TOKEN;
const runId = process.env.POLYNET_CODEX_BRIDGE_RUN_ID;
const eventUrl = process.env.POLYNET_CODEX_BRIDGE_EVENT_URL;
const finishUrl = process.env.POLYNET_CODEX_BRIDGE_FINISH_URL;
const marker = process.env.POLYNET_CODEX_BRIDGE_ECHO_MARKER || "missing-marker";

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(text.slice(0, 2000));
    process.exit(1);
  }
  return text ? JSON.parse(text) : {};
}

if (!token || !runId || !eventUrl || !finishUrl) {
  console.error("missing_bridge_env");
  process.exit(1);
}

await postJson(eventUrl, {
  version: 1,
  runId,
  eventType: "codex_bridge_echo",
  eventKey: "codex_bridge_echo",
  source: "bridge_echo",
  payload: {
    ok: true,
    marker,
  },
  createdAt: Date.now(),
});

await postJson(finishUrl, {
  version: 1,
  runId,
  status: "succeeded",
  reason: "codex_bridge_echo_smoke",
  finishedAt: Date.now(),
});

console.log("BRIDGE_ECHO_OK");
POLYNET_CODEX_BRIDGE_NODE`;

function readEnv(name: string): string {
  try {
    const value = (globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }).process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function normalizeDeploymentKind(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeBaseUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function resolveBridgeBaseUrl(raw: unknown): string | null {
  return (
    normalizeBaseUrl(raw) ??
    normalizeBaseUrl(readEnv("POLYNET_CODEX_BRIDGE_BASE_URL")) ??
    normalizeBaseUrl(readEnv("CONVEX_SITE_URL")) ??
    normalizeBaseUrl(readEnv("VITE_CONVEX_SITE_URL")) ??
    normalizeBaseUrl(readEnv("PUBLIC_CONVEX_SITE_URL"))
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function redactSensitiveText(value: string): string {
  const clipped = value.slice(0, 800);
  if (/(authorization|api[_-]?key|x-api-key|token|secret|headers|config|bearer\s+)/i.test(clipped)) {
    return "[redacted_provider_error]";
  }
  return clipped;
}

function safeText(value: unknown): string | undefined {
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value).slice(0, 800);
  return undefined;
}

function safeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeSmokeError(error: unknown): BridgeSmokeError {
  const record = asRecord(error);
  const response = asRecord(record?.response);
  const responseData = asRecord(response?.data);
  return {
    errorName: error instanceof Error ? safeText(error.name) : safeText(record?.name),
    errorMessage:
      error instanceof Error
        ? safeText(error.message)
        : safeText(record?.message) ??
          safeText(record?.error) ??
          safeText(responseData?.message) ??
          safeText(responseData?.error),
    responseStatus: safeNumber(record?.status ?? record?.statusCode ?? response?.status),
    providerCode: safeText(record?.code ?? responseData?.code),
  };
}

function initialEvidence(): BridgeSmokeEvidence {
  return {
    stagingOnly: false,
    operatorAuthorized: false,
    providerPolicySelected: false,
    projectLoaded: false,
    sandboxEnsured: false,
    runStarted: false,
    tokenMinted: false,
    commandRan: false,
    eventCallbackOk: false,
    finishCallbackOk: false,
    ledgerEventVisible: false,
    runFinished: false,
  };
}

function buildRunId(raw: unknown): string {
  const provided = String(raw ?? "").trim();
  if (provided) return provided.slice(0, 180);
  return `codex_bridge_echo_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export const smokeCodexBridgeEcho = action({
  args: {
    projectId: v.id("cloudProjects"),
    threadId: v.id("threads"),
    operatorToken: v.string(),
    runId: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<BridgeSmokeResult> => {
    const deploymentKind = normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND"));
    const evidence = initialEvidence();
    const failures: string[] = [];
    const errors: BridgeSmokeError[] = [];
    const runId = buildRunId(args.runId);
    const explicitBaseUrl = String(args.baseUrl ?? "").trim();
    let projectId = String(args.projectId);
    let threadId = String(args.threadId);
    let names = buildBlaxelProjectWorkspaceNames(args.projectId);
    let ownerId: string | null = null;

    evidence.stagingOnly = deploymentKind === "staging";
    if (!evidence.stagingOnly) {
      return {
        ok: false,
        code: "codex_bridge_echo_smoke_staging_only",
        deploymentKind,
        projectId: String(args.projectId),
        threadId: String(args.threadId),
        ownerId,
        runId,
        sandboxName: names.sandboxName,
        evidence,
        outputs: {},
        failures: ["not_staging_deployment"],
        errors,
      };
    }

    const operator = await verifyCodexBridgeOperatorToken(args.operatorToken, {
      action: "codex_bridge_echo_smoke",
      runId,
      projectId: String(args.projectId),
      threadId: String(args.threadId),
      baseUrl: explicitBaseUrl || null,
    });
    evidence.operatorAuthorized = operator.ok;
    if (!operator.ok) {
      failures.push(operator.code);
      errors.push({
        providerCode: operator.code,
        errorMessage: operator.message,
      });
      return {
        ok: false,
        code: "codex_bridge_echo_smoke_failed",
        deploymentKind,
        projectId: String(args.projectId),
        threadId: String(args.threadId),
        ownerId,
        runId,
        sandboxName: names.sandboxName,
        evidence,
        outputs: {},
        failures,
        errors,
      };
    }

    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    evidence.providerPolicySelected = policy.providerId === "blaxel";
    if (!evidence.providerPolicySelected) failures.push("blaxel_policy_not_selected");

    const baseUrl = resolveBridgeBaseUrl(args.baseUrl);
    if (!baseUrl) failures.push("bridge_base_url_missing");

    try {
      const scope = (await ctx.runQuery(
        (internal as any).threads.resolveCodexBridgeRunScopeInternal as any,
        {
          threadId: args.threadId,
          expectedProjectId: args.projectId,
        },
      )) as Record<string, unknown> | null;
      evidence.projectLoaded = Boolean(scope);
      ownerId = normalizeOptionalString(scope?.ownerId);
      projectId = normalizeOptionalString(scope?.projectId) ?? projectId;
      threadId = normalizeOptionalString(scope?.threadId) ?? threadId;
      names = buildBlaxelProjectWorkspaceNames(projectId);
      const communityId = normalizeOptionalString(scope?.communityId);
      const communityContextVersion =
        typeof scope?.communityContextVersion === "number" &&
        Number.isFinite(scope.communityContextVersion)
          ? Math.floor(scope.communityContextVersion)
          : undefined;
      if (!scope) failures.push("bridge_scope_missing");
      if (!ownerId) failures.push("bridge_scope_owner_missing");
      if (!projectId) failures.push("bridge_scope_project_missing");
      if (!threadId) failures.push("bridge_scope_thread_missing");

      if (failures.length > 0 || !ownerId || !projectId || !threadId || !baseUrl) {
        return {
          ok: false,
          code: "codex_bridge_echo_smoke_failed",
          deploymentKind,
          projectId,
          threadId,
          ownerId,
          runId,
          sandboxName: names.sandboxName,
          evidence,
          outputs: {},
          failures,
          errors,
        };
      }

      const minted = await mintCodexBridgeRunToken({
        runId,
        ownerId,
        threadId,
        projectId,
        communityId,
        operations: ["event", "finish"],
        ttlMs: 10 * 60 * 1000,
      });
      if (!minted.ok) {
        failures.push(minted.code);
        errors.push({
          responseStatus: minted.status,
          providerCode: minted.code,
          errorMessage: minted.message,
        });
        return {
          ok: false,
          code: "codex_bridge_echo_smoke_failed",
          deploymentKind,
          projectId,
          threadId,
          ownerId,
          runId,
          sandboxName: names.sandboxName,
          evidence,
          outputs: {},
          failures,
          errors,
        };
      }
      evidence.tokenMinted = true;

      const ensured = await ensureBlaxelWorkspaceComputer({
        sandboxName: names.sandboxName,
        volumeName: names.volumeName,
        lifecycleIntent: "agent_run",
        labels: {
          purpose: "codex-bridge-echo-smoke",
          project_id: projectId,
          owner_id: ownerId,
        },
      });
      if (!ensured.ok) {
        failures.push("sandbox_ensure_failed");
        errors.push({
          responseStatus: ensured.status,
          providerCode: ensured.code,
          errorMessage: redactSensitiveText(ensured.message),
        });
        return {
          ok: false,
          code: "codex_bridge_echo_smoke_failed",
          deploymentKind,
          projectId,
          threadId,
          ownerId,
          runId,
          sandboxName: names.sandboxName,
          evidence,
          outputs: {},
          failures,
          errors,
        };
      }
      evidence.sandboxEnsured = true;

      const run = (await ctx.runMutation(
        (internal as any).threads.ensureCloudRuntimeRunStartedByBridgeInternal as any,
        {
          ownerId: ownerId as any,
          threadId: args.threadId,
          runId,
          lane: "runtime",
          visibility: "internal_hidden",
          projectId: projectId as any,
          ...(communityId ? { communityId: communityId as any } : null),
          ...(typeof communityContextVersion === "number" ? { communityContextVersion } : null),
          executionMode: "codex_bridge_echo",
          contractName: "codex_blaxel_bridge",
          contractVersion: "v1",
          harnessProfile: "codex_blaxel_bridge_poc",
          harnessProfileSource: "codex_bridge_smoke",
          capabilityFamilies: ["codex_bridge", "blaxel_process"],
          nowMs: Date.now(),
        },
      )) as Record<string, unknown> | null;
      evidence.runStarted = Boolean(run);

      const commandResult = await executeBlaxelWorkspaceCommand({
        sandboxName: names.sandboxName,
        cwd: ".",
        command: ECHO_COMMAND,
        processName: `codex-bridge-echo-${randomUUID().slice(0, 8)}`,
        waitForCompletion: true,
        timeoutSeconds: 60,
        env: {
          [CODEX_BRIDGE_TOKEN_ENV_NAME]: minted.token,
          [CODEX_BRIDGE_RUN_ID_ENV_NAME]: runId,
          [CODEX_BRIDGE_EVENT_URL_ENV_NAME]: `${baseUrl}/runtime/codex_bridge/event`,
          [CODEX_BRIDGE_FINISH_URL_ENV_NAME]: `${baseUrl}/runtime/codex_bridge/finish`,
          POLYNET_CODEX_BRIDGE_ECHO_MARKER: `codex-bridge-echo:${Date.now()}`,
        },
        readyRetryMs: 60_000,
      });
      const outputs = commandResult.ok
        ? {
            stdout: redactSensitiveText(String(commandResult.stdout ?? "").slice(0, 800)),
            stderr: redactSensitiveText(String(commandResult.stderr ?? "").slice(0, 800)),
            status: commandResult.status,
            exitCode: commandResult.exitCode,
          }
        : {};
      if (!commandResult.ok) {
        failures.push("bridge_echo_command_failed");
        errors.push({
          responseStatus: commandResult.status,
          providerCode: commandResult.code,
          errorMessage: redactSensitiveText(commandResult.message),
        });
      } else {
        evidence.commandRan =
          commandResult.exitCode === 0 ||
          String(commandResult.stdout ?? "").includes("BRIDGE_ECHO_OK") ||
          commandResult.status === "completed";
        if (!evidence.commandRan) failures.push("bridge_echo_command_unverified");
      }

      const events = (await ctx.runQuery(
        (internal as any).threads.listRuntimeRunEventsByOwnerRunIdInternal as any,
        {
          ownerId: ownerId as any,
          runId,
        },
      )) as Array<Record<string, unknown>>;
      evidence.eventCallbackOk = events.some((event) => event.eventType === "codex_bridge_echo");
      evidence.finishCallbackOk = events.some((event) => event.eventType === "run_finished");
      evidence.ledgerEventVisible = evidence.eventCallbackOk && evidence.finishCallbackOk;
      if (!evidence.finishCallbackOk) {
        try {
          await ctx.runMutation(
            (internal as any).threads.finishCloudRuntimeRunByBridgeClaimsInternal as any,
            {
              ownerId: ownerId as any,
              threadId: args.threadId,
              runId,
              claimProjectId: projectId,
              claimCommunityId: communityId ?? undefined,
              status: "error",
              reason: "codex_bridge_echo_smoke_failed_before_finish_callback",
              errorCode: "codex_bridge_echo_smoke_failed",
              errorMessage: failures.join(", ").slice(0, 1000) || "Codex bridge echo smoke failed.",
              nowMs: Date.now(),
            },
          );
        } catch {
          // Best-effort smoke cleanup. The callback evidence above remains the verification source.
        }
      }

      const refreshedRun = (await ctx.runQuery(
        (internal as any).threads.getRuntimeRunByOwnerRunIdInternal as any,
        {
          ownerId: ownerId as any,
          runId,
        },
      )) as Record<string, unknown> | null;
      evidence.runFinished = refreshedRun?.status === "ok";
      if (!evidence.eventCallbackOk) failures.push("bridge_event_not_visible");
      if (!evidence.finishCallbackOk) failures.push("bridge_finish_not_visible");
      if (!evidence.runFinished) failures.push("bridge_run_not_finished");

      return {
        ok:
          failures.length === 0 &&
          Object.values(evidence).every((value) => value === true),
        code: "codex_bridge_echo_smoke",
        deploymentKind,
        projectId,
        threadId,
        ownerId,
        runId,
        sandboxName: names.sandboxName,
        evidence,
        outputs,
        failures,
        errors,
      };
    } catch (error) {
      failures.push("unexpected_bridge_smoke_error");
      errors.push(sanitizeSmokeError(error));
      return {
        ok: false,
        code: "codex_bridge_echo_smoke_failed",
        deploymentKind,
        projectId,
        threadId,
        ownerId,
        runId,
        sandboxName: names.sandboxName,
        evidence,
        outputs: {},
        failures,
        errors,
      };
    }
  },
});
