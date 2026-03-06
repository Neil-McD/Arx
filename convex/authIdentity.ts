function normalizeSubject(raw: unknown): string {
  return String(raw ?? "").trim();
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function readBoolEnv(name: string): boolean {
  const normalized = readEnv(name).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function allowUnverifiedAuthSubjectFallback(): boolean {
  return readBoolEnv("ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT");
}

async function readVerifiedIdentitySubject(ctx: any): Promise<string | null> {
  try {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const subject = normalizeSubject(identity.subject);
    return subject || null;
  } catch {
    return null;
  }
}

export async function resolveAuthenticatedSubject(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<string> {
  const explicitSubject = normalizeSubject(args.authSubject);
  const verifiedSubject = await readVerifiedIdentitySubject(args.ctx);
  const allowUnverified = allowUnverifiedAuthSubjectFallback();

  if (verifiedSubject && explicitSubject && verifiedSubject !== explicitSubject) {
    throw new Error("auth_subject_mismatch");
  }

  if (verifiedSubject) {
    return verifiedSubject;
  }

  if (!allowUnverified) {
    throw new Error("verified_identity_required");
  }

  if (!explicitSubject) throw new Error("auth_subject_required");
  return explicitSubject;
}
