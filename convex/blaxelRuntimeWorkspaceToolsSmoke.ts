"use node";

import { createHash } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  ensureBlaxelWorkspaceComputer,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  buildBlaxelProjectWorkspaceNames,
} from "./blaxelWorkspaceProjectNames.ts";
import {
  resolveWorkspaceComputerProviderFromServerEnv,
} from "./workspaceComputerProviderPolicy.ts";
import {
  executeRuntimeWorkspaceTool,
  type WorkspaceRuntimeToolFailure,
  type WorkspaceRuntimeToolResult,
} from "./workspaceRuntimeTools.ts";
import type {
  BlaxelRuntimeWorkspaceSession,
} from "./workspaceRuntimeSession.ts";
import {
  resolveRecordedWorkspaceResourceProviderId,
  type WorkspaceComputerProviderId,
} from "../shared/workspaceComputerProvider.ts";
import type { RetrievalToolName } from "../shared/retrievalTools.ts";

type SmokeError = {
  errorName?: string;
  errorMessage?: string;
  responseStatus?: number;
  providerCode?: string;
};

type ToolEvidence = {
  providerPolicySelected: boolean;
  projectLoaded: boolean;
  providerOwnershipAccepted: boolean;
  sessionEnsured: boolean;
  providerOwnershipRecorded: boolean;
  listDirOk: boolean;
  writeOk: boolean;
  readOk: boolean;
  bashOk: boolean;
  globOk: boolean;
  grepOk: boolean;
  sha256Ok: boolean;
  editOk: boolean;
  readAfterEditOk: boolean;
  cleanupOk: boolean;
};

type ToolOutputPreview = {
  listDir?: string;
  write?: string;
  read?: string;
  bash?: string;
  glob?: string;
  grep?: string;
  sha256?: string;
  edit?: string;
  readAfterEdit?: string;
  cleanup?: string;
};

type RuntimeToolsSmokeResult = {
  ok: boolean;
  code: string;
  deploymentKind: string;
  providerId: WorkspaceComputerProviderId | null;
  projectId: string;
  sandboxName: string | null;
  volumeName: string | null;
  evidence: ToolEvidence;
  outputs: ToolOutputPreview;
  failures: string[];
  errors: Array<WorkspaceRuntimeToolFailure | SmokeError>;
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

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
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

function sanitizeSmokeError(error: unknown): SmokeError {
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

function initialEvidence(): ToolEvidence {
  return {
    providerPolicySelected: false,
    projectLoaded: false,
    providerOwnershipAccepted: false,
    sessionEnsured: false,
    providerOwnershipRecorded: false,
    listDirOk: false,
    writeOk: false,
    readOk: false,
    bashOk: false,
    globOk: false,
    grepOk: false,
    sha256Ok: false,
    editOk: false,
    readAfterEditOk: false,
    cleanupOk: false,
  };
}

function expectedSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function previewToolOutput(result: WorkspaceRuntimeToolResult): string {
  if (!result.ok) {
    return redactSensitiveText(
      `${result.code}: ${result.message}`.slice(0, 500),
    );
  }
  return redactSensitiveText(String(result.outputText ?? "").slice(0, 500));
}

function safeToolFailure(result: WorkspaceRuntimeToolFailure): WorkspaceRuntimeToolFailure {
  return {
    ok: false,
    status: result.status,
    code: result.code,
    message: redactSensitiveText(result.message),
    details: result.details,
  };
}

function providerMismatchFailure(params: {
  resourceKind: "sandbox" | "volume";
  expectedProviderId: WorkspaceComputerProviderId;
  actualProviderId: WorkspaceComputerProviderId | null;
  resourceId: string | null;
}): WorkspaceRuntimeToolFailure {
  return {
    ok: false,
    status: 409,
    code: "workspace_computer_provider_mismatch",
    message: "This workspace computer is managed by a different provider.",
    details: {
      resource_kind: params.resourceKind,
      expected_provider_id: params.expectedProviderId,
      actual_provider_id: params.actualProviderId,
      resource_id: params.resourceId,
    },
  };
}

function resourceMismatchFailure(params: {
  resourceKind: "sandbox" | "volume";
  expectedResourceId: string;
  actualResourceId: string;
}): WorkspaceRuntimeToolFailure {
  return {
    ok: false,
    status: 409,
    code: "workspace_computer_resource_mismatch",
    message: "This workspace computer is bound to a different provider resource.",
    details: {
      resource_kind: params.resourceKind,
      expected_resource_id: params.expectedResourceId,
      actual_resource_id: params.actualResourceId,
    },
  };
}

function mapProviderFailure(result: {
  status?: number;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}): WorkspaceRuntimeToolFailure {
  return {
    ok: false,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : 503,
    code: String(result.code ?? "workspace_computer_unavailable"),
    message: String(result.message ?? "Workspace computer is unavailable."),
    details: result.details,
  };
}

function validateExistingProviderOwnership(params: {
  project: Record<string, unknown>;
  expectedSandboxId: string;
  expectedVolumeId: string;
}): WorkspaceRuntimeToolFailure | null {
  const existingSandboxId = normalizeOptionalString(params.project.providerSandboxId);
  const existingSandboxProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: params.project.providerSandboxProviderId,
    resourceId: existingSandboxId,
  });
  if (existingSandboxId && existingSandboxProviderId !== "blaxel") {
    return providerMismatchFailure({
      resourceKind: "sandbox",
      expectedProviderId: "blaxel",
      actualProviderId: existingSandboxProviderId,
      resourceId: existingSandboxId,
    });
  }
  if (existingSandboxId && existingSandboxId !== params.expectedSandboxId) {
    return resourceMismatchFailure({
      resourceKind: "sandbox",
      expectedResourceId: params.expectedSandboxId,
      actualResourceId: existingSandboxId,
    });
  }

  const existingVolumeId = normalizeOptionalString(params.project.providerVolumeId);
  const existingVolumeProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: params.project.providerVolumeProviderId,
    resourceId: existingVolumeId,
  });
  if (existingVolumeId && existingVolumeProviderId !== "blaxel") {
    return providerMismatchFailure({
      resourceKind: "volume",
      expectedProviderId: "blaxel",
      actualProviderId: existingVolumeProviderId,
      resourceId: existingVolumeId,
    });
  }
  if (existingVolumeId && existingVolumeId !== params.expectedVolumeId) {
    return resourceMismatchFailure({
      resourceKind: "volume",
      expectedResourceId: params.expectedVolumeId,
      actualResourceId: existingVolumeId,
    });
  }

  return null;
}

async function runTool(params: {
  session: BlaxelRuntimeWorkspaceSession;
  toolName: RetrievalToolName;
  normalizedArgs: Record<string, unknown>;
}) {
  return await executeRuntimeWorkspaceTool({
    session: params.session,
    toolName: params.toolName,
    normalizedArgs: params.normalizedArgs,
  });
}

export const smokeBlaxelRuntimeWorkspaceTools = action({
  args: {
    projectId: v.id("cloudProjects"),
    cleanupFile: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<RuntimeToolsSmokeResult> => {
    const deploymentKind = normalizeDeploymentKind(
      readEnv("POLYNET_DEPLOYMENT_KIND"),
    );
    const evidence = initialEvidence();
    const failures: string[] = [];
    const errors: Array<WorkspaceRuntimeToolFailure | SmokeError> = [];
    const outputs: ToolOutputPreview = {};

    if (deploymentKind !== "staging") {
      return {
        ok: false,
        code: "blaxel_runtime_workspace_tools_smoke_staging_only",
        deploymentKind,
        providerId: null,
        projectId: String(args.projectId),
        sandboxName: null,
        volumeName: null,
        evidence,
        outputs,
        failures: ["not_staging_deployment"],
        errors,
      };
    }

    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    evidence.providerPolicySelected = policy.providerId === "blaxel";
    const names = buildBlaxelProjectWorkspaceNames(args.projectId);
    if (!evidence.providerPolicySelected) {
      failures.push("blaxel_policy_not_selected");
      return {
        ok: false,
        code: "blaxel_runtime_workspace_tools_smoke_failed",
        deploymentKind,
        providerId: policy.providerId,
        projectId: String(args.projectId),
        sandboxName: names.sandboxName,
        volumeName: names.volumeName,
        evidence,
        outputs,
        failures,
        errors,
      };
    }

    try {
      const project = await ctx.runQuery(
        internal.projects.getCloudProjectByIdInternal as any,
        { projectId: args.projectId },
      ) as Record<string, unknown> | null;
      if (!project) {
        failures.push("project_not_found");
        return {
          ok: false,
          code: "blaxel_runtime_workspace_tools_smoke_failed",
          deploymentKind,
          providerId: policy.providerId,
          projectId: String(args.projectId),
          sandboxName: names.sandboxName,
          volumeName: names.volumeName,
          evidence,
          outputs,
          failures,
          errors,
        };
      }
      evidence.projectLoaded = true;

      const ownershipFailure = validateExistingProviderOwnership({
        project,
        expectedSandboxId: names.sandboxName,
        expectedVolumeId: names.volumeName,
      });
      if (ownershipFailure) {
        failures.push(ownershipFailure.code);
        errors.push(safeToolFailure(ownershipFailure));
        return {
          ok: false,
          code: "blaxel_runtime_workspace_tools_smoke_failed",
          deploymentKind,
          providerId: policy.providerId,
          projectId: String(args.projectId),
          sandboxName: names.sandboxName,
          volumeName: names.volumeName,
          evidence,
          outputs,
          failures,
          errors,
        };
      }
      evidence.providerOwnershipAccepted = true;

      const ensured = await ensureBlaxelWorkspaceComputer({
        sandboxName: names.sandboxName,
        volumeName: names.volumeName,
        lifecycleIntent: "agent_run",
        labels: {
          purpose: "runtime-tools-smoke",
          project_id: String(args.projectId),
          owner_id: String(project.ownerId ?? ""),
        },
      });
      if (!ensured.ok) {
        const failure = mapProviderFailure(ensured);
        failures.push("session_ensure_failed");
        errors.push(safeToolFailure(failure));
        return {
          ok: false,
          code: "blaxel_runtime_workspace_tools_smoke_failed",
          deploymentKind,
          providerId: policy.providerId,
          projectId: String(args.projectId),
          sandboxName: names.sandboxName,
          volumeName: names.volumeName,
          evidence,
          outputs,
          failures,
          errors,
        };
      }
      evidence.sessionEnsured = true;

      const nowMs = Date.now();
      await ctx.runMutation(internal.projects.attachCloudProjectVolumeInternal as any, {
        projectId: args.projectId,
        providerVolumeId: names.volumeName,
        providerId: "blaxel",
        nowMs,
      });
      await ctx.runMutation(
        internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
        {
          projectId: args.projectId,
          providerSandboxId: ensured.providerSandboxId,
          providerSandboxProviderId: "blaxel",
          providerSandboxState: "active",
          providerSandboxLastSeenAt: nowMs,
          providerSandboxStartedAt: ensured.startedAt,
          clearSandboxAccounting: true,
        },
      );

      const session: BlaxelRuntimeWorkspaceSession = {
        providerId: "blaxel",
        projectId: String(args.projectId),
        projectVolumeId: names.volumeName,
        providerSandboxId: ensured.providerSandboxId,
        workspaceRoot: ensured.workspaceRoot,
        startedAt: ensured.startedAt,
        lifecycleMode: "provider_standby",
      };

      const smokePath = ".polynet-smoke/blaxel-runtime-tools-smoke.txt";
      const marker = `polynet-blaxel-runtime-tools-smoke:${nowMs}`;
      const editedMarker = `${marker}:edited`;
      const expectedEditedHash = expectedSha256(editedMarker);

      const listDir = await runTool({
        session,
        toolName: "list_dir",
        normalizedArgs: { path: "." },
      });
      outputs.listDir = previewToolOutput(listDir);
      if (!listDir.ok) {
        failures.push("list_dir_failed");
        errors.push(safeToolFailure(listDir));
      } else {
        evidence.listDirOk = true;
      }

      const write = await runTool({
        session,
        toolName: "write",
        normalizedArgs: {
          path: smokePath,
          content: marker,
        },
      });
      outputs.write = previewToolOutput(write);
      if (!write.ok) {
        failures.push("write_failed");
        errors.push(safeToolFailure(write));
      } else {
        evidence.writeOk = true;
      }

      const read = await runTool({
        session,
        toolName: "read",
        normalizedArgs: {
          path: smokePath,
          offset: 1,
          limit: 20,
        },
      });
      outputs.read = previewToolOutput(read);
      if (!read.ok) {
        failures.push("read_failed");
        errors.push(safeToolFailure(read));
      } else {
        evidence.readOk = read.outputText === marker;
        if (!evidence.readOk) failures.push("read_content_mismatch");
      }

      const bash = await runTool({
        session,
        toolName: "bash",
        normalizedArgs: {
          cwd: ".",
          command: `pwd && cat ${smokePath}`,
        },
      });
      outputs.bash = previewToolOutput(bash);
      if (!bash.ok) {
        failures.push("bash_failed");
        errors.push(safeToolFailure(bash));
      } else {
        evidence.bashOk =
          bash.outputText.includes("/workspace") &&
          bash.outputText.includes(marker);
        if (!evidence.bashOk) failures.push("bash_output_unverified");
      }

      const glob = await runTool({
        session,
        toolName: "glob",
        normalizedArgs: {
          path: ".",
          pattern: ".polynet-smoke/*",
        },
      });
      outputs.glob = previewToolOutput(glob);
      if (!glob.ok) {
        failures.push("glob_failed");
        errors.push(safeToolFailure(glob));
      } else {
        evidence.globOk = glob.outputText.includes(smokePath);
        if (!evidence.globOk) failures.push("glob_output_unverified");
      }

      const grep = await runTool({
        session,
        toolName: "grep",
        normalizedArgs: {
          path: ".polynet-smoke",
          pattern: marker,
        },
      });
      outputs.grep = previewToolOutput(grep);
      if (!grep.ok) {
        failures.push("grep_failed");
        errors.push(safeToolFailure(grep));
      } else {
        evidence.grepOk = grep.outputText.includes(marker);
        if (!evidence.grepOk) failures.push("grep_output_unverified");
      }

      const edit = await runTool({
        session,
        toolName: "edit",
        normalizedArgs: {
          path: smokePath,
          old_text: marker,
          new_text: editedMarker,
          replace_all: false,
        },
      });
      outputs.edit = previewToolOutput(edit);
      if (!edit.ok) {
        failures.push("edit_failed");
        errors.push(safeToolFailure(edit));
      } else {
        evidence.editOk = true;
      }

      const readAfterEdit = await runTool({
        session,
        toolName: "read",
        normalizedArgs: {
          path: smokePath,
          offset: 1,
          limit: 20,
        },
      });
      outputs.readAfterEdit = previewToolOutput(readAfterEdit);
      if (!readAfterEdit.ok) {
        failures.push("read_after_edit_failed");
        errors.push(safeToolFailure(readAfterEdit));
      } else {
        evidence.readAfterEditOk = readAfterEdit.outputText === editedMarker;
        if (!evidence.readAfterEditOk) failures.push("read_after_edit_content_mismatch");
      }

      const sha256 = await runTool({
        session,
        toolName: "sha256",
        normalizedArgs: {
          path: smokePath,
        },
      });
      outputs.sha256 = previewToolOutput(sha256);
      if (!sha256.ok) {
        failures.push("sha256_failed");
        errors.push(safeToolFailure(sha256));
      } else {
        evidence.sha256Ok = sha256.outputText.trim() === expectedEditedHash;
        if (!evidence.sha256Ok) failures.push("sha256_output_unverified");
      }

      if (args.cleanupFile !== false) {
        const cleanup = await runTool({
          session,
          toolName: "bash",
          normalizedArgs: {
            cwd: ".",
            command: "rm -f .polynet-smoke/blaxel-runtime-tools-smoke.txt && rmdir .polynet-smoke 2>/dev/null || true",
          },
        });
        outputs.cleanup = previewToolOutput(cleanup);
        if (!cleanup.ok) {
          failures.push("cleanup_failed");
          errors.push(safeToolFailure(cleanup));
        } else {
          evidence.cleanupOk = true;
        }
      } else {
        outputs.cleanup = "cleanup skipped by request";
        evidence.cleanupOk = true;
      }

      const refreshedProject = await ctx.runQuery(
        internal.projects.getCloudProjectByIdInternal as any,
        { projectId: args.projectId },
      ) as Record<string, unknown> | null;
      evidence.providerOwnershipRecorded =
        refreshedProject?.providerVolumeId === names.volumeName &&
        refreshedProject?.providerVolumeProviderId === "blaxel" &&
        refreshedProject?.providerSandboxId === ensured.providerSandboxId &&
        refreshedProject?.providerSandboxProviderId === "blaxel";
      if (!evidence.providerOwnershipRecorded) {
        failures.push("provider_ownership_not_recorded");
      }
    } catch (error) {
      failures.push("unexpected_smoke_error");
      errors.push(sanitizeSmokeError(error));
    }

    return {
      ok:
        failures.length === 0 &&
        evidence.providerPolicySelected &&
        evidence.projectLoaded &&
        evidence.providerOwnershipAccepted &&
        evidence.sessionEnsured &&
        evidence.providerOwnershipRecorded &&
        evidence.listDirOk &&
        evidence.writeOk &&
        evidence.readOk &&
        evidence.bashOk &&
        evidence.globOk &&
        evidence.grepOk &&
        evidence.sha256Ok &&
        evidence.editOk &&
        evidence.readAfterEditOk &&
        evidence.cleanupOk,
      code: "blaxel_runtime_workspace_tools_smoke",
      deploymentKind,
      providerId: policy.providerId,
      projectId: String(args.projectId),
      sandboxName: names.sandboxName,
      volumeName: names.volumeName,
      evidence,
      outputs,
      failures,
      errors,
    };
  },
});
