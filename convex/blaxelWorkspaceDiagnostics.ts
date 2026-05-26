"use node";

import { action } from "./_generated/server";
import {
  resolveWorkspaceComputerProviderFromServerEnv,
} from "./workspaceComputerProviderPolicy.ts";

type SafeDiagnosticError = {
  errorName?: string;
  errorMessage?: string;
  responseStatus?: number;
  providerCode?: string;
};

type BlaxelRuntimeSdkDiagnostic = {
  importAttempted: boolean;
  importOk: boolean;
  sandboxInstanceExport: boolean;
  volumeInstanceExport: boolean;
  error: SafeDiagnosticError | null;
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

function sanitizeDiagnosticError(error: unknown): SafeDiagnosticError {
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

async function diagnoseBlaxelSdkImport():
  Promise<BlaxelRuntimeSdkDiagnostic> {
  try {
    const mod = await import("@blaxel/core");
    return {
      importAttempted: true,
      importOk: true,
      sandboxInstanceExport: Boolean(mod.SandboxInstance),
      volumeInstanceExport: Boolean(mod.VolumeInstance),
      error: null,
    };
  } catch (error) {
    return {
      importAttempted: true,
      importOk: false,
      sandboxInstanceExport: false,
      volumeInstanceExport: false,
      error: sanitizeDiagnosticError(error),
    };
  }
}

export const diagnoseBlaxelConvexRuntime = action({
  args: {},
  handler: async () => {
    const deploymentKind = normalizeDeploymentKind(
      readEnv("POLYNET_DEPLOYMENT_KIND"),
    );

    if (deploymentKind !== "staging") {
      return {
        ok: false,
        code: "blaxel_diagnostic_staging_only",
        deploymentKind,
        policy: null,
        env: {
          blWorkspacePresent: false,
          blApiKeyPresent: false,
        },
        sdk: {
          importAttempted: false,
          importOk: false,
          sandboxInstanceExport: false,
          volumeInstanceExport: false,
          error: null,
        },
        noSandboxCreated: true,
      };
    }

    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    const env = {
      blWorkspacePresent: Boolean(readEnv("BL_WORKSPACE")),
      blApiKeyPresent: Boolean(readEnv("BL_API_KEY")),
    };
    const sdk = await diagnoseBlaxelSdkImport();
    return {
      ok:
        policy.providerId === "blaxel" &&
        env.blWorkspacePresent &&
        env.blApiKeyPresent &&
        sdk.importOk &&
        sdk.sandboxInstanceExport &&
        sdk.volumeInstanceExport,
      code: "blaxel_convex_runtime_diagnostic",
      deploymentKind,
      policy,
      env,
      sdk,
      noSandboxCreated: true,
    };
  },
});
