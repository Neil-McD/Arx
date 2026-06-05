import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function exists(relativePath: string): boolean {
  return existsSync(new URL(`../${relativePath}`, import.meta.url));
}

function assertContains(source: string, snippet: string, message: string) {
  assert.ok(source.includes(snippet), message);
}

function assertDoesNotContain(source: string, pattern: RegExp, message: string) {
  assert.equal(pattern.test(source), false, message);
}

const dockerfile = read("infra/blaxel/codex-runtime/Dockerfile");
const dockerignore = read("infra/blaxel/codex-runtime/.dockerignore");
const blaxelignore = read("infra/blaxel/codex-runtime/.blaxelignore");
const blaxelToml = read("infra/blaxel/codex-runtime/blaxel.toml");
const entrypoint = read("infra/blaxel/codex-runtime/entrypoint.sh");
const codexConfig = read("infra/blaxel/codex-runtime/codex-config.toml");
const readme = read("infra/blaxel/codex-runtime/README.md");
const blaxelPushScript = read("scripts/run_codex_blaxel_image_push.sh");
const blaxelWorkspaceClient = read("convex/blaxelWorkspaceClient.ts");
const packageJson = read("package.json");

for (const deletedPath of [
  "convex/blaxelWorkspaceCodexImageSmoke.ts",
  "scripts/codex_blaxel_image_staging_smoke.ts",
  "scripts/run_codex_blaxel_image_blaxel_dryrun.sh",
  "scripts/run_codex_blaxel_image_smoke.sh",
]) {
  assert.equal(exists(deletedPath), false, `${deletedPath} should remain deleted`);
}

assertContains(dockerfile, "FROM node:22-bookworm-slim", "Codex runtime image must use a Node base.");
assertContains(dockerfile, "ARG CODEX_NPM_VERSION=0.137.0", "Codex npm version must be pinned.");
assertContains(
  dockerfile,
  'npm install -g "@openai/codex@${CODEX_NPM_VERSION}"',
  "Codex must be installed into the image, not fetched per run.",
);
assertContains(dockerfile, "command -v codex", "Image build must verify that Codex is available.");
assertContains(dockerfile, "codex --version", "Image build must verify the installed Codex binary.");
assertContains(dockerfile, "CODEX_HOME=/home/codex/.codex", "Image must isolate Codex state.");
assertContains(
  dockerfile,
  "COPY --chown=codex:codex codex-config.toml /home/codex/.codex/config.toml",
  "Image must ship the default Codex permission config.",
);
assertContains(
  dockerfile,
  "COPY --from=ghcr.io/blaxel-ai/sandbox:latest /sandbox-api /usr/local/bin/sandbox-api",
  "Image must include Blaxel sandbox-api.",
);
assertContains(dockerfile, "command -v sandbox-api", "Image build must verify sandbox-api is present.");
assertContains(dockerfile, "bubblewrap", "Image must include bubblewrap for Codex sandbox support.");
assertContains(dockerfile, "ripgrep", "Image must include ripgrep.");
assertContains(dockerfile, "git", "Image must include git.");
assertContains(
  dockerfile,
  "codex ALL=(ALL) NOPASSWD:ALL",
  "Image must allow full-access agent sessions inside the isolated sandbox.",
);
assertContains(dockerfile, "USER codex", "Image must run Codex as the scoped codex user.");
assertDoesNotContain(
  dockerfile,
  /OPENAI_API_KEY|CODEX_API_KEY|POLYNET_CODEX|sk-[A-Za-z0-9_-]{8,}/,
  "Image definition must not bake API keys or PolyNet bridge secrets.",
);
assertDoesNotContain(
  dockerfile,
  /npx\s+.*@openai\/codex/,
  "Image definition must not depend on per-run npx Codex installation.",
);

assertContains(codexConfig, 'approval_policy = "never"', "Default Codex config must disable approvals.");
assertContains(
  codexConfig,
  'sandbox_mode = "danger-full-access"',
  "Default Codex config must use full filesystem access inside the Blaxel sandbox.",
);
assertContains(codexConfig, "network_access = true", "Default Codex config must allow network access.");
assertDoesNotContain(
  codexConfig,
  /OPENAI_API_KEY|CODEX_API_KEY|POLYNET_CODEX|sk-[A-Za-z0-9_-]{8,}/,
  "Codex config must not contain secrets.",
);

assertContains(blaxelToml, 'type = "sandbox"', "Blaxel config must declare a sandbox image.");
assertContains(blaxelToml, 'generation = "mk3"', "Blaxel config must use the current sandbox runtime generation.");
assertContains(blaxelToml, "memory = 4096", "Blaxel config must request a 4GB default image build.");

for (const snippet of [
  "*",
  "!Dockerfile",
  "!entrypoint.sh",
  "!blaxel.toml",
  "!codex-config.toml",
  "!README.md",
  "!.dockerignore",
  "!.blaxelignore",
]) {
  assertContains(dockerignore, snippet, `Docker context allowlist must include ${snippet}.`);
  assertContains(blaxelignore, snippet, `Blaxel source package allowlist must include ${snippet}.`);
}

assertContains(entrypoint, "/usr/local/bin/sandbox-api &", "Entrypoint must start Blaxel sandbox-api.");
assertContains(entrypoint, "wait_for_port 8080 30", "Entrypoint must wait for sandbox-api.");
assertContains(entrypoint, '"$@" &', "Entrypoint must run the configured command after sandbox-api is ready.");

assertContains(readme, "Do not bake auth into this image.", "Runtime image docs must preserve no-baked-auth.");
assertContains(
  readme,
  "PolyNet: auth, context ledger, community lens, event stream, and memory candidates",
  "Runtime image docs must keep PolyNet as auth/context/event owner.",
);
assertContains(readme, "npm run push:codex-blaxel-image", "Runtime image docs must use the push wrapper.");
assertDoesNotContain(readme, /smoke:codex-blaxel-image|check:codex-blaxel-image-blaxel-dryrun/, "README must not reference deleted image smokes.");

assertContains(blaxelPushScript, 'cd "$IMAGE_DIR"', "Blaxel push wrapper must run from the image directory.");
assertContains(blaxelPushScript, "env -i", "Blaxel push wrapper must avoid inheriting product secrets.");
assertContains(
  blaxelPushScript,
  '"BL_WORKSPACE=$BL_WORKSPACE_VALUE"',
  "Blaxel push wrapper must pass only the required workspace credential.",
);
assertContains(
  blaxelPushScript,
  '"BL_API_KEY=$BL_API_KEY_VALUE"',
  "Blaxel push wrapper must pass only the required API credential.",
);
assertContains(
  blaxelPushScript,
  "POLYNET_CODEX_BLAXEL_PUSH_ALLOW_CLI_AUTH",
  "Blaxel push wrapper must make CLI-auth fallback explicit.",
);
assertContains(blaxelPushScript, "sanitize_output", "Blaxel push wrapper must sanitize failure output.");
assertContains(
  blaxelPushScript,
  "Blaxel push output contained secret-like environment material",
  "Blaxel push wrapper must fail closed on secret-like output.",
);
assertContains(
  blaxelPushScript,
  "Blaxel push packaged files outside the Codex runtime image directory",
  "Blaxel push wrapper must fail closed if it packages the repo root.",
);
assertDoesNotContain(
  blaxelPushScript,
  /bl push[\s\S]*-d\s+infra\/blaxel\/codex-runtime/,
  "Blaxel push wrapper must not depend on repo-root -d packaging.",
);

assertContains(
  blaxelWorkspaceClient,
  'image: readEnv("BLAXEL_WORKSPACE_IMAGE") || "blaxel/base-image:latest"',
  "Blaxel workspace client must support selecting the custom image through env.",
);
assertContains(packageJson, '"check:codex-blaxel-image-contract"', "Package scripts must expose the image proof.");
assertContains(packageJson, '"push:codex-blaxel-image"', "Package scripts must expose the push wrapper.");
assertDoesNotContain(
  packageJson,
  /smoke:codex-blaxel-image|check:codex-blaxel-image-blaxel-dryrun/,
  "Package scripts must not expose deleted image smokes.",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      proof: "codex_blaxel_image_contract",
      codexNpmVersion: "0.137.0",
      imageDirectory: "infra/blaxel/codex-runtime",
      invariants: [
        "codex_binary_installed_in_image",
        "no_per_run_npx_codex_install",
        "full_access_no_approvals_default_config",
        "no_auth_or_api_keys_baked_into_image",
        "blaxel_sandbox_api_available",
        "single_push_wrapper_kept",
      ],
    },
    null,
    2,
  ),
);
