import type { NativeToolAwareMessage } from "./nativeToolProtocol.ts";

export const RUNTIME_INPUT_BUDGET_PLAN_VERSION = 1 as const;
export const RUNTIME_MODEL_CAPACITY_UNKNOWN_CODE =
  "runtime_model_capacity_unknown";
export const RUNTIME_INPUT_BUDGET_INVALID_CODE =
  "runtime_input_budget_invalid";

// Agent turns call OpenAI's Responses API only.
export type RuntimeProviderTransport = "openai_responses";

export type RuntimeModelCapacityProfile = {
  transport: RuntimeProviderTransport;
  modelRef: string;
  contextWindowTokens: number;
  providerEnvelopeTokens: number;
  imageInputTokens: number;
};

export type RuntimeInputBudgetFailureCode =
  | typeof RUNTIME_MODEL_CAPACITY_UNKNOWN_CODE
  | typeof RUNTIME_INPUT_BUDGET_INVALID_CODE
  | "context_window_exceeded";

export type RuntimeInputBudgetPlan = {
  version: typeof RUNTIME_INPUT_BUDGET_PLAN_VERSION;
  transport: RuntimeProviderTransport;
  modelRef: string;
  profileKey: string;
  contextWindowTokens: number | null;
  reservedOutputTokens: number;
  providerEnvelopeTokens: number;
  safetyMarginTokens: number;
  messageTokens: number;
  toolSchemaTokens: number;
  imageTokens: number;
  imageCount: number;
  estimatedInputTokens: number;
  usableInputTokens: number;
  remainingInputTokens: number;
  fits: boolean;
  failureCode: RuntimeInputBudgetFailureCode | null;
};

export type RuntimeInputBudgetEvidence = {
  version: typeof RUNTIME_INPUT_BUDGET_PLAN_VERSION;
  sequence: number;
  kind: "initial" | "delta";
  transport: RuntimeProviderTransport;
  model_ref: string;
  profile_key: string;
  context_window_tokens: number | null;
  reserved_output_tokens: number;
  provider_envelope_tokens: number;
  safety_margin_tokens: number;
  message_tokens: number;
  tool_schema_tokens: number;
  image_tokens: number;
  image_count: number;
  estimated_input_tokens: number;
  usable_input_tokens: number;
  remaining_input_tokens: number;
  fits: boolean;
  failure_code: RuntimeInputBudgetFailureCode | null;
  delta: {
    estimated_input_tokens: number;
    usable_input_tokens: number;
    remaining_input_tokens: number;
  } | null;
};

const ESTIMATED_UTF8_BYTES_PER_TOKEN = 2;
const MINIMUM_SAFETY_MARGIN_TOKENS = 4_096;
const SAFETY_MARGIN_BASIS_POINTS = 500;
const DEFAULT_PROVIDER_ENVELOPE_TOKENS = 4_096;
const DEFAULT_IMAGE_INPUT_TOKENS = 8_192;

function capacityProfile(
  transport: RuntimeProviderTransport,
  modelRef: string,
  contextWindowTokens: number,
): RuntimeModelCapacityProfile {
  return {
    transport,
    modelRef,
    contextWindowTokens,
    providerEnvelopeTokens: DEFAULT_PROVIDER_ENVELOPE_TOKENS,
    imageInputTokens: DEFAULT_IMAGE_INPUT_TOKENS,
  };
}

// Reviewed provider capacities. Product aliases are intentionally absent: the
// runtime admits only the exact transport/model reference that will be sent.
const RUNTIME_MODEL_CAPACITY_PROFILES: readonly RuntimeModelCapacityProfile[] = [
  capacityProfile("openai_responses", "openai/gpt-5.6-sol", 1_050_000),
  capacityProfile("openai_responses", "openai/gpt-5.6-luna", 1_050_000),
  capacityProfile("openai_responses", "openai/gpt-6-luna", 1_050_000),
  capacityProfile("openai_responses", "openai/gpt-5.5", 1_050_000),
];

function normalizeModelRef(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function profileKey(
  transport: RuntimeProviderTransport,
  modelRef: string,
): string {
  return `${transport}:${normalizeModelRef(modelRef)}`;
}

const CAPACITY_PROFILE_BY_KEY = new Map(
  RUNTIME_MODEL_CAPACITY_PROFILES.map((profile) => [
    profileKey(profile.transport, profile.modelRef),
    profile,
  ]),
);

export function listRuntimeModelCapacityProfiles(): RuntimeModelCapacityProfile[] {
  return RUNTIME_MODEL_CAPACITY_PROFILES.map((profile) => ({ ...profile }));
}

export function resolveRuntimeModelCapacityProfile(params: {
  transport: RuntimeProviderTransport;
  modelRef: string;
}): RuntimeModelCapacityProfile | null {
  const profile = CAPACITY_PROFILE_BY_KEY.get(
    profileKey(params.transport, params.modelRef),
  );
  return profile ? { ...profile } : null;
}

export function resolveRuntimeProviderBudgetIdentity(params: {
  inferenceSource: string;
  requestedModelId: string;
  modelRef: string;
}): { transport: RuntimeProviderTransport; modelRef: string } {
  // A model reference without a reviewed OpenAI profile fails closed later as
  // runtime_model_capacity_unknown.
  return {
    transport: "openai_responses",
    modelRef: normalizeModelRef(params.modelRef),
  };
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function estimatedTokensForSerialized(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string") {
    throw new Error("runtime_input_budget_value_not_serializable");
  }
  return Math.ceil(utf8ByteLength(serialized) / ESTIMATED_UTF8_BYTES_PER_TOKEN);
}

function normalizeMessagesForEstimate(
  messages: readonly NativeToolAwareMessage[],
): { messages: unknown[]; imageCount: number } {
  let imageCount = 0;
  const normalized = messages.map((message) => {
    if (message.role !== "user" || !Array.isArray(message.content)) {
      return message;
    }
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== "image") return part;
        imageCount += 1;
        return {
          ...part,
          imageUrl: "[image_input]",
        };
      }),
    };
  });
  return { messages: normalized, imageCount };
}

export function estimateRuntimeMessageInputTokens(
  messages: readonly NativeToolAwareMessage[],
  imageInputTokens = DEFAULT_IMAGE_INPUT_TOKENS,
): {
  messageTokens: number;
  imageTokens: number;
  imageCount: number;
  estimatedTokens: number;
} {
  const normalized = normalizeMessagesForEstimate(messages);
  const messageTokens = estimatedTokensForSerialized(normalized.messages);
  const imageTokens =
    normalized.imageCount * Math.max(0, Math.floor(imageInputTokens));
  return {
    messageTokens,
    imageTokens,
    imageCount: normalized.imageCount,
    estimatedTokens: messageTokens + imageTokens,
  };
}

function invalidPlan(params: {
  transport: RuntimeProviderTransport;
  modelRef: string;
  reservedOutputTokens: number;
  failureCode:
    | typeof RUNTIME_MODEL_CAPACITY_UNKNOWN_CODE
    | typeof RUNTIME_INPUT_BUDGET_INVALID_CODE;
}): RuntimeInputBudgetPlan {
  return {
    version: RUNTIME_INPUT_BUDGET_PLAN_VERSION,
    transport: params.transport,
    modelRef: normalizeModelRef(params.modelRef),
    profileKey: profileKey(params.transport, params.modelRef),
    contextWindowTokens: null,
    reservedOutputTokens: params.reservedOutputTokens,
    providerEnvelopeTokens: 0,
    safetyMarginTokens: 0,
    messageTokens: 0,
    toolSchemaTokens: 0,
    imageTokens: 0,
    imageCount: 0,
    estimatedInputTokens: 0,
    usableInputTokens: 0,
    remainingInputTokens: 0,
    fits: false,
    failureCode: params.failureCode,
  };
}

export function planRuntimeInputBudget(params: {
  transport: RuntimeProviderTransport;
  modelRef: string;
  messages: readonly NativeToolAwareMessage[];
  toolSchemas: readonly unknown[];
  reservedOutputTokens: number;
}): RuntimeInputBudgetPlan {
  const modelRef = normalizeModelRef(params.modelRef);
  const reservedOutputTokens = Math.floor(Number(params.reservedOutputTokens));
  const profile = resolveRuntimeModelCapacityProfile({
    transport: params.transport,
    modelRef,
  });
  if (!profile) {
    return invalidPlan({
      transport: params.transport,
      modelRef,
      reservedOutputTokens,
      failureCode: RUNTIME_MODEL_CAPACITY_UNKNOWN_CODE,
    });
  }
  if (
    !Number.isFinite(reservedOutputTokens) ||
    reservedOutputTokens < 1 ||
    reservedOutputTokens >= profile.contextWindowTokens
  ) {
    return {
      ...invalidPlan({
        transport: params.transport,
        modelRef,
        reservedOutputTokens,
        failureCode: RUNTIME_INPUT_BUDGET_INVALID_CODE,
      }),
      contextWindowTokens: profile.contextWindowTokens,
      providerEnvelopeTokens: profile.providerEnvelopeTokens,
    };
  }

  try {
    const messageEstimate = estimateRuntimeMessageInputTokens(
      params.messages,
      profile.imageInputTokens,
    );
    const messageTokens = messageEstimate.messageTokens;
    const toolSchemaTokens = estimatedTokensForSerialized(params.toolSchemas);
    const imageTokens = messageEstimate.imageTokens;
    const estimatedInputTokens =
      messageTokens + toolSchemaTokens + imageTokens;
    const safetyMarginTokens = Math.max(
      MINIMUM_SAFETY_MARGIN_TOKENS,
      Math.ceil(
        (profile.contextWindowTokens * SAFETY_MARGIN_BASIS_POINTS) / 10_000,
      ),
    );
    const usableInputTokens = Math.max(
      0,
      profile.contextWindowTokens -
        reservedOutputTokens -
        profile.providerEnvelopeTokens -
        safetyMarginTokens,
    );
    const remainingInputTokens = usableInputTokens - estimatedInputTokens;
    const fits = remainingInputTokens >= 0;
    return {
      version: RUNTIME_INPUT_BUDGET_PLAN_VERSION,
      transport: params.transport,
      modelRef,
      profileKey: profileKey(params.transport, modelRef),
      contextWindowTokens: profile.contextWindowTokens,
      reservedOutputTokens,
      providerEnvelopeTokens: profile.providerEnvelopeTokens,
      safetyMarginTokens,
      messageTokens,
      toolSchemaTokens,
      imageTokens,
      imageCount: messageEstimate.imageCount,
      estimatedInputTokens,
      usableInputTokens,
      remainingInputTokens,
      fits,
      failureCode: fits ? null : "context_window_exceeded",
    };
  } catch {
    return {
      ...invalidPlan({
        transport: params.transport,
        modelRef,
        reservedOutputTokens,
        failureCode: RUNTIME_INPUT_BUDGET_INVALID_CODE,
      }),
      contextWindowTokens: profile.contextWindowTokens,
      providerEnvelopeTokens: profile.providerEnvelopeTokens,
    };
  }
}

export function buildRuntimeInputBudgetEvidence(params: {
  sequence: number;
  kind: "initial" | "delta";
  plan: RuntimeInputBudgetPlan;
  delta: {
    estimatedInputTokens: number;
    usableInputTokens: number;
    remainingInputTokens: number;
  } | null;
}): RuntimeInputBudgetEvidence {
  return {
    version: params.plan.version,
    sequence: Math.max(1, Math.floor(params.sequence)),
    kind: params.kind,
    transport: params.plan.transport,
    model_ref: params.plan.modelRef,
    profile_key: params.plan.profileKey,
    context_window_tokens: params.plan.contextWindowTokens,
    reserved_output_tokens: params.plan.reservedOutputTokens,
    provider_envelope_tokens: params.plan.providerEnvelopeTokens,
    safety_margin_tokens: params.plan.safetyMarginTokens,
    message_tokens: params.plan.messageTokens,
    tool_schema_tokens: params.plan.toolSchemaTokens,
    image_tokens: params.plan.imageTokens,
    image_count: params.plan.imageCount,
    estimated_input_tokens: params.plan.estimatedInputTokens,
    usable_input_tokens: params.plan.usableInputTokens,
    remaining_input_tokens: params.plan.remainingInputTokens,
    fits: params.plan.fits,
    failure_code: params.plan.failureCode,
    delta: params.delta
      ? {
          estimated_input_tokens: params.delta.estimatedInputTokens,
          usable_input_tokens: params.delta.usableInputTokens,
          remaining_input_tokens: params.delta.remainingInputTokens,
        }
      : null,
  };
}
