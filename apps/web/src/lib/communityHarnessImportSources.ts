export type CommunityHarnessImportSource = {
  id: string;
  label: string;
  logoUrl: string;
};

export const communityHarnessImportSources: CommunityHarnessImportSource[] = [
  {
    id: "claude",
    label: "Claude",
    logoUrl: "/harness-logos/claude.svg",
  },
  {
    id: "codex",
    label: "Codex",
    logoUrl: "/harness-logos/codex.png",
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    logoUrl: "/harness-logos/openclaw.svg",
  },
  {
    id: "hermes",
    label: "Hermes",
    logoUrl: "/harness-logos/hermes.svg",
  },
  {
    id: "cursor",
    label: "Cursor",
    logoUrl: "/harness-logos/cursor.png",
  },
  {
    id: "opencode",
    label: "OpenCode",
    logoUrl: "/harness-logos/opencode.svg",
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    logoUrl: "/harness-logos/gemini-cli.svg",
  },
  {
    id: "antigravity",
    label: "Antigravity",
    logoUrl: "/harness-logos/antigravity.svg",
  },
];
