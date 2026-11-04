// Every Convex function reached through an untyped reference
// (`internalRefs.<module>.<fn>`, `(internal as any).<module>.<fn>`) must name a
// module that exists: a deleted module referenced this way passes the
// typecheck and fails only at run time.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const convexDir = join(root, "convex");
const modules = new Set(readdirSync(convexDir).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3)));
const missing: string[] = [];
for (const dir of ["convex", "shared"]) {
  for (const file of readdirSync(join(root, dir))) {
    if (!file.endsWith(".ts") || file.includes(".test.") || file.endsWith(".d.ts")) continue;
    const source = readFileSync(join(root, dir, file), "utf8");
    for (const match of source.matchAll(/\b(?:internalRefs|\((?:internal|api) as any\))\s*\.\s*([A-Za-z]+)\s*\.\s*[A-Za-z]+/g)) {
      if (!modules.has(match[1]!)) missing.push(`${dir}/${file}: ${match[0]}`);
    }
  }
}
assert.deepEqual(missing, [], "these references name a Convex module that no longer exists");
console.log("no_missing_module_refs_proof: ok");
