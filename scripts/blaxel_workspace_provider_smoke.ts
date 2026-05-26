import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  destroyBlaxelWorkspaceComputer,
  ensureBlaxelWorkspaceComputer,
  executeBlaxelWorkspaceCommand,
  listBlaxelWorkspaceDirectory,
  readBlaxelWorkspaceFile,
  writeBlaxelWorkspaceFile,
} from "../convex/blaxelWorkspaceComputerProvider.ts";

type SmokeResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  provider: "blaxel";
  sandboxName: string;
  mode: "sandbox-only";
  evidence: {
    ensured: boolean;
    fileRoundTrip: boolean;
    commandRan: boolean;
    listedDirectory: boolean;
    symlinkReadRejected: boolean;
    symlinkWriteRejected: boolean;
    symlinkListRejected: boolean;
    symlinkCwdRejected: boolean;
    cleanupOk: boolean | null;
  };
  errors: string[];
};

const args = new Set(process.argv.slice(2));
const requireLive = args.has("--require-live");
const keepResources = args.has("--keep-resources");

function safeResourceName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
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

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return [
      safeText(error.name),
      safeText(error.message),
    ].filter(Boolean).join(": ") || "provider_error";
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return (
      [
        safeText(record.name),
        safeText(record.message),
        safeText(record.error),
        safeText(record.code),
      ].filter(Boolean).join(": ") ||
      Object.prototype.toString.call(error)
    );
  }
  return safeText(error) ?? "provider_error";
}

function buildResult(): SmokeResult {
  const baseName = safeResourceName(
    process.env.BLAXEL_WORKSPACE_PROVIDER_SMOKE_NAME ||
      `polynet-blaxel-provider-${randomUUID().slice(0, 8)}`,
  );
  return {
    ok: false,
    provider: "blaxel",
    sandboxName: baseName,
    mode: "sandbox-only",
    evidence: {
      ensured: false,
      fileRoundTrip: false,
      commandRan: false,
      listedDirectory: false,
      symlinkReadRejected: false,
      symlinkWriteRejected: false,
      symlinkListRejected: false,
      symlinkCwdRejected: false,
      cleanupOk: null,
    },
    errors: [],
  };
}

function printAndExit(result: SmokeResult, exitCode: number): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(exitCode);
}

async function main() {
  const result = buildResult();
  const hasEnvCredentials = Boolean(process.env.BL_WORKSPACE && process.env.BL_API_KEY);
  if (!hasEnvCredentials) {
    result.skipped = true;
    result.reason = "missing_blaxel_credentials_set_BL_WORKSPACE_and_BL_API_KEY";
    printAndExit(result, requireLive ? 1 : 0);
  }

  const marker = `polynet-blaxel-provider-smoke:${Date.now()}`;
  const filePath = `${result.sandboxName}.txt`;

  try {
    const ensured = await ensureBlaxelWorkspaceComputer({
      sandboxName: result.sandboxName,
      labels: {
        purpose: "workspace-provider-smoke",
      },
    });
    if (ensured.ok === false) {
      result.reason = ensured.code;
      result.errors.push(ensured.message);
      printAndExit(result, 1);
    }
    result.evidence.ensured = true;

    const writeResult = await writeBlaxelWorkspaceFile({
      sandboxName: result.sandboxName,
      path: filePath,
      content: marker,
    });
    if (writeResult.ok === false) throw new Error(`${writeResult.code}: ${writeResult.message}`);

    const readResult = await readBlaxelWorkspaceFile({
      sandboxName: result.sandboxName,
      path: filePath,
    });
    if (readResult.ok === false) throw new Error(`${readResult.code}: ${readResult.message}`);
    result.evidence.fileRoundTrip = readResult.content.includes(marker);

    const commandResult = await executeBlaxelWorkspaceCommand({
      sandboxName: result.sandboxName,
      cwd: ".",
      command: `sh -lc 'test -f ${filePath} && printf provider-smoke-ok'`,
      waitForCompletion: true,
      timeoutSeconds: 60,
    });
    if (commandResult.ok === false) {
      throw new Error(`${commandResult.code}: ${commandResult.message}`);
    }
    result.evidence.commandRan =
      commandResult.status === "completed" ||
      commandResult.exitCode === 0 ||
      String(commandResult.stdout ?? "").includes("provider-smoke-ok");

    const listResult = await listBlaxelWorkspaceDirectory({
      sandboxName: result.sandboxName,
      path: ".",
    });
    if (listResult.ok === false) throw new Error(`${listResult.code}: ${listResult.message}`);
    result.evidence.listedDirectory = true;

    const symlinkFilePath = `${result.sandboxName}-leak-file`;
    const symlinkDirectoryPath = `${result.sandboxName}-leak-dir`;
    const symlinkSetupResult = await executeBlaxelWorkspaceCommand({
      sandboxName: result.sandboxName,
      cwd: ".",
      command: [
        `ln -sf /etc/passwd /workspace/${symlinkFilePath}`,
        `ln -sfn /etc /workspace/${symlinkDirectoryPath}`,
      ].join(" && "),
      waitForCompletion: true,
      timeoutSeconds: 60,
    });
    if (symlinkSetupResult.ok === false) {
      throw new Error(`${symlinkSetupResult.code}: ${symlinkSetupResult.message}`);
    }
    const symlinkReadResult = await readBlaxelWorkspaceFile({
      sandboxName: result.sandboxName,
      path: symlinkFilePath,
    });
    result.evidence.symlinkReadRejected =
      symlinkReadResult.ok === false &&
      symlinkReadResult.code === "workspace_symlink_not_supported";

    const symlinkWriteResult = await writeBlaxelWorkspaceFile({
      sandboxName: result.sandboxName,
      path: symlinkFilePath,
      content: "must-not-write-through-symlink",
    });
    result.evidence.symlinkWriteRejected =
      symlinkWriteResult.ok === false &&
      symlinkWriteResult.code === "workspace_symlink_not_supported";

    const symlinkListResult = await listBlaxelWorkspaceDirectory({
      sandboxName: result.sandboxName,
      path: symlinkDirectoryPath,
    });
    result.evidence.symlinkListRejected =
      symlinkListResult.ok === false &&
      symlinkListResult.code === "workspace_symlink_not_supported";

    const symlinkCwdResult = await executeBlaxelWorkspaceCommand({
      sandboxName: result.sandboxName,
      cwd: symlinkDirectoryPath,
      command: "printf should-not-run",
      waitForCompletion: true,
      timeoutSeconds: 60,
    });
    result.evidence.symlinkCwdRejected =
      symlinkCwdResult.ok === false &&
      symlinkCwdResult.code === "workspace_symlink_not_supported";

    result.ok =
      result.evidence.ensured &&
      result.evidence.fileRoundTrip &&
      result.evidence.commandRan &&
      result.evidence.listedDirectory &&
      result.evidence.symlinkReadRejected &&
      result.evidence.symlinkWriteRejected &&
      result.evidence.symlinkListRejected &&
      result.evidence.symlinkCwdRejected;
  } catch (error) {
    result.reason = result.reason || "blaxel_workspace_provider_smoke_failed";
    result.errors.push(describeError(error));
  } finally {
    if (!keepResources) {
      const cleanup = await destroyBlaxelWorkspaceComputer({
        sandboxName: result.sandboxName,
      });
      result.evidence.cleanupOk = cleanup.ok;
      if (cleanup.ok === false) {
        result.ok = false;
        result.reason = result.reason || "blaxel_workspace_provider_cleanup_failed";
        result.errors.push(`${cleanup.code}: ${cleanup.message}`);
      }
    }
  }

  printAndExit(result, result.ok ? 0 : 1);
}

main().catch((error) => {
  const result = buildResult();
  result.reason = "unhandled_blaxel_workspace_provider_smoke_error";
  result.errors.push(describeError(error));
  printAndExit(result, 1);
});
