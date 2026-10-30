#!/usr/bin/env node
// Copies Polynet's content contracts into the CLI as plain JavaScript, so
// `polynet check` refuses exactly what the server refuses. The sources are the
// TypeScript files in shared/; run this after changing them (a test fails if the
// copies are stale). The CLI ships without a build step or dependencies.
//
//   node packages/polynet-cli/tools/build-contracts.mjs
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
export const CONTRACTS = {
  "lesson.mjs": "shared/communityLessonContract.ts",
  "embed.mjs": "shared/communityEmbed.ts",
  "theme.mjs": "shared/communityTheme.ts",
  "layout.mjs": "shared/communityLayout.ts",
  "sections.mjs": "shared/communityLessonSections.ts",
  "brand.mjs": "shared/communityBrand.ts",
};

export async function buildContract(source) {
  const text = await readFile(join(repo, source), "utf8");
  const { outputText } = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false },
  });
  // A contract that imports another (the brand reads the theme) imports its copy.
  const linked = Object.entries(CONTRACTS).reduce((code, [file, other]) =>
    code.replaceAll(`from "./${basename(other, ".ts")}"`, `from "./${file}"`), outputText);
  if (/from "\.\.?\//.test(linked.replace(/from "\.\/[a-z]+\.mjs"/g, ""))) throw new Error(`${source} imports a file that isn't a contract.`);
  return `// Generated from ${source} by tools/build-contracts.mjs. Do not edit.\n${linked}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [file, source] of Object.entries(CONTRACTS)) {
    await writeFile(join(here, "../contracts", file), await buildContract(source));
    console.log(`✓ contracts/${file} from ${source}`);
  }
}
