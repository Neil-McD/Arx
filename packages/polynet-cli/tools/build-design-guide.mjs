#!/usr/bin/env node
// Copies the polynet-ui-design skill into shared/ as Markdown strings, so
// agents that only use Polynet's MCP can read it at
// /communities/<slug>/builder/design-guide.md and design-review.md. The skill in guide/skills is the
// source; run this after changing it (a test fails if the copy is stale).
//
//   node packages/polynet-cli/tools/build-design-guide.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const SKILL = "packages/polynet-cli/guide/skills/polynet-ui-design";
export const DESIGN_GUIDE_TARGET = "shared/communityDesignGuide.ts";

// Two documents, each inside the MCP's 24,000-character read budget: the
// skill with its in-the-app and owner-screens references, and the mistake ledger with the
// reviewer's brief.
const PARTS = {
  COMMUNITY_DESIGN_GUIDE_MARKDOWN: ["SKILL.md", "references/in-the-app.md", "references/owner-screens.md"],
  COMMUNITY_DESIGN_REVIEW_MARKDOWN: ["references/mistakes.md", "references/reviewer.md"],
};

export async function buildDesignGuide() {
  let out = `// Generated from ${SKILL} by packages/polynet-cli/tools/build-design-guide.mjs. Do not edit.\n`;
  for (const [name, files] of Object.entries(PARTS)) {
    const parts = await Promise.all(files.map(async (file) =>
      (await readFile(join(repo, SKILL, file), "utf8")).replace(/^---\n[\s\S]*?\n---\n+/, "").trimEnd()));
    out += `export const ${name} = ${JSON.stringify(`${parts.join("\n\n---\n\n")}\n`)};\n`;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(join(repo, DESIGN_GUIDE_TARGET), await buildDesignGuide());
  console.log(`✓ ${DESIGN_GUIDE_TARGET} from ${SKILL}`);
}
