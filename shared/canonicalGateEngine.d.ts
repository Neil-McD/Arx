export type CanonicalTier = "free" | "builder";
export type EffectiveTier = "anon_free" | "auth_free" | "builder";
export type AuthState = "anonymous" | "authenticated";
export type Surface = "web" | "mobile";
export type ExecutionMode = "cloud";
export type ModelClass = "free_model" | "paid_model";
export type RequestedFundingSource = "demo_public" | "user_key" | "user_chatgpt" | "platform" | "auto";
export type TurnClass = "chat_only" | "requires_tools";
export type RuntimeLane = "public" | "platform" | "chatgpt" | "daytona_cloud";
export type GateCode = "ok" | "auth_required" | "tier_required" | "provider_connection_required" | "runner_unavailable";
export type GateCta = "none" | "sign_in" | "upgrade" | "connect_provider";

export type CanonicalGateInput = {
  surface: Surface;
  executionMode: ExecutionMode;
  modelClass?: ModelClass;
  requestedFundingSource?: RequestedFundingSource | null;
  turnClass: TurnClass;
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

export declare function evaluateCanonicalGate(input: Partial<CanonicalGateInput>): CanonicalGateDecision;
export declare function normalizeTierForGate(rawTier: unknown): CanonicalTier;
export declare function resolveEffectiveTierForGate(input: {
  authState: AuthState;
  tier?: string | null;
}): EffectiveTier;
export declare function hasPaidAccessForGate(input: {
  authState: AuthState;
  tier?: string | null;
}): boolean;
