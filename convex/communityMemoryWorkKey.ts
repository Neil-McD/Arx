const COMMUNITY_MEMORY_WORK_KEY_PREFIX = "community_memory_work:v1:";
const COMMUNITY_MEMORY_DIGEST_VERSION_KEY_PREFIX = "community_memory_digest:v1:";

export type CommunityMemoryWorkIdentityInput = {
  communityId: unknown;
  category: unknown;
  sourceTypes?: unknown[];
  sourceIds?: unknown[];
  sourceTraceIds?: unknown[];
};

function normalizeIdentityValue(raw: unknown): string {
  return String(raw ?? "").normalize("NFKC").trim();
}

function sortedUniqueIdentityValues(raw: unknown[] | undefined): string[] {
  return Array.from(
    new Set((raw ?? []).map(normalizeIdentityValue).filter(Boolean)),
  ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalCommunityMemoryWorkIdentity(
  input: CommunityMemoryWorkIdentityInput,
): string {
  const communityId = normalizeIdentityValue(input.communityId);
  const category = normalizeIdentityValue(input.category);
  if (!communityId) throw new Error("community_memory_work_community_required");
  if (!category) throw new Error("community_memory_work_category_required");

  const sourceTypes = sortedUniqueIdentityValues(input.sourceTypes);
  const sourceIds = sortedUniqueIdentityValues(input.sourceIds);
  const sourceTraceIds = sortedUniqueIdentityValues(input.sourceTraceIds);
  if (sourceIds.length === 0 && sourceTraceIds.length === 0) {
    throw new Error("community_memory_work_evidence_identity_required");
  }

  return JSON.stringify({
    version: 1,
    communityId,
    category,
    sourceTypes,
    sourceIds,
    sourceTraceIds,
  });
}

export async function buildCommunityMemoryWorkKey(
  input: CommunityMemoryWorkIdentityInput,
): Promise<string> {
  const identity = canonicalCommunityMemoryWorkIdentity(input);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return `${COMMUNITY_MEMORY_WORK_KEY_PREFIX}${bytesToHex(digest)}`;
}

export async function buildCommunityMemoryDigestVersionKey(input: {
  communityId: unknown;
  workKeys: unknown[];
  contentRevisions?: unknown[];
}): Promise<string> {
  const communityId = normalizeIdentityValue(input.communityId);
  if (!communityId) throw new Error("community_memory_digest_community_required");
  const workKeys = sortedUniqueIdentityValues(input.workKeys);
  for (const workKey of workKeys) {
    if (!isCommunityMemoryWorkKey(workKey)) {
      throw new Error("community_memory_digest_work_key_invalid");
    }
  }
  const contentRevisions = sortedUniqueIdentityValues(input.contentRevisions);
  const identity = JSON.stringify({ version: 1, communityId, workKeys, contentRevisions });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return `${COMMUNITY_MEMORY_DIGEST_VERSION_KEY_PREFIX}${bytesToHex(digest)}`;
}

export function isCommunityMemoryWorkKey(raw: unknown): raw is string {
  return new RegExp(`^${COMMUNITY_MEMORY_WORK_KEY_PREFIX}[0-9a-f]{64}$`).test(
    String(raw ?? "").trim(),
  );
}

export function isCommunityMemoryDigestVersionKey(raw: unknown): raw is string {
  return new RegExp(`^${COMMUNITY_MEMORY_DIGEST_VERSION_KEY_PREFIX}[0-9a-f]{64}$`).test(
    String(raw ?? "").trim(),
  );
}
