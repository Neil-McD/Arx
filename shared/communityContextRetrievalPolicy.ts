export type CommunityContextBundle<TChatRow, TResourceRow> = {
  chatRows: TChatRow[];
  resourceRows: TResourceRow[];
  compiledAttempted: boolean;
  compiledFetchOk: boolean;
  compiledItemsUsed: number;
  compileVersion: number | null;
  fallbackUsed: boolean;
  chatFetchOk: boolean | null;
  resourceFetchOk: boolean | null;
  retrievalLatencyMs: number | null;
  failureClass: string | null;
};

export type CommunityContextCompiledNormalization<TChatRow, TResourceRow> = {
  chatRows: TChatRow[];
  resourceRows: TResourceRow[];
  compileVersion: number | null;
  compiledItemsUsed: number;
};

function toSafeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function toSafeClass(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function inferQueryTooBroad(query: string | null | undefined): boolean {
  const raw = String(query ?? "").trim().toLowerCase();
  if (!raw) return true;

  const stopWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "how",
    "i", "if", "in", "into", "is", "it", "me", "my", "of", "on", "or", "so", "that",
    "the", "their", "them", "there", "these", "they", "this", "to", "we", "what",
    "when", "where", "which", "who", "why", "with", "you", "your",
  ]);

  const tokens = raw
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));

  const uniqueTokens = Array.from(new Set(tokens));
  return uniqueTokens.length < 2;
}

export async function loadCommunityContextBundleWithPolicy<
  TCompiledRow,
  TChatRow,
  TResourceRow,
>(params: {
  loadCompiled: () => Promise<TCompiledRow[]>;
  normalizeCompiled: (
    rows: TCompiledRow[],
  ) => CommunityContextCompiledNormalization<TChatRow, TResourceRow>;
  loadChatFallback: () => Promise<TChatRow[]>;
  loadResourceFallback: () => Promise<TResourceRow[]>;
  shouldFallbackOnEmptyCompiled?: boolean;
  query?: string | null;
}): Promise<CommunityContextBundle<TChatRow, TResourceRow>> {
  const startedAt = Date.now();
  let compiledFetchOk = false;
  let compiledItemsUsed = 0;
  let compileVersion: number | null = null;
  let compiledWasEmpty = false;

  const shouldFallbackOnEmptyCompiled = params.shouldFallbackOnEmptyCompiled !== false;
  const queryTooBroad = inferQueryTooBroad(params.query);

  try {
    const compiledRows = await params.loadCompiled();
    const normalized = params.normalizeCompiled(compiledRows);
    compiledFetchOk = true;
    compiledItemsUsed = toSafeInt(normalized.compiledItemsUsed);
    compileVersion =
      typeof normalized.compileVersion === "number" && Number.isFinite(normalized.compileVersion)
        ? normalized.compileVersion
        : null;

    const compiledHasEvidence =
      normalized.chatRows.length > 0 || normalized.resourceRows.length > 0;
    compiledWasEmpty = !compiledHasEvidence;

    if (compiledHasEvidence || !shouldFallbackOnEmptyCompiled) {
      return {
        chatRows: normalized.chatRows,
        resourceRows: normalized.resourceRows,
        compiledAttempted: true,
        compiledFetchOk: true,
        compiledItemsUsed,
        compileVersion,
        fallbackUsed: false,
        chatFetchOk: true,
        resourceFetchOk: true,
        retrievalLatencyMs: Math.max(0, Date.now() - startedAt),
        failureClass: compiledHasEvidence
          ? null
          : queryTooBroad
            ? "query_too_broad"
            : "compiled_empty_fallback_empty",
      };
    }
  } catch {
    compiledFetchOk = false;
  }

  const [chatResult, resourceResult] = await Promise.allSettled([
    params.loadChatFallback(),
    params.loadResourceFallback(),
  ]);
  const chatFetchOk = chatResult.status === "fulfilled";
  const resourceFetchOk = resourceResult.status === "fulfilled";
  const chatRows = chatFetchOk ? chatResult.value : [];
  const resourceRows = resourceFetchOk ? resourceResult.value : [];
  const fallbackHasEvidence = chatRows.length > 0 || resourceRows.length > 0;
  const fallbackOutcome =
    !chatFetchOk && !resourceFetchOk
      ? "failed"
      : fallbackHasEvidence
        ? chatFetchOk && resourceFetchOk
          ? "ok"
          : "partial"
        : "empty";
  const fallbackFailureClass = compiledWasEmpty
    ? `compiled_empty_fallback_${fallbackOutcome}`
    : `compiled_fetch_failed_fallback_${fallbackOutcome}`;
  const resolvedFailureClass =
    fallbackOutcome === "empty" && queryTooBroad
      ? "query_too_broad"
      : fallbackFailureClass;

  return {
    chatRows,
    resourceRows,
    compiledAttempted: true,
    compiledFetchOk,
    compiledItemsUsed,
    compileVersion,
    fallbackUsed: true,
    chatFetchOk,
    resourceFetchOk,
    retrievalLatencyMs: Math.max(0, Date.now() - startedAt),
    failureClass: toSafeClass(resolvedFailureClass),
  };
}
