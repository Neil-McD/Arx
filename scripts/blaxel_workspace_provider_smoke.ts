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

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
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
    if (!ensured.ok) {
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
    if (!writeResult.ok) throw new Error(`${writeResult.code}: ${writeResult.message}`);

    const readResult = await readBlaxelWorkspaceFile({
      sandboxName: result.sandboxName,
      path: filePath,
    });
    if (!readResult.ok) throw new Error(`${readResult.code}: ${readResult.message}`);
    result.evidence.fileRoundTrip = readResult.content.includes(marker);

    const commandResult = await executeBlaxelWorkspaceCommand({
      sandboxName: result.sandboxName,
      cwd: ".",
      command: `sh -lc 'test -f ${filePath} && printf provider-smoke-ok'`,
      waitForCompletion: true,
      timeoutSeconds: 60,
    });
    if (!commandResult.ok) {
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
    if (!listResult.ok) throw new Error(`${listResult.code}: ${listResult.message}`);
    result.evidence.listedDirectory = true;

    result.ok =
      result.evidence.ensured &&
      result.evidence.fileRoundTrip &&
      result.evidence.commandRan &&
      result.evidence.listedDirectory;
  } catch (error) {
    result.reason = result.reason || "blaxel_workspace_provider_smoke_failed";
    result.errors.push(describeError(error));
  } finally {
    if (!keepResources) {
      const cleanup = await destroyBlaxelWorkspaceComputer({
        sandboxName: result.sandboxName,
      });
      result.evidence.cleanupOk = cleanup.ok;
      if (!cleanup.ok) {
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
