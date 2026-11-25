import { expect, test } from "vitest";
import { buildPolynetMcpSetupForOrigin } from "../shared/polynetMcpSetup";

test("universal MCP setup prompt accurately describes named tools and covers all supported harnesses", () => {
  const setup = buildPolynetMcpSetupForOrigin("https://www.polynet.ai");
  expect(setup.environment).toBe("production");
  expect(setup.endpointUrl).toBe("https://www.polynet.ai/runtime/mcp");
  expect(setup.setupBundle).not.toMatch(/canonical five tools|exactly five Polynet tools/i);
  expect(setup.setupBundle).toContain("polynet_list");
  expect(setup.setupBundle).toContain("polynet_read");
  expect(setup.setupBundle).toContain("polynet_search");
  for (const harness of ["Claude Code", "Codex", "OpenClaw", "Hermes", "Cursor", "ChatGPT", "Grok"]) {
    expect(setup.setupBundle).toContain(harness);
  }
  expect(setup.setupBundle).not.toContain("## First-Time Community Setup");
});

test("MCP setup prompt adds first-time community setup guidance when copied during builder onboarding", () => {
  const setup = buildPolynetMcpSetupForOrigin("https://www.polynet.ai", {
    community: { name: "Sunrise Climbing Club", slug: "sunrise-climbing" },
  });
  expect(setup.setupBundle).toContain("## First-Time Community Setup");
  expect(setup.setupBundle).toContain('Sunrise Climbing Club');
  expect(setup.setupBundle).toContain("`sunrise-climbing`");
  expect(setup.setupBundle).toContain("Member Board stages");
  expect(setup.setupBundle).toContain("Ask which of these they want to set up first");
});
