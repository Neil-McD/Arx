export type CommunityWorkflowImportHarnessProfileId =
  | "claude"
  | "codex"
  | "openclaw"
  | "hermes"
  | "cursor"
  | "gemini-cli"
  | "antigravity"
  | "other";

export type CommunityWorkflowImportHarnessProfile = {
  id: CommunityWorkflowImportHarnessProfileId;
  label: string;
  summary: string;
  mcpLocations: string[];
  actualSkillLocations: string[];
  instructionLocations: string[];
  commandLocations: string[];
  pluginLocations: string[];
  preferredLocalCommands: string[];
  repositorySignals: string[];
  exportRules: string[];
  exclusionRules: string[];
  completenessChecks: string[];
};

const GENERIC_EXCLUSION_RULES = [
  "Do not export API keys, tokens, passwords, private keys, cookies, OAuth refresh tokens, session IDs, or credential values.",
  "Do not export message history, transcripts, browser profiles, hidden cache data, .env files, .git contents, node_modules, build artifacts, binaries, screenshots, or private source code.",
  "Do not run install, update, delete, login, logout, deploy, write, or destructive commands.",
];

const GENERIC_REPOSITORY_SIGNALS = [
  "git rev-parse --show-toplevel",
  "git remote -v",
  "git branch --show-current",
  "package.json, pyproject.toml, Cargo.toml, go.mod, README.md, docs/",
];

const GENERIC_COMPLETENESS_CHECKS = [
  "Record every searched location in manifest.scanSummary.searchedLocations.",
  "Record every searched skill location in manifest.scanSummary.skillSearchLocations.",
  "Count all skill-like items seen, selected, and skipped.",
  "If a known location is missing or inaccessible, record it in scanSummary.importantOmissions instead of guessing.",
];

export const COMMUNITY_WORKFLOW_IMPORT_HARNESS_PROFILES: readonly CommunityWorkflowImportHarnessProfile[] = [
  {
    id: "claude",
    label: "Claude",
    summary: "Claude Code stores repo instructions, commands, skills, settings, and MCP config across project and user folders.",
    mcpLocations: [
      ".mcp.json",
      ".claude/settings.json",
      ".claude/settings.local.json",
      "~/.claude.json",
      "~/.claude/settings.json",
    ],
    actualSkillLocations: [
      ".claude/skills/**/SKILL.md",
      "~/.claude/skills/**/SKILL.md",
    ],
    instructionLocations: [
      "CLAUDE.md",
      ".claude/CLAUDE.md",
      "AGENTS.md",
      ".github/copilot-instructions.md",
      "README.md",
    ],
    commandLocations: [
      ".claude/commands/**/*.md",
      "~/.claude/commands/**/*.md",
    ],
    pluginLocations: [
      ".claude/plugins/**",
      "~/.claude/plugins/**",
    ],
    preferredLocalCommands: [
      "claude mcp list",
      "claude mcp get <server>",
    ],
    repositorySignals: GENERIC_REPOSITORY_SIGNALS,
    exportRules: [
      "Claude commands are command candidates, not actual skills unless they are backed by a complete SKILL.md file.",
      "CLAUDE.md is repo instruction context; export it as a markdown decision unless it is a complete portable skill by itself.",
      "Only copy full skill bodies from .claude/skills/**/SKILL.md or ~/.claude/skills/**/SKILL.md when they are user-owned.",
    ],
    exclusionRules: GENERIC_EXCLUSION_RULES,
    completenessChecks: GENERIC_COMPLETENESS_CHECKS,
  },
  {
    id: "codex",
    label: "Codex",
    summary: "Codex stores repo instructions in AGENTS.md, MCP servers in config.toml, and skills in user/project/plugin skill folders.",
    mcpLocations: [
      "~/.codex/config.toml mcp_servers",
      ".codex/config.toml mcp_servers",
      ".codex/mcp.json",
      ".mcp.json",
    ],
    actualSkillLocations: [
      "~/.codex/skills/**/SKILL.md",
      ".codex/skills/**/SKILL.md",
      ".codex/plugins/**/skills/**/SKILL.md",
      "~/.codex/plugins/cache/**/skills/**/SKILL.md",
    ],
    instructionLocations: [
      "AGENTS.md",
      ".codex/AGENTS.md",
      "README.md",
      "docs/**/*.md",
    ],
    commandLocations: [
      ".codex/commands/**/*.md",
      "~/.codex/commands/**/*.md",
    ],
    pluginLocations: [
      ".codex-plugin/plugin.json",
      ".codex/plugins/**",
      "~/.codex/plugins/cache/**",
    ],
    preferredLocalCommands: [
      "codex mcp list",
    ],
    repositorySignals: GENERIC_REPOSITORY_SIGNALS,
    exportRules: [
      "User/project skills can be copied when the full SKILL.md is present.",
      "Bundled or curated plugin skills should be referenced unless they are clearly user-owned and exportable.",
      "AGENTS.md is repo instruction context; export it as a markdown decision unless it is a portable standalone skill.",
    ],
    exclusionRules: GENERIC_EXCLUSION_RULES,
    completenessChecks: GENERIC_COMPLETENESS_CHECKS,
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    summary: "OpenClaw is a rich agent gateway with MCP config, skills, plugins, bundles, channel integrations, and workspace state.",
    mcpLocations: [
      "~/.openclaw/openclaw.json",
      "openclaw.json",
      ".openclaw/openclaw.json",
      "mcp.json",
      ".mcp.json",
    ],
    actualSkillLocations: [
      "skills/**/SKILL.md",
      ".agents/skills/**/SKILL.md",
      "~/.agents/skills/**/SKILL.md",
      "~/.openclaw/skills/**/SKILL.md",
      "~/.openclaw/plugins/**/skills/**/SKILL.md",
    ],
    instructionLocations: [
      "AGENTS.md",
      "CLAUDE.md",
      "README.md",
      "docs/**/*.md",
      "playbooks/**/*.md",
    ],
    commandLocations: [
      ".agents/commands/**/*.md",
      "~/.openclaw/commands/**/*.md",
    ],
    pluginLocations: [
      "openclaw.plugin.json",
      ".openclaw/plugins/**",
      "~/.openclaw/plugins/**",
      "bundles/**",
    ],
    preferredLocalCommands: [
      "openclaw mcp list",
      "openclaw mcp show <server>",
      "openclaw skills list",
      "openclaw skills info <skill>",
    ],
    repositorySignals: GENERIC_REPOSITORY_SIGNALS,
    exportRules: [
      "OpenClaw channel adapters and gateway credentials are runtime state; do not export them.",
      "OpenClaw plugin skills are importable only when the full SKILL.md file is visible and user-owned or explicitly exportable.",
      "Imported bundles from Claude, Codex, or Cursor should preserve their original source path and originKind.",
    ],
    exclusionRules: [
      ...GENERIC_EXCLUSION_RULES,
      "Do not export Slack, Discord, Telegram, WhatsApp, browser-session, channel auth, webhook secret, or gateway credential values.",
    ],
    completenessChecks: GENERIC_COMPLETENESS_CHECKS,
  },
  {
    id: "hermes",
    label: "Hermes",
    summary: "Hermes appears to expose first-class skills and agent workflow state; inspect its CLI/config before guessing paths.",
    mcpLocations: [
      "~/.hermes/config.json",
      "~/.hermes/mcp.json",
      ".hermes/config.json",
      ".hermes/mcp.json",
      ".mcp.json",
    ],
    actualSkillLocations: [
      "~/.hermes/skills/**/SKILL.md",
      ".hermes/skills/**/SKILL.md",
      "skills/**/SKILL.md",
    ],
    instructionLocations: [
      "AGENTS.md",
      "HERMES.md",
      "README.md",
      "docs/**/*.md",
    ],
    commandLocations: [
      ".hermes/commands/**/*.md",
      "~/.hermes/commands/**/*.md",
    ],
    pluginLocations: [
      ".hermes/plugins/**",
      "~/.hermes/plugins/**",
    ],
    preferredLocalCommands: [
      "hermes skills list",
      "hermes skills info <skill>",
      "hermes mcp list",
      "hermes config show",
    ],
    repositorySignals: GENERIC_REPOSITORY_SIGNALS,
    exportRules: [
      "Hermes is less certain than Claude/Codex/Cursor; inspect help/config output and record uncertainty explicitly.",
      "Only package actual Hermes skill files when a full SKILL.md exists.",
      "If Hermes reports a skill by name but its body is not readable, record it as a skippedSkillCandidate, not an importable skill.",
    ],
    exclusionRules: GENERIC_EXCLUSION_RULES,
    completenessChecks: GENERIC_COMPLETENESS_CHECKS,
  },
  {
    id: "cursor",
    label: "Cursor",
    summary: "Cursor stores behavior in rules, commands, MCP config, and sometimes AGENTS.md; most rules are decisions unless converted carefully.",
    mcpLocations: [
      ".cursor/mcp.json",
      "~/.cursor/mcp.json",
      ".mcp.json",
    ],
    actualSkillLocations: [
      ".cursor/skills/**/SKILL.md",
      "~/.cursor/skills/**/SKILL.md",
      "skills/**/SKILL.md",
    ],
    instructionLocations: [
      ".cursor/rules/*.mdc",
      ".cursorrules",
      "AGENTS.md",
      "README.md",
      "docs/**/*.md",
    ],
    commandLocations: [
      ".cursor/commands/**/*.md",
      "~/.cursor/commands/**/*.md",
    ],
    pluginLocations: [
      ".cursor/extensions/**",
      "~/.cursor/extensions/**",
    ],
    preferredLocalCommands: [],
    repositorySignals: GENERIC_REPOSITORY_SIGNALS,
    exportRules: [
      "Cursor rules are behavior/context decisions by default, not actual skills.",
      "Cursor commands can become skill candidates only if they describe portable reusable behavior.",
      "Only copy full SKILL.md files from real skill folders as default-on skill imports.",
    ],
    exclusionRules: GENERIC_EXCLUSION_RULES,
    completenessChecks: GENERIC_COMPLETENESS_CHECKS,
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    summary: "Gemini CLI stores memory in GEMINI.md, commands in TOML files, and MCP servers in settings mcpServers.",
    mcpLocations: [
      ".gemini/settings.json mcpServers",
      "~/.gemini/settings.json mcpServers",
      ".mcp.json",
    ],
    actualSkillLocations: [
      ".gemini/skills/**/SKILL.md",
      "~/.gemini/skills/**/SKILL.md",
      "skills/**/SKILL.md",
    ],
    instructionLocations: [
      "GEMINI.md",
      "~/.gemini/GEMINI.md",
      "AGENTS.md",
      "README.md",
      "docs/**/*.md",
    ],
    commandLocations: [
      ".gemini/commands/**/*.toml",
      "~/.gemini/commands/**/*.toml",
    ],
    pluginLocations: [
      ".gemini/extensions/**",
      "~/.gemini/extensions/**",
    ],
    preferredLocalCommands: [
      "gemini mcp list",
    ],
    repositorySignals: GENERIC_REPOSITORY_SIGNALS,
    exportRules: [
      "GEMINI.md is memory/instruction context and should usually be a markdown decision, not a skill.",
      "Gemini TOML commands are command candidates; convert only portable reusable procedures.",
      "Only full SKILL.md files from real skill folders default on.",
    ],
    exclusionRules: GENERIC_EXCLUSION_RULES,
    completenessChecks: GENERIC_COMPLETENESS_CHECKS,
  },
  {
    id: "antigravity",
    label: "Antigravity",
    summary: "Antigravity can ship plugin bundles with skills, agents, rules, MCP config, and hooks under the Gemini Antigravity CLI tree.",
    mcpLocations: [
      "~/.gemini/antigravity-cli/settings.json",
      "~/.gemini/antigravity-cli/plugins/*/mcp_config.json",
      ".antigravity/mcp_config.json",
      ".mcp.json",
    ],
    actualSkillLocations: [
      "~/.gemini/antigravity-cli/plugins/*/skills/**/SKILL.md",
      ".antigravity/skills/**/SKILL.md",
      "skills/**/SKILL.md",
    ],
    instructionLocations: [
      "~/.gemini/antigravity-cli/plugins/*/rules/**",
      "~/.gemini/antigravity-cli/plugins/*/agents/**",
      "AGENTS.md",
      "README.md",
    ],
    commandLocations: [
      "~/.gemini/antigravity-cli/plugins/*/commands/**",
    ],
    pluginLocations: [
      "~/.gemini/antigravity-cli/plugins/*",
      ".antigravity/plugins/**",
    ],
    preferredLocalCommands: [
      "antigravity --help",
    ],
    repositorySignals: GENERIC_REPOSITORY_SIGNALS,
    exportRules: [
      "Plugin skills are importable only when full SKILL.md files are present.",
      "Agents, rules, and hooks are decisions unless they can stand alone without Antigravity runtime internals.",
      "Do not export hook bodies that perform local side effects or contain credentials.",
    ],
    exclusionRules: GENERIC_EXCLUSION_RULES,
    completenessChecks: GENERIC_COMPLETENESS_CHECKS,
  },
  {
    id: "other",
    label: "Other",
    summary: "Generic agent harness discovery profile for unknown or custom harnesses.",
    mcpLocations: [
      ".mcp.json",
      "mcp.json",
      "**/mcp*.json",
      "**/settings.json",
      "**/config.toml",
      "**/config.yaml",
    ],
    actualSkillLocations: [
      "skills/**/SKILL.md",
      ".*/skills/**/SKILL.md",
      "**/SKILL.md",
    ],
    instructionLocations: [
      "AGENTS.md",
      "CLAUDE.md",
      "GEMINI.md",
      "README.md",
      "docs/**/*.md",
      "**/*instructions*.md",
      "**/*prompt*.md",
      "**/*playbook*.md",
    ],
    commandLocations: [
      "**/commands/**/*.md",
      "**/commands/**/*.toml",
      "**/rules/**/*.md",
      "**/rules/**/*.mdc",
    ],
    pluginLocations: [
      "**/plugins/**",
      "**/extensions/**",
    ],
    preferredLocalCommands: [
      "<harness> --help",
      "<harness> mcp list",
      "<harness> skills list",
    ],
    repositorySignals: GENERIC_REPOSITORY_SIGNALS,
    exportRules: [
      "Identify the harness name/version, config roots, skill roots, command/rule system, and active workspace before exporting.",
      "Do not invent paths. If you cannot confirm a real file, record an unresolved candidate instead of packaging it.",
      "Default-on skills require full SKILL.md content or equivalent complete user-owned behavior files.",
    ],
    exclusionRules: GENERIC_EXCLUSION_RULES,
    completenessChecks: GENERIC_COMPLETENESS_CHECKS,
  },
];

function normalizeHarnessToken(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCommunityWorkflowImportHarnessProfile(params: {
  harnessId?: string | null;
  harnessName?: string | null;
}): CommunityWorkflowImportHarnessProfile {
  const idToken = normalizeHarnessToken(params.harnessId);
  const nameToken = normalizeHarnessToken(params.harnessName);
  const profile =
    COMMUNITY_WORKFLOW_IMPORT_HARNESS_PROFILES.find((candidate) => candidate.id === idToken) ??
    COMMUNITY_WORKFLOW_IMPORT_HARNESS_PROFILES.find(
      (candidate) => normalizeHarnessToken(candidate.label) === nameToken,
    );
  if (profile) return profile;

  const other = COMMUNITY_WORKFLOW_IMPORT_HARNESS_PROFILES.find((candidate) => candidate.id === "other");
  if (!other) throw new Error("workflow_import_other_harness_profile_missing");
  return {
    ...other,
    label: (params.harnessName ?? "").trim() || other.label,
  };
}
