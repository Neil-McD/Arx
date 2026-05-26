"use node";

import { randomUUID } from "node:crypto";
import { action } from "./_generated/server";
import {
  destroyBlaxelWorkspaceComputer,
  ensureBlaxelWorkspaceComputer,
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

function buildSandboxName(phase: "hot" | "cold"): string {
  return safeResourceName(
    `polynet-blaxel-volume-${phase}-${randomUUID().slice(0, 8)}`,
  );
}

function initialEvidence() {
  return {
    providerPolicySelected: false,
    hotSandboxEnsured: false,
    markerWritten: false,
    hotMarkerReadBack: false,
    hotSandboxDestroyed: false,
    coldSandboxEnsured: false,
    coldMarkerReadBack: false,
    coldDirectoryListed: false,
    coldSandboxDestroyed: false,
  };
}

export const smokeBlaxelConvexVolume = action({
  args: {},
  handler: async () => {
    const deploymentKind = normalizeDeploymentKind(
      readEnv("POLYNET_DEPLOYMENT_KIND"),
    );

    if (deploymentKind !== "staging") {
      return {
        ok: false,
        blocked: false,
        code: "blaxel_convex_volume_smoke_staging_only",
        deploymentKind,
        providerId: null,
        volumeName: null,
        hotSandboxName: null,
        coldSandboxName: null,
        volumeCleanupMode: "not_created",
        evidence: initialEvidence(),
        failures: ["not_staging_deployment"],
        errors: [],
      };
    }

    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    const volumeName = "polynet-blaxel-convex-volume-smoke";
    const hotSandboxName = buildSandboxName("hot");
    const coldSandboxName = buildSandboxName("cold");
    const markerPath = "volume-smoke-marker.txt";
    const marker = `polynet-blaxel-convex-volume-smoke:${Date.now()}`;
    const evidence = initialEvidence();
    const failures: string[] = [];
    const errors: Array<SafeProviderFailure | SafeSmokeError> = [];
    let blocked = false;
    let blockingCode: string | null = null;
    let volumeWasCreatedOrReused = false;

    evidence.providerPolicySelected = policy.providerId === "blaxel";
    if (!evidence.providerPolicySelected) {
      failures.push("blaxel_policy_not_selected");
      evidence.hotSandboxDestroyed = true;
      evidence.coldSandboxDestroyed = true;
      return {
        ok: false,
        blocked,
        blockingCode,
        code: "blaxel_convex_volume_smoke_failed",
        deploymentKind,
        providerId: policy.providerId,
        volumeName,
        hotSandboxName,
        coldSandboxName,
        volumeCleanupMode: "not_created",
        evidence,
        failures,
        errors,
      };
    }

    try {
      const hotEnsure = await ensureBlaxelWorkspaceComputer({
        sandboxName: hotSandboxName,
        volumeName,
        volumeSizeMb: 8,
        labels: {
          purpose: "convex-volume-smoke",
          phase: "hot",
        },
      });
      if (!hotEnsure.ok) {
        failures.push("hot_sandbox_ensure_failed");
        errors.push(safeProviderFailure(hotEnsure));
        if (hotEnsure.code === "blaxel_volume_quota_exceeded") {
          blocked = true;
          blockingCode = hotEnsure.code;
        }
        return {
          ok: false,
          blocked,
          blockingCode,
          code: "blaxel_convex_volume_smoke_failed",
          deploymentKind,
          providerId: policy.providerId,
          volumeName,
          hotSandboxName,
          coldSandboxName,
          volumeCleanupMode: "not_created",
          evidence,
          failures,
          errors,
        };
      }
      evidence.hotSandboxEnsured = true;
      volumeWasCreatedOrReused = true;

      const writeResult = await writeBlaxelWorkspaceFile({
        sandboxName: hotSandboxName,
        path: markerPath,
        content: marker,
      });
      if (!writeResult.ok) {
        failures.push("marker_write_failed");
        errors.push(safeProviderFailure(writeResult));
      } else {
        evidence.markerWritten = true;
      }

      const hotRead = await readBlaxelWorkspaceFile({
        sandboxName: hotSandboxName,
        path: markerPath,
      });
      if (!hotRead.ok) {
        failures.push("hot_marker_read_failed");
        errors.push(safeProviderFailure(hotRead));
      } else {
        evidence.hotMarkerReadBack = hotRead.content === marker;
        if (!evidence.hotMarkerReadBack) failures.push("hot_marker_mismatch");
      }

      const hotCleanup = await destroyBlaxelWorkspaceComputer({
        sandboxName: hotSandboxName,
      });
      evidence.hotSandboxDestroyed = hotCleanup.ok;
      if (!hotCleanup.ok) {
        failures.push("hot_cleanup_failed");
        errors.push(safeProviderFailure(hotCleanup));
      }

      if (evidence.hotSandboxDestroyed) {
        const coldEnsure = await ensureBlaxelWorkspaceComputer({
          sandboxName: coldSandboxName,
          volumeName,
          volumeSizeMb: 8,
          labels: {
            purpose: "convex-volume-smoke",
            phase: "cold",
          },
        });
        if (!coldEnsure.ok) {
          failures.push("cold_sandbox_ensure_failed");
          errors.push(safeProviderFailure(coldEnsure));
        } else {
          evidence.coldSandboxEnsured = true;
        }
      }

      if (evidence.coldSandboxEnsured) {
        const coldRead = await readBlaxelWorkspaceFile({
          sandboxName: coldSandboxName,
          path: markerPath,
        });
        if (!coldRead.ok) {
          failures.push("cold_marker_read_failed");
          errors.push(safeProviderFailure(coldRead));
        } else {
          evidence.coldMarkerReadBack = coldRead.content === marker;
          if (!evidence.coldMarkerReadBack) failures.push("cold_marker_mismatch");
        }

        const coldList = await listBlaxelWorkspaceDirectory({
          sandboxName: coldSandboxName,
          path: ".",
        });
        if (!coldList.ok) {
          failures.push("cold_directory_list_failed");
          errors.push(safeProviderFailure(coldList));
        } else {
          evidence.coldDirectoryListed = true;
        }
      }
    } catch (error) {
      failures.push("unexpected_volume_smoke_error");
      errors.push(sanitizeSmokeError(error));
    } finally {
      if (!evidence.hotSandboxDestroyed) {
        const hotCleanup = await destroyBlaxelWorkspaceComputer({
          sandboxName: hotSandboxName,
        });
        evidence.hotSandboxDestroyed = hotCleanup.ok;
        if (!hotCleanup.ok) {
          failures.push("hot_cleanup_failed");
          errors.push(safeProviderFailure(hotCleanup));
        }
      }
      if (!evidence.coldSandboxDestroyed) {
        const coldCleanup = await destroyBlaxelWorkspaceComputer({
          sandboxName: coldSandboxName,
        });
        evidence.coldSandboxDestroyed = coldCleanup.ok;
        if (!coldCleanup.ok) {
          failures.push("cold_cleanup_failed");
          errors.push(safeProviderFailure(coldCleanup));
        }
      }
    }

    return {
      ok:
        failures.length === 0 &&
        evidence.providerPolicySelected &&
        evidence.hotSandboxEnsured &&
        evidence.markerWritten &&
        evidence.hotMarkerReadBack &&
        evidence.hotSandboxDestroyed &&
        evidence.coldSandboxEnsured &&
        evidence.coldMarkerReadBack &&
        evidence.coldDirectoryListed &&
        evidence.coldSandboxDestroyed,
      blocked,
      blockingCode,
      code: "blaxel_convex_volume_smoke",
      deploymentKind,
      providerId: policy.providerId,
      volumeName,
      hotSandboxName,
      coldSandboxName,
      volumeCleanupMode: volumeWasCreatedOrReused
        ? "stable_volume_retained_for_reuse"
        : "not_created",
      evidence,
      failures,
      errors,
    };
  },
});
