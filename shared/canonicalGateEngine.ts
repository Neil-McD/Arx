export type CanonicalTier = "free" | "architect";
export type EffectiveTier = "anon_free" | "auth_free" | "architect";
export type AuthState = "anonymous" | "authenticated";
export type Surface = "web";
export type ExecutionMode = "cloud";
export type ModelClass = "free_model" | "paid_model";
export type RequestedFundingSource =
  | "demo_public"
  | "user_key"
  | "user_chatgpt"
  | "platform"
  | "auto";
export type CapabilityFamily =
  | "product_docs"
  | "community_tools"
  | "web_research";
export const AUTHENTICATED_PLATFORM_CAPABILITIES: readonly CapabilityFamily[] = [
  "product_docs",
  "community_tools",
  "web_research",
];
export type RuntimeLane = "public" | "platform" | "chatgpt";
export type GateCode =
  | "ok"
  | "auth_required"
  | "tier_required"
  | "provider_connection_required"
  | "runner_unavailable";
export type GateCta = "none" | "sign_in" | "upgrade" | "connect_provider";

export type CanonicalGateInput = {
  surface: Surface;
  executionMode: ExecutionMode;
  modelClass?: ModelClass;
  requestedFundingSource?: RequestedFundingSource | null;
  hasCommunityContext?: boolean;
  hasProjectContext?: boolean;
  authState: AuthState;
  tier?: string | null;
  hasUserKeyConnection?: boolean;
  hasUserChatGptConnection?: boolean;
};

export type CanonicalGateDecision = {
  allowed: boolean;
  code: GateCode;
  cta: GateCta;
  lane: RuntimeLane | null;
  fundingSource: Exclude<RequestedFundingSource, "auto"> | null;
  effectiveTier: EffectiveTier;
};

export type CanonicalGatePolicy = {
  decision: CanonicalGateDecision;
  entitledCapabilityFamilies: CapabilityFamily[];
  activeCapabilityFamilies: CapabilityFamily[];
  harnessProfile: string;
};

const VALID_AUTH_STATE = new Set<AuthState>(["anonymous", "authenticated"]);
const VALID_MODEL_CLASS = new Set<ModelClass>(["free_model", "paid_model"]);
const VALID_REQUESTED_FUNDING_SOURCE = new Set<RequestedFundingSource>([
  "demo_public",
  "user_key",
  "user_chatgpt",
  "platform",
  "auto",
]);
const VALID_CAPABILITY_FAMILY = new Set<CapabilityFamily>([
  "product_docs",
  "community_tools",
  "web_research",
]);

function toLowerTrimmed(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeAuthState(rawAuthState: unknown): AuthState {
  const normalized = toLowerTrimmed(rawAuthState);
  return VALID_AUTH_STATE.has(normalized as AuthState)
    ? (normalized as AuthState)
    : "anonymous";
}

function normalizeModelClass(rawModelClass: unknown): ModelClass {
  const normalized = toLowerTrimmed(rawModelClass);
  return VALID_MODEL_CLASS.has(normalized as ModelClass)
    ? (normalized as ModelClass)
    : "free_model";
}

function normalizeRequestedFundingSource(
  rawRequestedFundingSource: unknown,
  rawModelClass: unknown,
): Exclude<RequestedFundingSource, "auto"> {
  const normalized = toLowerTrimmed(rawRequestedFundingSource);
  if (
    VALID_REQUESTED_FUNDING_SOURCE.has(normalized as RequestedFundingSource) &&
    normalized !== "auto"
  ) {
    return normalized as Exclude<RequestedFundingSource, "auto">;
  }
  const legacyModelClass = normalizeModelClass(rawModelClass);
  return legacyModelClass === "free_model" ? "demo_public" : "platform";
}

function normalizeCanonicalTier(rawTier: unknown): CanonicalTier {
  // Historical labels remain accepted at transport boundaries, but the
  // retired account tier can no longer change product capability or commerce.
  void rawTier;
  return "free";
}

function resolveEffectiveTier(input: { authState?: unknown; tier?: unknown }): EffectiveTier {
  const authState = normalizeAuthState(input?.authState);
  const canonicalTier = normalizeCanonicalTier(input?.tier);
  if (authState === "anonymous") return "anon_free";
  void canonicalTier;
  return "auth_free";
}

function normalizeHasProjectContext(rawValue: unknown): boolean {
  return rawValue === true;
}

export function resolveActiveCapabilityFamiliesFromEntitlements(input: {
  entitledCapabilityFamilies: readonly CapabilityFamily[];
  hasCommunityContext?: boolean;
  hasProjectContext?: boolean;
}): CapabilityFamily[] {
  const hasProjectContext = normalizeHasProjectContext(input?.hasProjectContext);
  const entitled = Array.isArray(input?.entitledCapabilityFamilies)
    ? input.entitledCapabilityFamilies
    : [];
  const active: CapabilityFamily[] = [];
  if (entitled.includes("product_docs")) {
    active.push("product_docs");
  }
  if (entitled.includes("community_tools")) {
    active.push("community_tools");
  }
  if (entitled.includes("web_research")) {
    active.push("web_research");
  }
  void hasProjectContext;
  return active.filter(
    (value, index, list) =>
      VALID_CAPABILITY_FAMILY.has(value) && list.indexOf(value) === index,
  );
}

export function resolveHarnessProfileFromActiveCapabilities(input: {
  authState?: AuthState;
  activeCapabilityFamilies: readonly CapabilityFamily[];
}): string {
  const authState = normalizeAuthState(input?.authState);
  if (authState === "anonymous") return "anonymous_demo";
  return input.activeCapabilityFamilies.length > 0
    ? "authenticated_cloud_tools"
    : "authenticated_cloud_chat";
}

export function resolveEntitledCapabilityFamiliesForGate(input: {
  authState?: AuthState;
  tier?: string | null;
}): CapabilityFamily[] {
  const effectiveTier = resolveEffectiveTier({
    authState: input?.authState,
    tier: input?.tier,
  });
  if (effectiveTier === "anon_free") return [];
  return [...AUTHENTICATED_PLATFORM_CAPABILITIES];
}

export function resolveActiveCapabilityFamiliesForGate(
  input: Partial<CanonicalGateInput>,
): CapabilityFamily[] {
  const entitled = resolveEntitledCapabilityFamiliesForGate(input);
  return resolveActiveCapabilityFamiliesFromEntitlements({
    entitledCapabilityFamilies: entitled,
    hasCommunityContext: input?.hasCommunityContext,
    hasProjectContext: input?.hasProjectContext,
  });
}

function deny(code: GateCode, cta: GateCta): Omit<CanonicalGateDecision, "effectiveTier"> {
  return {
    allowed: false,
    code,
    cta,
    lane: null,
    fundingSource: null,
  };
}

function allow(
  lane: RuntimeLane,
  fundingSource: Exclude<RequestedFundingSource, "auto">,
): Omit<CanonicalGateDecision, "effectiveTier"> {
  return {
    allowed: true,
    code: "ok",
    cta: "none",
    lane,
    fundingSource,
  };
}

export function evaluateCanonicalGate(
  rawInput: Partial<CanonicalGateInput>,
): CanonicalGateDecision {
  const requestedFundingSource = normalizeRequestedFundingSource(
    rawInput?.requestedFundingSource,
    rawInput?.modelClass,
  );
  const authState = normalizeAuthState(rawInput?.authState);
  const effectiveTier = resolveEffectiveTier({
    authState,
    tier: rawInput?.tier,
  });
  const hasUserKeyConnection = Boolean(rawInput?.hasUserKeyConnection);
  const hasUserChatGptConnection = Boolean(rawInput?.hasUserChatGptConnection);
  const isAnonymous = effectiveTier === "anon_free";

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
      ...deny(
        hasUserChatGptConnection ? "runner_unavailable" : "provider_connection_required",
        hasUserChatGptConnection ? "none" : "connect_provider",
      ),
      effectiveTier,
    };
  }

  if (requestedFundingSource === "platform") {
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

export function resolveCanonicalGatePolicy(
  rawInput: Partial<CanonicalGateInput>,
): CanonicalGatePolicy {
  const decision = evaluateCanonicalGate(rawInput);
  const entitledCapabilityFamilies = resolveEntitledCapabilityFamiliesForGate(rawInput);
  const activeCapabilityFamilies = resolveActiveCapabilityFamiliesFromEntitlements({
    entitledCapabilityFamilies,
    hasCommunityContext: rawInput?.hasCommunityContext,
    hasProjectContext: rawInput?.hasProjectContext,
  });
  const harnessProfile = resolveHarnessProfileFromActiveCapabilities({
    authState: rawInput?.authState,
    activeCapabilityFamilies,
  });
  return {
    decision,
    entitledCapabilityFamilies,
    activeCapabilityFamilies,
    harnessProfile,
  };
}
