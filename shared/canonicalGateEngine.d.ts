export type CanonicalTier = "free" | "builder" | "architect";
export type EffectiveTier = "anon_free" | "auth_free" | "builder" | "architect";
export type AuthState = "anonymous" | "authenticated";
export type Surface = "web" | "desktop" | "mobile";
export type ExecutionMode = "cloud" | "local";
export type ModelClass = "free_model" | "paid_model";
export type TurnClass = "chat_only" | "requires_tools";
export type RuntimeLane = "public" | "platform" | "chatgpt_desktop" | "daytona_cloud" | "local_runtime";
export type GateCode = "ok" | "auth_required" | "tier_required";
export type GateCta = "none" | "sign_in" | "upgrade";

export type CanonicalGateInput = {
  surface: Surface;
  executionMode: ExecutionMode;
  modelClass: ModelClass;
  turnClass: TurnClass;
  authState: AuthState;
  tier?: string | null;
  hasDesktopChatGptAuth?: boolean;
};

export type CanonicalGateDecision = {
  allowed: boolean;
  code: GateCode;
  cta: GateCta;
  lane: RuntimeLane | null;
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

