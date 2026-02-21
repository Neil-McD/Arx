import { getEnv } from "./env.ts";
import { supabaseAdminFetch } from "./supabase_admin.ts";
import {
  COMMUNITY_HARNESS_REQUIRED_RPCS,
  COMMUNITY_HARNESS_REQUIRED_TABLES,
  COMMUNITY_HARNESS_RUNTIME_CONTRACT_ID,
} from "./community_harness_contract.ts";

export type CommunityHarnessContractMode = "warn" | "enforce";

export type CommunityHarnessContractCheckResult = {
  contract_id: string;
  mode: CommunityHarnessContractMode;
  ok: boolean;
  checked_at: string;
  missing_symbols: string[];
  error_message: string | null;
};

type CachedContractCheck = {
  expires_at_ms: number;
  result: CommunityHarnessContractCheckResult;
};

const CONTRACT_CACHE_TTL_MS = 60_000;
let cachedContractCheck: CachedContractCheck | null = null;

function parseContractMode(): CommunityHarnessContractMode {
  const raw = String(getEnv("ARX_COMMUNITY_CONTRACT_MODE") ?? "enforce").trim().toLowerCase();
  return raw === "warn" ? "warn" : "enforce";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveOpenApiRef(openapi: Record<string, unknown>, ref: string): unknown {
  const normalizedRef = String(ref ?? "").trim();
  if (!normalizedRef.startsWith("#/")) return null;
  const segments = normalizedRef.slice(2).split("/").filter(Boolean).map(decodeJsonPointerSegment);
  let current: unknown = openapi;
  for (const segment of segments) {
    const currentRecord = asRecord(current);
    if (!currentRecord || !(segment in currentRecord)) return null;
    current = currentRecord[segment];
  }
  return current;
}

function readSchemaPropertyNames(
  openapi: Record<string, unknown>,
  schemaLike: unknown,
  seenRefs = new Set<string>(),
): Set<string> {
  const schema = asRecord(schemaLike);
  if (!schema) return new Set<string>();

  const directProperties = asRecord(schema.properties);
  if (directProperties) return new Set<string>(Object.keys(directProperties));

  const ref = typeof schema.$ref === "string" ? schema.$ref.trim() : "";
  if (ref) {
    if (seenRefs.has(ref)) return new Set<string>();
    seenRefs.add(ref);
    return readSchemaPropertyNames(openapi, resolveOpenApiRef(openapi, ref), seenRefs);
  }

  const allOf = Array.isArray(schema.allOf) ? schema.allOf : [];
  if (allOf.length > 0) {
    const merged = new Set<string>();
    for (const part of allOf) {
      const names = readSchemaPropertyNames(openapi, part, seenRefs);
      for (const name of names) merged.add(name);
    }
    if (merged.size > 0) return merged;
  }

  return new Set<string>();
}

function readBodyArgNames(
  openapi: Record<string, unknown>,
  pathEntry: Record<string, unknown>,
): Set<string> {
  const post = asRecord(pathEntry.post);
  if (!post) return new Set<string>();

  const requestBody = asRecord(post.requestBody);
  if (requestBody) {
    const content = asRecord(requestBody.content);
    if (content) {
      for (const mediaTypeEntry of Object.values(content)) {
        const mediaType = asRecord(mediaTypeEntry);
        if (!mediaType) continue;
        const names = readSchemaPropertyNames(openapi, mediaType.schema);
        if (names.size > 0) return names;
      }
    }
  }

  const parameters = Array.isArray(post.parameters) ? post.parameters : [];
  for (const parameter of parameters) {
    const paramRecord = asRecord(parameter);
    if (!paramRecord) continue;
    if (paramRecord.in !== "body") continue;
    const names = readSchemaPropertyNames(openapi, paramRecord.schema);
    if (names.size > 0) return names;
  }
  return new Set<string>();
}

function collectMissingSymbols(openapi: Record<string, unknown>): string[] {
  const paths = asRecord(openapi.paths);
  if (!paths) return ["openapi.paths"];

  const missing: string[] = [];
  for (const spec of COMMUNITY_HARNESS_REQUIRED_RPCS) {
    const entry = asRecord(paths[spec.openapi_path]);
    if (!entry) {
      missing.push(spec.symbol_id);
      continue;
    }
    const argNames = readBodyArgNames(openapi, entry);
    for (const arg of spec.required_args) {
      if (!argNames.has(arg)) {
        missing.push(`${spec.symbol_id}#arg:${arg}`);
      }
    }
  }

  for (const spec of COMMUNITY_HARNESS_REQUIRED_TABLES) {
    const entry = asRecord(paths[spec.openapi_path]);
    if (!entry) missing.push(spec.symbol_id);
  }
  return missing;
}

async function loadOpenApiSpec(): Promise<Record<string, unknown>> {
  const res = await supabaseAdminFetch("/rest/v1/", {
    method: "GET",
    headers: { Accept: "application/openapi+json" },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`openapi_fetch_failed:${res.status}:${body}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("openapi_parse_failed");
  }
  const record = asRecord(parsed);
  if (!record) throw new Error("openapi_not_object");
  return record;
}

export function toCommunityHarnessContractMeta(
  result: CommunityHarnessContractCheckResult,
): Record<string, unknown> {
  return {
    contract_id: result.contract_id,
    mode: result.mode,
    status: result.ok ? "ok" : "mismatch",
    missing_symbols: result.missing_symbols,
    checked_at: result.checked_at,
    ...(result.error_message ? { error_message: result.error_message } : {}),
  };
}

export async function checkCommunityHarnessContract(
  options: { force_refresh?: boolean } = {},
): Promise<CommunityHarnessContractCheckResult> {
  const mode = parseContractMode();
  const now = Date.now();
  const forceRefresh = options.force_refresh === true;

  if (!forceRefresh && cachedContractCheck && cachedContractCheck.expires_at_ms > now) {
    if (cachedContractCheck.result.mode !== mode) {
      return {
        ...cachedContractCheck.result,
        mode,
      };
    }
    return cachedContractCheck.result;
  }

  let result: CommunityHarnessContractCheckResult;
  try {
    const openapi = await loadOpenApiSpec();
    const missingSymbols = collectMissingSymbols(openapi);
    result = {
      contract_id: COMMUNITY_HARNESS_RUNTIME_CONTRACT_ID,
      mode,
      ok: missingSymbols.length === 0,
      checked_at: new Date().toISOString(),
      missing_symbols: missingSymbols,
      error_message: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result = {
      contract_id: COMMUNITY_HARNESS_RUNTIME_CONTRACT_ID,
      mode,
      ok: false,
      checked_at: new Date().toISOString(),
      missing_symbols: ["openapi_contract_check_failed"],
      error_message: errorMessage,
    };
  }

  cachedContractCheck = {
    expires_at_ms: now + CONTRACT_CACHE_TTL_MS,
    result,
  };
  return result;
}
