export type EnsureSessionFn<SessionT> = (session: SessionT) => Promise<SessionT | null>;
export type EnsureCurrentSessionFn<SessionT> = () => Promise<SessionT | null>;

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
  if (!ensureSession) return getSession();
  return await ensureSession();
}
