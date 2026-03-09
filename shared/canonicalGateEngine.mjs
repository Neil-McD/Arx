const CANONICAL_TIER_SET = new Set(["free", "builder"]);
const PAID_TIER_SET = new Set(["builder"]);
const VALID_AUTH_STATE = new Set(["anonymous", "authenticated"]);
const VALID_SURFACE = new Set(["web", "mobile"]);
const VALID_EXECUTION_MODE = new Set(["cloud"]);
const VALID_MODEL_CLASS = new Set(["free_model", "paid_model"]);
const VALID_REQUESTED_FUNDING_SOURCE = new Set([
  "demo_public",
  "user_key",
  "user_chatgpt",
  "platform",
  "auto",
]);
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

function normalizeRequestedFundingSource(rawRequestedFundingSource, rawModelClass) {
  const normalized = toLowerTrimmed(rawRequestedFundingSource);
  if (VALID_REQUESTED_FUNDING_SOURCE.has(normalized) && normalized !== "auto") {
    return normalized;
  }
  const legacyModelClass = normalizeModelClass(rawModelClass);
  return legacyModelClass === "free_model" ? "demo_public" : "platform";
}

function normalizeTurnClass(rawTurnClass) {
  const normalized = toLowerTrimmed(rawTurnClass);
  return VALID_TURN_CLASS.has(normalized) ? normalized : "chat_only";
}

function normalizeCanonicalTier(rawTier) {
  const normalized = toLowerTrimmed(rawTier);
  if (normalized === "pro" || normalized === "architect") return "builder";
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
    fundingSource: null,
  };
}

function allow(lane, fundingSource) {
  return {
    allowed: true,
    code: "ok",
    cta: "none",
    lane,
    fundingSource,
  };
}

export function evaluateCanonicalGate(rawInput) {
  const surface = normalizeSurface(rawInput?.surface);
  const executionMode = normalizeExecutionMode(rawInput?.executionMode);
  const requestedFundingSource = normalizeRequestedFundingSource(
    rawInput?.requestedFundingSource,
    rawInput?.modelClass,
  );
  const turnClass = normalizeTurnClass(rawInput?.turnClass);
  const authState = normalizeAuthState(rawInput?.authState);
  const effectiveTier = resolveEffectiveTier({
    authState,
    tier: rawInput?.tier,
  });
  const hasUserKeyConnection = Boolean(rawInput?.hasUserKeyConnection);
  const hasUserChatGptConnection = Boolean(rawInput?.hasUserChatGptConnection);
  const isPaid = isPaidEffectiveTier(effectiveTier);
  const isAnonymous = effectiveTier === "anon_free";

  if (turnClass === "requires_tools") {
    if (requestedFundingSource === "user_chatgpt") {
      if (isAnonymous) {
        return {
          ...deny("auth_required", "sign_in"),
          effectiveTier,
        };
      }
      if (!isPaid) {
        return {
          ...deny("tier_required", "upgrade"),
          effectiveTier,
        };
      }
      if (hasUserChatGptConnection) {
        return {
          ...allow("daytona_cloud", "user_chatgpt"),
          effectiveTier,
        };
      }
      return {
        ...deny("provider_connection_required", "connect_provider"),
        effectiveTier,
      };
    }
    if (requestedFundingSource === "user_key") {
      if (isAnonymous) {
        return {
          ...deny("auth_required", "sign_in"),
          effectiveTier,
        };
      }
      if (!isPaid) {
        return {
          ...deny("tier_required", "upgrade"),
          effectiveTier,
        };
      }
      if (hasUserKeyConnection) {
        return {
          ...allow("daytona_cloud", "user_key"),
          effectiveTier,
        };
      }
      return {
        ...deny("provider_connection_required", "connect_provider"),
        effectiveTier,
      };
    }
    if (isPaid) {
      return {
        ...allow("daytona_cloud", "platform"),
        effectiveTier,
      };
    }
    return {
      ...deny(isAnonymous ? "auth_required" : "tier_required", isAnonymous ? "sign_in" : "upgrade"),
      effectiveTier,
    };
  }

  if (requestedFundingSource === "demo_public") {
    return {
      ...allow("public", "demo_public"),
      effectiveTier,
    };
  }

  if (requestedFundingSource === "user_key") {
    if (isAnonymous) {
      return {
        ...deny("auth_required", "sign_in"),
        effectiveTier,
      };
    }
    if (hasUserKeyConnection) {
      return {
        ...allow("platform", "user_key"),
        effectiveTier,
      };
    }
    return {
      ...deny("provider_connection_required", "connect_provider"),
      effectiveTier,
    };
  }

  if (requestedFundingSource === "user_chatgpt") {
    if (isAnonymous) {
      return {
        ...deny("auth_required", "sign_in"),
        effectiveTier,
      };
    }
    if (hasUserChatGptConnection) {
      return {
        ...allow("chatgpt", "user_chatgpt"),
        effectiveTier,
      };
    }
    return {
      ...deny(hasUserChatGptConnection ? "runner_unavailable" : "provider_connection_required", hasUserChatGptConnection ? "none" : "connect_provider"),
      effectiveTier,
    };
  }

  if (isPaid) {
    return {
      ...allow("platform", "platform"),
      effectiveTier,
    };
  }

  if (authState === "authenticated" && hasUserChatGptConnection) {
    return {
      ...allow("chatgpt", "user_chatgpt"),
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
