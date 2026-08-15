export const APP_ADMISSION_TIMEOUT_MS = 10_000;

export class AsyncDeadlineError extends Error {
  readonly code: string;
  readonly timeoutMs: number;

  constructor(code: string, timeoutMs: number) {
    super(code);
    this.name = "AsyncDeadlineError";
    this.code = code;
    this.timeoutMs = timeoutMs;
  }
}

export async function withAsyncDeadline<T>(
  work: PromiseLike<T>,
  options: {
    timeoutMs: number;
    code: string;
  },
): Promise<T> {
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs));
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AsyncDeadlineError(options.code, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(work), deadline]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}
