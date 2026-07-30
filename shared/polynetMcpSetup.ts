export type PolynetMcpSetupEnvironment =
  | "production"
  | "staging"
  | "development";

export type PolynetMcpSetup = {
  environment: PolynetMcpSetupEnvironment;
  endpointUrl: string;
  serverAlias: string;
  claudeCodeAddCommand: string;
  codexAddCommand: string;
  codexLoginFallbackCommand: string;
  codexDurableConfig: string;
  openClawAddCommand: string;
  openClawLoginCommand: string;
  openClawDoctorCommand: string;
  hermesConfig: string;
  hermesLoginCommand: string;
  genericHttpConfig: string;
  setupBundle: string;
};

const POLYNET_MCP_PATH = "/runtime/mcp";
const POLYNET_PRODUCTION_HOSTS = new Set(["polynet.ai", "www.polynet.ai"]);
const POLYNET_STAGING_HOST = "polynet-staging.vercel.app";
const POLYNET_MCP_ALIAS_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const POLYNET_MCP_ENVIRONMENTS = new Set<PolynetMcpSetupEnvironment>([
  "production",
  "staging",
  "development",
]);

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function assertSafeHttpProtocol(url: URL, label: string): void {
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && isLocalHostname(url.hostname)) return;
  throw new Error(`${label}_must_use_https`);
}

function normalizeOrigin(rawOrigin: string): URL {
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new Error("polynet_mcp_origin_invalid");
  }
  assertSafeHttpProtocol(origin, "polynet_mcp_origin");
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    (origin.pathname !== "" && origin.pathname !== "/")
  ) {
    throw new Error("polynet_mcp_origin_must_be_bare");
  }
  return new URL(origin.origin);
}

function normalizeEndpointUrl(rawEndpointUrl: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(rawEndpointUrl);
  } catch {
    throw new Error("polynet_mcp_endpoint_invalid");
  }
  assertSafeHttpProtocol(endpoint, "polynet_mcp_endpoint");
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== POLYNET_MCP_PATH
  ) {
    throw new Error("polynet_mcp_endpoint_must_be_exact_runtime_path");
  }
  return endpoint.toString();
}

function normalizeServerAlias(rawServerAlias: string): string {
  const serverAlias = rawServerAlias.trim();
  if (!POLYNET_MCP_ALIAS_PATTERN.test(serverAlias)) {
    throw new Error("polynet_mcp_server_alias_invalid");
  }
  return serverAlias;
}

export function buildPolynetMcpSetup(args: {
  environment: PolynetMcpSetupEnvironment;
  endpointUrl: string;
  serverAlias: string;
}): PolynetMcpSetup {
  if (!POLYNET_MCP_ENVIRONMENTS.has(args.environment)) {
    throw new Error("polynet_mcp_environment_invalid");
  }
  const endpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const serverAlias = normalizeServerAlias(args.serverAlias);
  const claudeCodeAddCommand =
    `claude mcp add --transport http ${serverAlias} ${endpointUrl}`;
  const codexAddCommand =
    `codex mcp add ${serverAlias} --url ${endpointUrl}`;
  const codexLoginFallbackCommand =
    `codex mcp login ${serverAlias} --scopes openid,profile,email,offline_access`;
  const codexDurableConfig = [
    "# Optional: keep MCP OAuth credentials in the OS keychain when available.",
    'mcp_oauth_credentials_store = "keyring"',
  ].join("\n");
  const openClawAddCommand =
    `openclaw mcp add ${serverAlias} --url ${endpointUrl} --transport streamable-http --auth oauth`;
  const openClawLoginCommand = `openclaw mcp login ${serverAlias}`;
  const openClawDoctorCommand = `openclaw mcp doctor ${serverAlias} --probe`;
  const hermesConfig = [
    "mcp_servers:",
    `  ${serverAlias}:`,
    `    url: "${endpointUrl}"`,
    "    auth: oauth",
  ].join("\n");
  const hermesLoginCommand = `hermes mcp login ${serverAlias}`;
  const genericHttpConfig = JSON.stringify(
    {
      mcpServers: {
        [serverAlias]: {
          type: "http",
          url: endpointUrl,
        },
      },
    },
    null,
    2,
  );
  const setupBundle = [
    "# Polynet Setup Packet",
    "",
    "You are helping the user connect this AI harness to Polynet.",
    "",
    "Goal:",
    "Connect Polynet so this harness can access the user's Polynet communities, resources, and workspace memory.",
    "",
    "Polynet environment:",
    args.environment,
    "",
    "Polynet MCP endpoint:",
    endpointUrl,
    "",
    "Polynet MCP server alias:",
    serverAlias,
    "",
    "## Operating Rules",
    "",
    "- Keep the setup focused on Polynet.",
    "- Do not ask for or paste access tokens.",
    "- Do not repair unrelated shell aliases, package managers, or local installs unless the user explicitly asks.",
    "- If this harness cannot run a setup command or open an interactive auth panel, give the user the exact next command or click path and stop.",
    `- Use \`${serverAlias}\` as the server alias for this ${args.environment} setup. Do not reuse an alias configured for another Polynet environment.`,
    "- If this exact endpoint is already configured under another name, authenticate that existing server instead of adding a duplicate.",
    "- If Polynet is already configured for this endpoint but says it needs authentication, skip setup debugging and move directly to sign-in.",
    "",
    "## OAuth Link Handling",
    "",
    "If this harness receives a Polynet authorization URL, do not paste the raw full URL unless there is no other option.",
    "",
    "Prefer this order:",
    "1. Open the authorization URL automatically if this harness can open browser links.",
    "2. Otherwise show a markdown link: [Sign in to Polynet](AUTHORIZATION_URL).",
    "3. Only show the raw authorization URL if the harness cannot open links and cannot render markdown links.",
    "",
    "Only ask the user to paste the localhost callback URL back if the browser callback fails or says the page cannot be reached.",
    "",
    "If the user pastes a callback URL that contains a `code`, treat it as a one-time OAuth credential and use it only to complete sign-in.",
    "",
    "## What To Do",
    "",
    "1. Identify which harness you are running in.",
    "2. Add Polynet with the matching setup path below, unless this exact endpoint is already configured.",
    "3. If authentication is needed, give the user one clear sign-in action for this harness.",
    "4. After sign-in, verify the connection by listing the user's Polynet communities.",
    "5. If this already-open chat cannot see the tools after sign-in, tell the user to start a fresh chat or reconnect tools.",
    "6. Tell the user when Polynet is connected.",
    "7. After verification, read the user's current Polynet profile and offer the optional profile setup described below.",
    "",
    "## Claude Code",
    "",
    "Add Polynet:",
    "",
    "```bash",
    claudeCodeAddCommand,
    "```",
    "",
    "If that command is not available in this session, ask the user to run the same command in an interactive Claude Code terminal. Do not troubleshoot Claude installation paths unless the user asks.",
    "",
    "Authenticate:",
    "",
    "```text",
    "/mcp",
    "```",
    "",
    `Run \`/mcp\`, select \`${serverAlias}\`, then complete Polynet sign-in in the browser.`,
    "",
    "If Claude Code gives you an authorization URL, open it if possible. If you must show it to the user, show it as [Sign in to Polynet](AUTHORIZATION_URL), not as a raw URL block.",
    "",
    "If Polynet already appears as `Needs authentication` for this endpoint, do not re-add it. Ask the user to run `/mcp`, select that server, and sign in.",
    "",
    "## Codex",
    "",
    "Optional before OAuth, in `~/.codex/config.toml`:",
    "",
    "```toml",
    codexDurableConfig,
    "```",
    "",
    "Add Polynet:",
    "",
    "```bash",
    codexAddCommand,
    "```",
    "",
    "If this exact endpoint is already configured, do not add it again.",
    "",
    "Only if Codex does not open OAuth during add, run:",
    "",
    "```bash",
    codexLoginFallbackCommand,
    "```",
    "",
    "## OpenClaw",
    "",
    "Add Polynet:",
    "",
    "```bash",
    openClawAddCommand,
    "```",
    "",
    "If this exact endpoint is already configured, do not add it again.",
    "",
    "Authenticate when needed:",
    "",
    "```bash",
    openClawLoginCommand,
    "```",
    "",
    `Complete Polynet sign-in in the browser, then use \`${openClawDoctorCommand}\` to verify that the tools are available.`,
    "",
    "## Hermes",
    "",
    "Add this configuration to `~/.hermes/config.yaml`, unless this exact endpoint is already configured:",
    "",
    "```yaml",
    hermesConfig,
    "```",
    "",
    "Authenticate:",
    "",
    "```bash",
    hermesLoginCommand,
    "```",
    "",
    "Complete Polynet sign-in in the browser. If this session was already open, run `/reload-mcp` or start a fresh Hermes session before verification.",
    "",
    "## Cursor Or Other JSON-Based Harnesses",
    "",
    "Use this HTTP MCP config:",
    "",
    "```json",
    genericHttpConfig,
    "```",
    "",
    "## After Sign-In",
    "",
    "If the browser shows:",
    "",
    "```text",
    "Authentication complete. You may close this window.",
    "```",
    "",
    "Close that tab and return to this harness.",
    "",
    "The harness owns local credential storage. One successful sign-in should persist for that harness profile or device.",
    "",
    "If this chat was already open before sign-in, start a fresh chat or reconnect tools so the harness picks up the new connection.",
    "",
    "## Verify",
    "",
    "After setup, use Polynet to list the user's Polynet communities.",
    "",
    "If Polynet tools are not visible after sign-in, tell the user to start a fresh chat or reconnect tools. Do not repeat OAuth unless the harness still says authentication is required.",
    "",
    "If successful, tell the user:",
    "",
    "```text",
    "Polynet is connected. I can now use your Polynet communities, resources, and workspace memory. Would you like me to build or improve your Polynet profile now? I'll show you exactly what will be saved before writing anything.",
    "```",
    "",
    "## Optional Profile Setup",
    "",
    "After connection verification, call `polynet_get_my_profile` before asking profile questions.",
    "",
    "If the user declines the profile offer, stop. Do not ask again in this setup flow.",
    "",
    "If the user accepts:",
    "",
    "1. Use the returned account context and platform profile facts to identify only meaningful gaps.",
    "2. Ask concise questions only for meaningful gaps in situation, goals, skills, interests, availability, preferences, or links.",
    "3. Prepare at most 12 short factual statements using only the supported fact kinds.",
    "4. Show the complete proposed batch and ask: `Save these facts to your Polynet profile?`",
    "5. Only after an explicit yes, call `polynet_confirm_my_profile_facts` with a stable unique `confirm_marker` and the exact approved `kind` and `body` pairs.",
    "6. Tell the user whether the profile was saved or the same approved batch was already recorded.",
    "",
    "Never supply or invent a user id, community id, provenance, confidence, consent state, or evidence owner. Polynet derives those server-side.",
    "",
    "Never write profile facts merely because they appeared elsewhere in the harness. The member must see and explicitly approve the complete batch first.",
    "",
    "## Usage Guidance",
    "",
    "Use Polynet when the user asks about:",
    "- Polynet communities",
    "- workspace memory",
    "- accepted community context",
    "- resources",
    "- prior decisions",
    "- playbooks",
    "- warnings",
    "- outcomes",
    "",
    "Before using community-specific memory, list or select the relevant Polynet community context.",
    "",
    "Treat community context IDs as opaque selectors. The API field remains workspace_context_id for compatibility; do not invent values.",
  ].join("\n");

  return {
    environment: args.environment,
    endpointUrl,
    serverAlias,
    claudeCodeAddCommand,
    codexAddCommand,
    codexLoginFallbackCommand,
    codexDurableConfig,
    openClawAddCommand,
    openClawLoginCommand,
    openClawDoctorCommand,
    hermesConfig,
    hermesLoginCommand,
    genericHttpConfig,
    setupBundle,
  };
}

export function buildPolynetMcpSetupForOrigin(
  rawOrigin: string,
): PolynetMcpSetup {
  const origin = normalizeOrigin(rawOrigin);
  const hostname = origin.hostname.toLowerCase();
  const environment: PolynetMcpSetupEnvironment =
    POLYNET_PRODUCTION_HOSTS.has(hostname)
      ? "production"
      : hostname === POLYNET_STAGING_HOST
        ? "staging"
        : "development";
  const serverAlias =
    environment === "production"
      ? "polynet"
      : environment === "staging"
        ? "polynet-staging"
        : "polynet-local";
  const endpointOrigin =
    environment === "production"
      ? new URL("https://www.polynet.ai")
      : origin;
  return buildPolynetMcpSetup({
    environment,
    endpointUrl: new URL(POLYNET_MCP_PATH, endpointOrigin).toString(),
    serverAlias,
  });
}
