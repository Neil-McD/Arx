const STRICT_MODULE_LOAD_PATTERNS = [
  "importing a module script failed",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "failed to load module script",
  "module script load",
  "dynamically imported module",
  "dynamic import",
  "loading chunk",
  "chunk load failed",
  "loading css chunk",
  "css chunk load failed",
  // An old tab calling a backend function a newer release removed: reload onto the new build.
  "could not find public function",
  "unable to preload css",
  "preloaderror",
  "vite:preloaderror",
  "chunkloaderror",
];

const BROAD_MODULE_LOAD_PATTERNS = [
  ...STRICT_MODULE_LOAD_PATTERNS,
  "network error",
  "networkerror",
  "load failed",
];

export function readErrorMessage(error: unknown): string {
  return readErrorMessageAtDepth(error, 0);
}

function readErrorMessageAtDepth(error: unknown, depth: number): string {
  if (depth > 2) return "";
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.trim();
  }
  if (typeof error === "string") return error.trim();
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  const messageParts = [
    record.name,
    record.message,
    record.reason,
    record.type,
    record.href,
    record.src,
    record.url,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const nestedPayloadMessage = readErrorMessageAtDepth(record.payload, depth + 1);
  const nestedDetailMessage = readErrorMessageAtDepth(record.detail, depth + 1);
  const nestedErrorMessage = readErrorMessageAtDepth(record.error, depth + 1);
  return [...messageParts, nestedPayloadMessage, nestedDetailMessage, nestedErrorMessage]
    .filter(Boolean)
    .join(": ");
}

export function isLikelyModuleLoadFailure(
  error: unknown,
  options?: { force?: boolean; strict?: boolean },
): boolean {
  if (options?.force) return true;
  const message = readErrorMessage(error).toLowerCase();
  if (!message) return false;
  const patterns = options?.strict ? STRICT_MODULE_LOAD_PATTERNS : BROAD_MODULE_LOAD_PATTERNS;
  return patterns.some((pattern) => message.includes(pattern));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a dynamic module import once on transient/chunk-load errors before
 * letting React.lazy cache a failure. Keeps rapid tab switching resilient to
 * brief network blips without hiding genuine code errors.
 */
export async function resilientImport<T>(
  importer: () => Promise<T>,
  options?: {
    retries?: number;
    retryDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const retries = options?.retries ?? 1;
  const retryDelayMs = options?.retryDelayMs ?? 250;
  const sleep = options?.sleep ?? defaultSleep;
  let attempt = 0;
  while (true) {
    try {
      return await importer();
    } catch (error) {
      if (attempt >= retries || !isLikelyModuleLoadFailure(error)) {
        throw error;
      }
      attempt += 1;
      await sleep(retryDelayMs * attempt);
    }
  }
}

type ConnectionLike = {
  saveData?: boolean;
  effectiveType?: string;
};

export function shouldIdlePrefetch(nav?: { connection?: ConnectionLike } | null): boolean {
  const connection = nav?.connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  const effectiveType = String(connection.effectiveType ?? "").toLowerCase();
  if (effectiveType === "slow-2g" || effectiveType === "2g") return false;
  return true;
}

/**
 * Gently warms on-demand tab modules once the browser is idle so tab switching
 * is instant and stays resilient even if a new deploy ships mid-session.
 */
export function scheduleIdlePrefetch(
  loaders: Array<() => Promise<unknown>>,
  options?: {
    initialDelayMs?: number;
    stepDelayMs?: number;
  },
): () => void {
  if (typeof window === "undefined" || loaders.length === 0) return () => {};
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { connection?: ConnectionLike }) : null;
  if (!shouldIdlePrefetch(nav)) return () => {};

  let cancelled = false;
  let timerId: number | null = null;
  let idleId: number | null = null;
  const initialDelayMs = options?.initialDelayMs ?? 2200;
  const stepDelayMs = options?.stepDelayMs ?? 180;
  const ric = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  }).requestIdleCallback;
  const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;

  const runNext = (index: number) => {
    if (cancelled || index >= loaders.length) return;
    const kick = () => {
      if (cancelled) return;
      Promise.resolve()
        .then(() => loaders[index]())
        .catch(() => {
          // Best-effort warm-up only; never surface background prefetch errors.
        })
        .finally(() => {
          if (cancelled || index + 1 >= loaders.length) return;
          timerId = window.setTimeout(() => runNext(index + 1), stepDelayMs);
        });
    };
    if (typeof ric === "function") {
      idleId = ric(kick, { timeout: 3000 });
    } else {
      timerId = window.setTimeout(kick, stepDelayMs);
    }
  };

  timerId = window.setTimeout(() => runNext(0), initialDelayMs);

  return () => {
    cancelled = true;
    if (timerId !== null) window.clearTimeout(timerId);
    if (idleId !== null && typeof cic === "function") cic(idleId);
  };
}
