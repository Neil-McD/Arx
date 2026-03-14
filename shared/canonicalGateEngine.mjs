const CANONICAL_TIER_SET = new Set(["free", "builder", "architect"]);
const WORKBENCH_TIER_SET = new Set(["builder", "architect"]);
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
const VALID_REQUESTED_EXECUTION_TARGET = new Set(["chat", "daytona_workspace"]);
const VALID_CAPABILITY_FAMILY = new Set(["community_tools", "web_research", "workspace_tools"]);

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

function normalizeRequestedExecutionTarget(rawRequestedExecutionTarget) {
  const normalized = toLowerTrimmed(rawRequestedExecutionTarget);
  if (VALID_REQUESTED_EXECUTION_TARGET.has(normalized)) return normalized;
  return "chat";
}

export function resolveRequiresWorkspaceToolsForGate(input) {
  return normalizeRequestedExecutionTarget(input?.requestedExecutionTarget) === "daytona_workspace";
}

function normalizeCanonicalTier(rawTier) {
  const normalized = toLowerTrimmed(rawTier);
  if (normalized === "pro" || normalized === "architect") return "architect";
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
  return WORKBENCH_TIER_SET.has(effectiveTier);
}

function normalizeHasCommunityContext(rawValue) {
  return rawValue === true;
}

export function resolveEntitledCapabilityFamiliesForGate(input) {
  const effectiveTier = resolveEffectiveTier({
    authState: input?.authState,
    tier: input?.tier,
  });
  if (effectiveTier === "anon_free") return [];
  if (effectiveTier === "auth_free") return ["community_tools", "web_research"];
  return ["community_tools", "web_research", "workspace_tools"];
}

export function resolveActiveCapabilityFamiliesForGate(input) {
  const requiresWorkspaceTools = resolveRequiresWorkspaceToolsForGate(input);
  const hasCommunityContext = normalizeHasCommunityContext(input?.hasCommunityContext);
  const entitled = resolveEntitledCapabilityFamiliesForGate(input);
  const active = [];
  if (hasCommunityContext && entitled.includes("community_tools")) {
    active.push("community_tools");
  }
  if (entitled.includes("web_research")) {
    active.push("web_research");
  }
  if (requiresWorkspaceTools && entitled.includes("workspace_tools")) {
    active.push("workspace_tools");
  }
  return active.filter((value, index, list) => VALID_CAPABILITY_FAMILY.has(value) && list.indexOf(value) === index);
}

export function resolveHarnessProfileForGate(input) {
  const authState = normalizeAuthState(input?.authState);
  if (authState === "anonymous") return "anonymous_demo";
  const requiresWorkspaceTools = resolveRequiresWorkspaceToolsForGate(input);
  const active = resolveActiveCapabilityFamiliesForGate(input);
  if (requiresWorkspaceTools) {
    return "authenticated_cloud_workspace";
  }
  return active.length > 0 ? "authenticated_cloud_tools" : "authenticated_cloud_chat";
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
  const requestedExecutionTarget = normalizeRequestedExecutionTarget(rawInput?.requestedExecutionTarget);
  const authState = normalizeAuthState(rawInput?.authState);
  const effectiveTier = resolveEffectiveTier({
    authState,
    tier: rawInput?.tier,
  });
  const hasUserKeyConnection = Boolean(rawInput?.hasUserKeyConnection);
  const hasUserChatGptConnection = Boolean(rawInput?.hasUserChatGptConnection);
  const hasWorkbenchAccess = isPaidEffectiveTier(effectiveTier);
  const isAnonymous = effectiveTier === "anon_free";

  if (requestedExecutionTarget === "daytona_workspace") {
    if (requestedFundingSource === "user_chatgpt") {
      if (isAnonymous) {
        return {
          ...deny("auth_required", "sign_in"),
          effectiveTier,
        };
      }
      if (!hasWorkbenchAccess) {
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
      if (!hasWorkbenchAccess) {
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
    if (hasWorkbenchAccess) {
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

  if (hasWorkbenchAccess) {
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

  if (authState === "authenticated" && hasUserKeyConnection) {
    return {
      ...allow("platform", "user_key"),
      effectiveTier,
    };
  }

  return {
    ...deny(
      isAnonymous ? "auth_required" : "provider_connection_required",
      isAnonymous ? "sign_in" : "connect_provider",
    ),
    effectiveTier,
  };
}

export function normalizeTierForGate(rawTier) {
  return normalizeCanonicalTier(rawTier);
}

export function resolveRequestedExecutionTargetForGate(input) {
  return normalizeRequestedExecutionTarget(input?.requestedExecutionTarget);
}

export function resolveEffectiveTierForGate(input) {
  return resolveEffectiveTier(input);
}

export function hasPaidAccessForGate(input) {
  return isPaidEffectiveTier(resolveEffectiveTier(input));
}
