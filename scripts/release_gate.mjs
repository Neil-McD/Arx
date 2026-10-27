import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const DEFAULT_EVIDENCE_PATH = "artifacts/release-gate.json";
const SUPPORTED_MODES = new Set(["local", "ci"]);

function usage() {
  console.log(`Usage:
  npm run release:gate
  npm run release:gate -- --mode=local [--sha=<git-sha>] [--evidence=<path>]
  npm run release:gate -- --mode=ci --sha=<git-sha> [--evidence=<path>]

Modes:
  local  Runs the complete deterministic gate against the current working tree.
         Dirty state is recorded in evidence and is not release-authoritative.
  ci     Requires a clean checkout whose HEAD exactly matches --sha.

The gate never pushes, deploys, promotes, rolls back, or calls production.`);
}

function parseArgs(argv) {
  const parsed = {
    mode: "local",
    sha: null,
    evidencePath: DEFAULT_EVIDENCE_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }

    const equalsIndex = argument.indexOf("=");
    const key = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    let value = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : null;
    if (value === null) {
      value = argv[index + 1] ?? null;
      index += 1;
    }
    if (!value) {
      throw new Error(`missing value for ${key}`);
    }

    if (key === "--mode") {
      parsed.mode = value;
    } else if (key === "--sha") {
      parsed.sha = value.toLowerCase();
    } else if (key === "--evidence") {
      parsed.evidencePath = value;
    } else {
      throw new Error(`unknown argument: ${key}`);
    }
  }

  if (!SUPPORTED_MODES.has(parsed.mode)) {
    throw new Error(
      `unsupported mode '${parsed.mode}'; expected one of ${[...SUPPORTED_MODES].join(", ")}`,
    );
  }
  if (parsed.mode === "ci" && !parsed.sha) {
    throw new Error("--sha is required in ci mode");
  }
  if (parsed.sha && !/^[0-9a-f]{40}$/.test(parsed.sha)) {
    throw new Error("--sha must be a full 40-character Git commit SHA");
  }
  return parsed;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? "").trim();
    throw new Error(
      `${command} ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`,
    );
  }
  return String(result.stdout ?? "").trim();
}

function displayCommand(command, args) {
  return [command, ...args]
    .map((part) => (/^[A-Za-z0-9_./:=@-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

async function runCommand(command, args, options = {}) {
  console.log(`$ ${displayCommand(command, args)}`);
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: {
        ...process.env,
        ...(options.env ?? {}),
      },
    });
    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `${displayCommand(command, args)} exited with ${
            code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`
          }`,
        ),
      );
    });
  });
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    name: "Error",
    message: String(error),
  };
}

function writeEvidence(evidencePath, evidence) {
  const absolutePath = resolve(ROOT_DIR, evidencePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`Evidence: ${relative(ROOT_DIR, absolutePath) || absolutePath}`);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`release_gate: ${serializeError(error).message}`);
    usage();
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    usage();
    return;
  }

  process.chdir(ROOT_DIR);
  const startedAt = new Date();
  const evidence = {
    schemaVersion: 1,
    gateId: "polynet_release_gate_v1",
    mode: options.mode,
    status: "running",
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    durationMs: null,
    candidate: {
      expectedSha: options.sha,
      headSha: null,
      buildId: null,
      clean: null,
      kind: null,
    },
    steps: [],
    failure: null,
  };

  let gateFailure = null;

  const runStep = async (id, label, command, executor) => {
    const stepStartedAt = new Date();
    const step = {
      id,
      label,
      command,
      status: "running",
      startedAt: stepStartedAt.toISOString(),
      finishedAt: null,
      durationMs: null,
      failure: null,
    };
    evidence.steps.push(step);
    console.log(`\n== ${label} ==`);
    try {
      await executor();
      step.status = "passed";
    } catch (error) {
      step.status = "failed";
      step.failure = serializeError(error);
      throw error;
    } finally {
      const stepFinishedAt = new Date();
      step.finishedAt = stepFinishedAt.toISOString();
      step.durationMs = stepFinishedAt.getTime() - stepStartedAt.getTime();
    }
  };

  try {
    await runStep(
      "candidate_identity",
      "Candidate identity",
      "git identity and whitespace checks",
      async () => {
        const headSha = capture("git", ["rev-parse", "HEAD"]).toLowerCase();
        const expectedSha = options.sha ?? headSha;
        if (headSha !== expectedSha) {
          throw new Error(
            `candidate SHA mismatch: expected ${expectedSha}, checkout is ${headSha}`,
          );
        }
        capture("git", ["cat-file", "-e", `${expectedSha}^{commit}`]);
        await runCommand("git", ["diff", "--check"]);
        await runCommand("git", ["diff", "--cached", "--check"]);

        const status = capture("git", [
          "status",
          "--porcelain=v1",
          "--untracked-files=normal",
        ]);
        const clean = status.length === 0;
        const buildId = clean ? headSha : `${headSha}-dirty`;
        evidence.candidate = {
          expectedSha,
          headSha,
          buildId,
          clean,
          kind: clean ? "commit" : "working_tree",
        };

        if (options.mode === "ci" && !clean) {
          throw new Error("ci mode requires a clean checkout");
        }
        if (!clean) {
          console.warn(
            "release_gate: local evidence describes HEAD plus working-tree changes and is not release-authoritative",
          );
        }
      },
    );

    const headSha = evidence.candidate.headSha;
    const candidateBuildId = evidence.candidate.buildId;
    if (!headSha || !candidateBuildId) {
      throw new Error("candidate identity did not resolve HEAD");
    }

    await runStep(
      "convex_generated_surface",
      "Convex generated-surface sanity",
      "validate checked-in convex/_generated files and source targets",
      async () => {
        const generatedFiles = [
          "convex/_generated/api.d.ts",
          "convex/_generated/api.js",
          "convex/_generated/dataModel.d.ts",
          "convex/_generated/server.d.ts",
          "convex/_generated/server.js",
        ];
        for (const generatedFile of generatedFiles) {
          if (!existsSync(resolve(ROOT_DIR, generatedFile))) {
            throw new Error(
              `missing checked-in Convex generated file: ${generatedFile}`,
            );
          }
          capture("git", ["ls-files", "--error-unmatch", generatedFile]);
        }

        const generatedStatus = capture("git", [
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
          "--",
          "convex/_generated",
        ]);
        if (generatedStatus) {
          throw new Error(
            "convex/_generated has working-tree changes; regenerate and commit it before release",
          );
        }

        const apiSource = readFileSync(
          resolve(ROOT_DIR, "convex/_generated/api.d.ts"),
          "utf8",
        );
        const moduleMatches = [
          ...apiSource.matchAll(
            /import type \* as [A-Za-z0-9_$]+ from "\.\.\/([^"]+)\.js";/g,
          ),
        ];
        if (moduleMatches.length === 0) {
          throw new Error("Convex generated API contains no source module imports");
        }
        const generatedModules = new Set(
          moduleMatches.map((match) => String(match[1] ?? "")),
        );
        for (const match of moduleMatches) {
          const sourceModule = String(match[1] ?? "");
          const hasSource =
            existsSync(resolve(ROOT_DIR, "convex", `${sourceModule}.ts`)) ||
            existsSync(resolve(ROOT_DIR, "convex", `${sourceModule}.js`));
          if (!hasSource) {
            throw new Error(
              `Convex generated API references missing source module: ${sourceModule}`,
            );
          }
        }
        for (const entry of readdirSync(resolve(ROOT_DIR, "convex"), { withFileTypes: true })) {
          if (
            !entry.isFile() ||
            !entry.name.endsWith(".ts") ||
            entry.name.endsWith(".test.ts") ||
            entry.name.endsWith(".d.ts") ||
            entry.name === "auth.config.ts" ||
            entry.name === "schema.ts"
          ) continue;
          const sourceModule = entry.name.slice(0, -3);
          if (!generatedModules.has(sourceModule)) {
            throw new Error(
              `Convex generated API is missing source module: ${sourceModule}`,
            );
          }
        }

        const dataModelSource = readFileSync(
          resolve(ROOT_DIR, "convex/_generated/dataModel.d.ts"),
          "utf8",
        );
        if (!dataModelSource.includes('from "../schema.js"')) {
          throw new Error("Convex generated data model is not bound to convex/schema.ts");
        }
      },
    );

    await runStep(
      "convex_typecheck",
      "Convex typecheck",
      "npx tsc --noEmit -p convex/tsconfig.json --pretty false",
      () =>
        runCommand("npx", [
          "tsc",
          "--noEmit",
          "-p",
          "convex/tsconfig.json",
          "--pretty",
          "false",
        ]),
    );

    await runStep(
      "web_typecheck",
      "Web typecheck",
      "npm run check:web-typecheck",
      () => runCommand("npm", ["run", "check:web-typecheck"]),
    );

    await runStep("web_build", "Production web build", "npm run build", () =>
      runCommand("npm", ["run", "build"], {
        env: {
          GIT_COMMIT_SHA: headSha,
          POLYNET_RELEASE_GATE_BUILD_ID: candidateBuildId,
        },
      }),
    );

    await runStep(
      "web_build_identity",
      "Built web identity",
      "apps/web/dist/version.json buildId equals candidate build identity",
      async () => {
        const versionPath = resolve(ROOT_DIR, "apps/web/dist/version.json");
        const version = JSON.parse(readFileSync(versionPath, "utf8"));
        const buildId = String(version?.buildId ?? "").trim().toLowerCase();
        if (buildId !== candidateBuildId) {
          throw new Error(
            `built version.json identifies ${
              buildId || "no build"
            }, expected ${candidateBuildId}`,
          );
        }
      },
    );

    await runStep(
      "web_bundle_budget",
      "Web bundle budget",
      "npm run check:web-bundle-budget",
      () => runCommand("npm", ["run", "check:web-bundle-budget"]),
    );

    await runStep(
      "media_reading_browser",
      "Media reading browser proof",
      "npm run check:media-reading-browser-proof",
      () => runCommand("npm", ["run", "check:media-reading-browser-proof"]),
    );

    await runStep(
      "app_theme_contract",
      "App theme contract",
      "npm run check:app-theme-contract-proof",
      () => runCommand("npm", ["run", "check:app-theme-contract-proof"]),
    );

    await runStep(
      "loading_correctness",
      "Account-scoped loading, profile drafts, and avatar transitions",
      "npm run check:loading-correctness",
      () => runCommand("npm", ["run", "check:loading-correctness"]),
    );

    await runStep(
      "convex_cut_guard",
      "Convex cut guard",
      "npm run check:convex-cut-runtime-guard",
      () => runCommand("npm", ["run", "check:convex-cut-runtime-guard"]),
    );

    await runStep(
      "foundation_baseline",
      "Foundation invariants and behavior",
      "npm run check:foundation-baseline",
      () => runCommand("npm", ["run", "check:foundation-baseline"]),
    );

    await runStep(
      "unit_tests",
      "Every unit and behavior test",
      "npm run test:unit",
      () => runCommand("npm", ["run", "test:unit"]),
    );

    await runStep(
      "all_checks",
      "Every remaining check script, and no unwired check files",
      "npm run check:all",
      () => runCommand("npm", ["run", "check:all"]),
    );

    await runStep(
      "dependency_security_interlock",
      "Dependency security compatibility",
      "npm run check:dependency-security-interlock",
      () => runCommand("npm", ["run", "check:dependency-security-interlock"]),
    );

    for (const audit of [
      {
        id: "root_dependency_audit",
        label: "Root dependency audit",
        args: ["audit", "--audit-level=low"],
      },
      {
        id: "web_dependency_audit",
        label: "Web dependency audit",
        args: ["--prefix", "apps/web", "audit", "--audit-level=low"],
      },
    ]) {
      await runStep(
        audit.id,
        audit.label,
        displayCommand("npm", audit.args),
        () => runCommand("npm", audit.args),
      );
    }

    evidence.status = "passed";
  } catch (error) {
    gateFailure = error;
    evidence.status = "failed";
    evidence.failure = serializeError(error);
  } finally {
    const finishedAt = new Date();
    evidence.finishedAt = finishedAt.toISOString();
    evidence.durationMs = finishedAt.getTime() - startedAt.getTime();
    try {
      writeEvidence(options.evidencePath, evidence);
    } catch (error) {
      gateFailure = gateFailure ?? error;
      console.error(
        `release_gate: failed to write evidence: ${serializeError(error).message}`,
      );
    }
  }

  if (gateFailure) {
    console.error(`\nFAIL: ${serializeError(gateFailure).message}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nPASS: release gate passed for ${evidence.candidate.headSha} (${options.mode})`,
  );
}

await main();
