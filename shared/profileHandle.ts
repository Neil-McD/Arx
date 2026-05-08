const RESERVED_PROFILE_HANDLES = new Set([
  "account",
  "admin",
  "api",
  "app",
  "apps",
  "auth",
  "billing",
  "community",
  "communities",
  "discover",
  "docs",
  "help",
  "home",
  "login",
  "logout",
  "onboarding",
  "operator",
  "polynet",
  "settings",
  "support",
  "workspace",
  "www",
]);

export type ProfileHandleValidationResult =
  | { ok: true; handle: string; normalizedHandle: string }
  | { ok: false; reason: "empty" | "too_short" | "too_long" | "invalid_format" | "reserved" };

export function normalizeProfileHandle(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export function validateProfileHandle(raw: unknown): ProfileHandleValidationResult {
  const normalizedHandle = normalizeProfileHandle(raw);
  if (!normalizedHandle) return { ok: false, reason: "empty" };
  if (normalizedHandle.length < 3) return { ok: false, reason: "too_short" };
  if (normalizedHandle.length > 32) return { ok: false, reason: "too_long" };
  if (!/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/.test(normalizedHandle)) {
    return { ok: false, reason: "invalid_format" };
  }
  if (RESERVED_PROFILE_HANDLES.has(normalizedHandle)) return { ok: false, reason: "reserved" };
  return { ok: true, handle: normalizedHandle, normalizedHandle };
}

