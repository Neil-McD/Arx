export const AUTH_PROVIDER_RESPONSE_TIMEOUT_MS = 10_000;
export const AUTH_REQUEST_TIMEOUT = "auth_request_timeout" as const;

export type AuthProviderTextResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  bodyText: string;
};

export class AuthProviderRequestTimeoutError extends Error {
  readonly code = AUTH_REQUEST_TIMEOUT;

  constructor() {
    super(AUTH_REQUEST_TIMEOUT);
    this.name = "AuthProviderRequestTimeoutError";
  }
}

export function isAuthProviderRequestTimeout(error: unknown): boolean {
  return (
    error instanceof AuthProviderRequestTimeoutError ||
    (error instanceof Error && error.message === AUTH_REQUEST_TIMEOUT)
  );
}

export async function fetchAuthProviderText(
  input: RequestInfo | URL,
  init: Omit<RequestInit, "signal"> = {},
): Promise<AuthProviderTextResponse> {
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new AuthProviderRequestTimeoutError());
    }, AUTH_PROVIDER_RESPONSE_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      deadline,
    ]);
    const bodyText = await Promise.race([response.text(), deadline]);
    return {
      ok: response.ok,
      status: response.status,
      headers: new Headers(response.headers),
      bodyText,
    };
  } catch (error) {
    if (timedOut) throw new AuthProviderRequestTimeoutError();
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
