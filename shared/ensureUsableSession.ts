export type EnsureSessionFn<SessionT> = (session: SessionT) => Promise<SessionT | null>;
export type EnsureCurrentSessionFn<SessionT> = () => Promise<SessionT | null>;
export type CurrentSessionResolution<SessionT> =
  | { state: "ready"; session: SessionT }
  | { state: "missing"; session: null }
  | { state: "unusable"; session: null };

export async function resolveUsableSession<SessionT>(
  session: SessionT | null | undefined,
  ensureSession?: EnsureSessionFn<SessionT>,
): Promise<SessionT | null> {
  const candidate = session ?? null;
  if (!candidate) return null;
  if (!ensureSession) return candidate;
  return await ensureSession(candidate);
}

export async function resolveCurrentSession<SessionT>(
  getSession: () => SessionT | null,
  ensureSession?: EnsureCurrentSessionFn<SessionT>,
): Promise<SessionT | null> {
  const result = await resolveCurrentSessionState(getSession, ensureSession);
  return result.session;
}

export async function resolveCurrentSessionState<SessionT>(
  getSession: () => SessionT | null,
  ensureSession?: EnsureCurrentSessionFn<SessionT>,
): Promise<CurrentSessionResolution<SessionT>> {
  const current = getSession();
  if (!ensureSession) {
    return current
      ? { state: "ready", session: current }
      : { state: "missing", session: null };
  }
  const ensured = await ensureSession();
  if (ensured) return { state: "ready", session: ensured };
  return current
    ? { state: "unusable", session: null }
    : { state: "missing", session: null };
}
