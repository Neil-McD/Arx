const COMPATIBLE_HARNESSES = [
  {
    name: "Codex",
    logoUrl: "/harness-logos/codex.svg",
  },
  {
    name: "Claude Code",
    logoUrl: "/harness-logos/claude-code.svg",
  },
  {
    name: "OpenClaw",
    logoUrl: "/harness-logos/openclaw.svg",
  },
  {
    name: "Hermes",
    logoUrl: "/harness-logos/hermes.png",
  },
] as const;

export function WebCommunityOnboardingMcpCompatibility() {
  return (
    <div
      className="community-onboarding-mcp-compatibility"
      aria-label="Compatible AI harnesses"
    >
      <span className="community-onboarding-mcp-compatibility-label">
        Works with
      </span>
      <ul className="community-onboarding-mcp-harnesses">
        {COMPATIBLE_HARNESSES.map((harness) => (
          <li key={harness.name} className="community-onboarding-mcp-harness">
            <span className="community-onboarding-mcp-harness-logo" aria-hidden="true">
              <img src={harness.logoUrl} alt="" />
            </span>
            <span>{harness.name}</span>
          </li>
        ))}
        <li className="community-onboarding-mcp-harness community-onboarding-mcp-harness-more">
          + other MCP clients
        </li>
      </ul>
    </div>
  );
}
