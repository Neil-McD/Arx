"use node";

import { randomUUID } from "node:crypto";
import { action } from "./_generated/server";
import {
  destroyBlaxelWorkspaceComputer,
  ensureBlaxelWorkspaceComputer,
  executeBlaxelWorkspaceCommand,
  listBlaxelWorkspaceDirectory,
  readBlaxelWorkspaceFile,
  writeBlaxelWorkspaceFile,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  resolveWorkspaceComputerProviderFromServerEnv,
} from "./workspaceComputerProviderPolicy.ts";

type SafeSmokeError = {
  errorName?: string;
  errorMessage?: string;
  responseStatus?: number;
  providerCode?: string;
};

type SafeProviderFailure = {
  status: number;
  code: string;
  message: string;
};

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function redactSensitiveText(value: string): string {
  const clipped = value.slice(0, 500);
  if (/(authorization|api[_-]?key|x-api-key|token|secret|headers|config|bearer\s+)/i.test(clipped)) {
    return "[redacted_provider_error]";
  }
  return clipped;
}

function safeText(value: unknown): string | undefined {
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).slice(0, 500);
  }
  return undefined;
}

function safeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeSmokeError(error: unknown): SafeSmokeError {
  const record = asRecord(error);
  const response = asRecord(record?.response);
  const responseData = asRecord(response?.data);
  return {
    errorName:
      error instanceof Error
        ? safeText(error.name)
        : safeText(record?.name),
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

function safeProviderFailure(value: {
  status: number;
  code: string;
  message: string;
}): SafeProviderFailure {
  return {
    status: value.status,
    code: value.code,
    message: redactSensitiveText(value.message),
  };
}

function safeResourceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
}

function buildSandboxName(): string {
  return safeResourceName(
    `polynet-blaxel-convex-smoke-${randomUUID().slice(0, 8)}`,
  );
}

function initialEvidence() {
  return {
    providerPolicySelected: false,
    sandboxEnsured: false,
    fileWritten: false,
    fileReadBack: false,
    commandRan: false,
    directoryListed: false,
    cleanupOk: false,
  };
}

export const smokeBlaxelConvexSandbox = action({
  args: {},
  handler: async () => {
    const deploymentKind = normalizeDeploymentKind(
      readEnv("POLYNET_DEPLOYMENT_KIND"),
    );

    if (deploymentKind !== "staging") {
      return {
        ok: false,
        code: "blaxel_convex_sandbox_smoke_staging_only",
        deploymentKind,
        providerId: null,
        sandboxName: null,
        evidence: initialEvidence(),
        failures: ["not_staging_deployment"],
        errors: [],
      };
    }

    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    const sandboxName = buildSandboxName();
    const filePath = `${sandboxName}.txt`;
    const marker = `polynet-blaxel-convex-sandbox-smoke:${Date.now()}`;
    const evidence = initialEvidence();
    const failures: string[] = [];
    const errors: Array<SafeProviderFailure | SafeSmokeError> = [];

    evidence.providerPolicySelected = policy.providerId === "blaxel";
    if (!evidence.providerPolicySelected) {
      failures.push("blaxel_policy_not_selected");
      evidence.cleanupOk = true;
      return {
        ok: false,
        code: "blaxel_convex_sandbox_smoke_failed",
        deploymentKind,
        providerId: policy.providerId,
        sandboxName,
        evidence,
        failures,
        errors,
      };
    }

    try {
      const ensured = await ensureBlaxelWorkspaceComputer({
        sandboxName,
        labels: {
          purpose: "convex-sandbox-smoke",
        },
      });
      if (!ensured.ok) {
        failures.push("sandbox_ensure_failed");
        errors.push(safeProviderFailure(ensured));
        return {
          ok: false,
          code: "blaxel_convex_sandbox_smoke_failed",
          deploymentKind,
          providerId: policy.providerId,
          sandboxName,
          evidence,
          failures,
          errors,
        };
      }
      evidence.sandboxEnsured = true;

      const writeResult = await writeBlaxelWorkspaceFile({
        sandboxName,
        path: filePath,
        content: marker,
      });
      if (!writeResult.ok) {
        failures.push("file_write_failed");
        errors.push(safeProviderFailure(writeResult));
      } else {
        evidence.fileWritten = true;
      }

      const readResult = await readBlaxelWorkspaceFile({
        sandboxName,
        path: filePath,
      });
      if (!readResult.ok) {
        failures.push("file_read_failed");
        errors.push(safeProviderFailure(readResult));
      } else {
        evidence.fileReadBack = readResult.content === marker;
        if (!evidence.fileReadBack) failures.push("file_round_trip_mismatch");
      }

      const commandResult = await executeBlaxelWorkspaceCommand({
        sandboxName,
        cwd: ".",
        command: `sh -lc 'test -f ${filePath} && printf convex-sandbox-smoke-ok'`,
        waitForCompletion: true,
        timeoutSeconds: 60,
      });
      if (!commandResult.ok) {
        failures.push("command_failed");
        errors.push(safeProviderFailure(commandResult));
      } else {
        evidence.commandRan =
          commandResult.exitCode === 0 ||
          String(commandResult.stdout ?? "").includes("convex-sandbox-smoke-ok") ||
          commandResult.status === "completed";
        if (!evidence.commandRan) failures.push("command_result_unverified");
      }

      const listResult = await listBlaxelWorkspaceDirectory({
        sandboxName,
        path: ".",
      });
      if (!listResult.ok) {
        failures.push("directory_list_failed");
        errors.push(safeProviderFailure(listResult));
      } else {
        evidence.directoryListed = true;
      }
    } catch (error) {
      failures.push("unexpected_smoke_error");
      errors.push(sanitizeSmokeError(error));
    } finally {
      const cleanup = await destroyBlaxelWorkspaceComputer({ sandboxName });
      evidence.cleanupOk = cleanup.ok;
      if (!cleanup.ok) {
        failures.push("cleanup_failed");
        errors.push(safeProviderFailure(cleanup));
      }
    }

    return {
      ok:
        failures.length === 0 &&
        evidence.providerPolicySelected &&
        evidence.sandboxEnsured &&
        evidence.fileWritten &&
        evidence.fileReadBack &&
        evidence.commandRan &&
        evidence.directoryListed &&
        evidence.cleanupOk,
      code: "blaxel_convex_sandbox_smoke",
      deploymentKind,
      providerId: policy.providerId,
      sandboxName,
      evidence,
      failures,
      errors,
    };
  },
});
