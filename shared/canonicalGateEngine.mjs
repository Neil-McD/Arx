const CANONICAL_TIER_SET = new Set(["free", "builder", "architect"]);
const PAID_TIER_SET = new Set(["builder", "architect"]);
const VALID_AUTH_STATE = new Set(["anonymous", "authenticated"]);
const VALID_SURFACE = new Set(["web", "desktop", "mobile"]);
const VALID_EXECUTION_MODE = new Set(["cloud", "local"]);
const VALID_MODEL_CLASS = new Set(["free_model", "paid_model"]);
const VALID_TURN_CLASS = new Set(["chat_only", "requires_tools"]);

function toLowerTrimmed(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeAuthState(rawAuthState) {
  const normalized = toLowerTrimmed(rawAuthState);
  return VALID_AUTH_STATE.has(normalized) ? normalized : "anonymous";
}

function normalizeSurface(rawSurface) {
  const normalized = toLowerTrimmed(rawSurface);
  return VALID_SURFACE.has(normalized) ? normalized : "web";
}

function normalizeExecutionMode(rawExecutionMode) {
  const normalized = toLowerTrimmed(rawExecutionMode);
  return VALID_EXECUTION_MODE.has(normalized) ? normalized : "cloud";
}

function normalizeModelClass(rawModelClass) {
  const normalized = toLowerTrimmed(rawModelClass);
  return VALID_MODEL_CLASS.has(normalized) ? normalized : "free_model";
}

function normalizeTurnClass(rawTurnClass) {
  const normalized = toLowerTrimmed(rawTurnClass);
  return VALID_TURN_CLASS.has(normalized) ? normalized : "chat_only";
}

function normalizeCanonicalTier(rawTier) {
  const normalized = toLowerTrimmed(rawTier);
  if (normalized === "pro") return "architect";
  if (CANONICAL_TIER_SET.has(normalized)) return normalized;
  return "free";
}

function resolveEffectiveTier(input) {
  const authState = normalizeAuthState(input?.authState);
  const canonicalTier = normalizeCanonicalTier(input?.tier);
  if (authState === "anonymous") return "anon_free";
  if (canonicalTier === "free") return "auth_free";
  return canonicalTier;
}

function isPaidEffectiveTier(effectiveTier) {
  return PAID_TIER_SET.has(effectiveTier);
}

function deny(code, cta) {
  return {
    allowed: false,
    code,
    cta,
    lane: null,
  };
}

function allow(lane) {
  return {
    allowed: true,
    code: "ok",
    cta: "none",
    lane,
  };
}

export function evaluateCanonicalGate(rawInput) {
  const surface = normalizeSurface(rawInput?.surface);
  const executionMode = normalizeExecutionMode(rawInput?.executionMode);
  const modelClass = normalizeModelClass(rawInput?.modelClass);
  const turnClass = normalizeTurnClass(rawInput?.turnClass);
  const authState = normalizeAuthState(rawInput?.authState);
  const effectiveTier = resolveEffectiveTier({
    authState,
    tier: rawInput?.tier,
  });
  const hasDesktopChatGptAuth = Boolean(rawInput?.hasDesktopChatGptAuth);
  const isPaid = isPaidEffectiveTier(effectiveTier);
  const isAnonymous = effectiveTier === "anon_free";

  if (executionMode === "local") {
    return {
      ...allow("local_runtime"),
      effectiveTier,
    };
  }

  if (turnClass === "requires_tools") {
    if (isPaid) {
      return {
        ...allow("daytona_cloud"),
        effectiveTier,
      };
    }
    return {
      ...deny(isAnonymous ? "auth_required" : "tier_required", isAnonymous ? "sign_in" : "upgrade"),
      effectiveTier,
    };
  }

  if (modelClass === "free_model") {
    return {
      ...allow("public"),
      effectiveTier,
    };
  }

  if (isPaid) {
    return {
      ...allow("platform"),
      effectiveTier,
    };
  }

  if (surface === "desktop" && authState === "authenticated" && hasDesktopChatGptAuth) {
    return {
      ...allow("chatgpt_desktop"),
      effectiveTier,
    };
  }

  return {
    ...deny(isAnonymous ? "auth_required" : "tier_required", isAnonymous ? "sign_in" : "upgrade"),
    effectiveTier,
  };
}

export function normalizeTierForGate(rawTier) {
  return normalizeCanonicalTier(rawTier);
}

export function resolveEffectiveTierForGate(input) {
  return resolveEffectiveTier(input);
}

export function hasPaidAccessForGate(input) {
  return isPaidEffectiveTier(resolveEffectiveTier(input));
}

