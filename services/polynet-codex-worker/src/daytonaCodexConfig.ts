import { DAYTONA_CODEX_WORKSPACE_ROOT } from "../../../shared/daytonaCodexRuntimePolicy.ts";

type DaytonaCodexConfigParams = {
  polynetDeveloperInstructions: string | null;
  workspaceRoot: string;
  previewUrlPattern: string | null;
  platformToolsAvailable: boolean;
  workspaceServeAvailable: boolean;
};

const DEFAULT_DAYTONA_WORKSPACE_ROOT = DAYTONA_CODEX_WORKSPACE_ROOT;

function normalizeBlock(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function joinBlocks(blocks: Array<string | null | undefined>): string {
  return blocks
    .map((block) => normalizeBlock(block))
    .filter((block): block is string => Boolean(block))
    .join("\n\n");
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function buildDaytonaCodexDeveloperInstructions(
  params: DaytonaCodexConfigParams,
): string {
  const workspaceRoot = normalizeBlock(params.workspaceRoot) ?? DEFAULT_DAYTONA_WORKSPACE_ROOT;
  return joinBlocks([
    params.polynetDeveloperInstructions,
    [
      "You are running inside PolyNet's Codex runtime hosted in a Daytona sandbox.",
      "These service instructions only describe execution mechanics; they do not replace PolyNet developer instructions, identity, tone, community context, project context, or user intent.",
      `Your workspace is a full-access remote Linux environment rooted at ${workspaceRoot}.`,
      "You may create and edit files inside that workspace when the user asks.",
      "Use Codex's native file editing, patching, and shell capabilities for workspace work. Do not look for a PolyNet-provided shell tool.",
      params.workspaceServeAvailable
        ? "To run a server or app the user can see, call workspace_serve with the start command and port. PolyNet attaches the app to the user's preview panel. Prefer workspace_serve over a long-running shell command for preview servers. For visual inspection after workspace_serve, open http://localhost:<port>/ with computer_open_url, then call computer_screenshot. Never print raw provider preview URLs."
        : null,
      params.platformToolsAvailable
        ? "PolyNet platform tools are available under the polynet namespace for community context, resources, and product docs; discover them with tool search when the answer depends on the user's community or platform."
        : null,
      "Never mention internal infrastructure, vendor, or hosting names; refer to the environment simply as the workspace.",
      "The host service environment is not separate user context: use only the configured workspace root for file and shell work. Do not inspect sibling or parent directories unless the user explicitly asks.",
      "Report tool output clearly and only with the detail the user needs.",
    ]
      .filter((line): line is string => Boolean(line))
      .join(" "),
  ]);
}

export function buildDaytonaCodexConfigToml(params: DaytonaCodexConfigParams): {
  configToml: string;
  developerInstructions: string;
  receipt: {
    workspaceRoot: string;
    previewUrlPattern: string | null;
    developerInstructionChars: number;
    polynetDeveloperInstructionsApplied: boolean;
  };
} {
  const developerInstructions = buildDaytonaCodexDeveloperInstructions(params);
  return {
    configToml: `developer_instructions = ${tomlString(developerInstructions)}\n`,
    developerInstructions,
    receipt: {
      workspaceRoot: normalizeBlock(params.workspaceRoot) ?? DEFAULT_DAYTONA_WORKSPACE_ROOT,
      previewUrlPattern: normalizeBlock(params.previewUrlPattern),
      developerInstructionChars: developerInstructions.length,
      polynetDeveloperInstructionsApplied: Boolean(
        normalizeBlock(params.polynetDeveloperInstructions),
      ),
    },
  };
}
