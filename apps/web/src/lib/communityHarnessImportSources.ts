export type CommunityHarnessImportSource = {
  id: string;
  label: string;
  logoUrl: string;
};

export const communityHarnessImportSources: CommunityHarnessImportSource[] = [
  {
    id: "clawd",
    label: "Clawd",
    logoUrl: "/harness-logos/clawd.png",
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
];
