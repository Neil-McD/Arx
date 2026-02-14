import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import typescript from "typescript";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const modulePath = path.join(repoRoot, "shared", "supabaseAuthIntent.ts");

class MemoryStorage {
  #store = new Map();

  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null;
  }

  setItem(key, value) {
    this.#store.set(key, String(value));
  }

  removeItem(key) {
    this.#store.delete(key);
  }

  clear() {
    this.#store.clear();
  }
}

function loadTsModule(tsFilePath) {
  const source = fs.readFileSync(tsFilePath, "utf8");
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.ES2022,
      target: typescript.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
    fileName: tsFilePath,
  });
  if (transpiled.diagnostics?.length) {
    const formatted = typescript.formatDiagnosticsWithColorAndContext(
      transpiled.diagnostics,
      {
        getCurrentDirectory: () => repoRoot,
        getCanonicalFileName: (name) => name,
        getNewLine: () => "\n",
      },
    );
    throw new Error(`TypeScript transpile diagnostics for ${tsFilePath}:\n${formatted}`);
  }
  const jsDataUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText, "utf8").toString("base64")}`;
  return import(jsDataUrl);
}

function nowMs() {
  return 1_706_000_000_000;
}

async function run() {
  globalThis.localStorage = new MemoryStorage();
  const mod = await loadTsModule(modulePath);

  const validIntentInputs = [
    { reason: "select_model", payload: { model_id: "gpt-5.2" } },
    { reason: "create_community", payload: { draft_id: "draft-1" } },
    { reason: "redeem_purchase_claim", payload: { token: "claim_token" } },
    { reason: "join_public_community", payload: { community_id: "cid", community_slug: null, brandos_aid: null } },
    { reason: "request_community_access", payload: { community_slug: "my-community", message: null } },
    { reason: "start_builder_checkout", payload: { tier: "architect", context: "create_community" } },
    { reason: "open_builder_billing_portal", payload: { context: "builder" } },
    { reason: "start_payouts_onboarding", payload: {} },
    { reason: "redeem_pending_purchases", payload: { navigate: true, silent_noop: false } },
    { reason: "save_profile", payload: {} },
    { reason: "create_memory", payload: { content: "remember this", pinned: true } },
    { reason: "toggle_memory_pinned", payload: { id: "mem-1", pinned: false } },
    { reason: "delete_memory", payload: { id: "mem-2" } },
  ];

  for (const input of validIntentInputs) {
    mod.clearPendingAuthIntent();
    const built = mod.buildPendingAuthIntent(input, "/workspace", nowMs());
    mod.storePendingAuthIntent(built);
    const read = mod.readPendingAuthIntent(nowMs() + 1);
    assert.deepEqual(read, built, `roundtrip mismatch for reason ${input.reason}`);
  }

  mod.clearPendingAuthIntent();
  const parsed = mod.parsePendingAuthIntentInput({ reason: "select_model", payload: { model_id: "  gpt-5.2  " } });
  assert.deepEqual(parsed, { reason: "select_model", payload: { model_id: "gpt-5.2" } });

  const invalidParsed = mod.parsePendingAuthIntentInput({
    reason: "start_builder_checkout",
    payload: { tier: "enterprise", context: "builder" },
  });
  assert.equal(invalidParsed, null);

  const expiredIntent = mod.buildPendingAuthIntent(
    { reason: "save_profile", payload: {} },
    "/workspace",
    nowMs(),
  );
  globalThis.localStorage.setItem(mod.PENDING_AUTH_INTENT_STORAGE_KEY, JSON.stringify(expiredIntent));
  const expiredRead = mod.readPendingAuthIntent(nowMs() + mod.PENDING_AUTH_INTENT_TTL_MS + 1);
  assert.equal(expiredRead, null, "expired intent should be dropped");
  assert.equal(globalThis.localStorage.getItem(mod.PENDING_AUTH_INTENT_STORAGE_KEY), null, "expired intent should be purged");

  globalThis.localStorage.setItem(
    mod.PENDING_AUTH_INTENT_STORAGE_KEY,
    JSON.stringify({
      v: 1,
      reason: "select_model",
      return_to: "/workspace",
      created_at_ms: nowMs(),
      payload: { model_id: "   " },
    }),
  );
  assert.equal(mod.readPendingAuthIntent(nowMs() + 1), null, "invalid payload should fail closed");

  mod.storeAuthReturnTo("  /community  ", nowMs());
  const rawReturn = globalThis.localStorage.getItem(mod.AUTH_RETURN_TO_STORAGE_KEY);
  assert.ok(rawReturn);
  const parsedReturn = JSON.parse(rawReturn);
  assert.equal(parsedReturn.return_to, "/community");
  mod.clearAuthReturnTo();
  assert.equal(globalThis.localStorage.getItem(mod.AUTH_RETURN_TO_STORAGE_KEY), null);

  console.log("PASS: supabase auth intent unit checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
