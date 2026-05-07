import {
  DEFAULT_GUEST_MODEL_ID,
  FREE_MODEL_ALLOWLIST,
  isFreeModelId,
  supportsModelFundingSource,
} from "./modelCatalog";

export type CloudInferenceLane = "chatgpt" | "public" | "user_key";

export function resolveCloudInferenceLane(params: {
  modelId: string | null | undefined;
  freeModelAllowlist?: ReadonlySet<string>;
  surface?: "web";
  hasChatgptAuth?: boolean;
  hasUserKeyConnection?: boolean;
}): CloudInferenceLane {
  const allowlist = params.freeModelAllowlist ?? FREE_MODEL_ALLOWLIST;
  const hasChatgptAuth = Boolean(params.hasChatgptAuth);
  const hasUserKeyConnection = Boolean(params.hasUserKeyConnection);
  const isFree = isFreeModelId(params.modelId, allowlist);
  if (isFree) return "public";
  if (hasChatgptAuth && supportsModelFundingSource(params.modelId, "user_chatgpt")) {
    return "chatgpt";
  }
  if (hasUserKeyConnection && supportsModelFundingSource(params.modelId, "user_key")) {
    return "user_key";
  }
  if (supportsModelFundingSource(params.modelId, "user_chatgpt")) {
    return "chatgpt";
  }
  if (supportsModelFundingSource(params.modelId, "user_key")) {
    return "user_key";
  }
  return "public";
}

function resolvePublicFallbackModelId(params: {
  requestedModelId: string | null | undefined;
  freeModelAllowlist: ReadonlySet<string>;
  defaultGuestModelId?: string | null | undefined;
}): string {
  const requestedModelId = String(params.requestedModelId ?? "").trim();
  if (isFreeModelId(requestedModelId, params.freeModelAllowlist)) return requestedModelId;

  const defaultGuestModelId = String(
    params.defaultGuestModelId ?? DEFAULT_GUEST_MODEL_ID,
  ).trim();
  if (
    defaultGuestModelId &&
    params.freeModelAllowlist.has(defaultGuestModelId.toLowerCase())
  ) {
    return defaultGuestModelId;
  }

  const firstAllowlisted = params.freeModelAllowlist.values().next().value;
  if (typeof firstAllowlisted === "string" && firstAllowlisted.trim()) {
    return firstAllowlisted.trim();
  }

  return DEFAULT_GUEST_MODEL_ID;
}

export type CloudModelSelectionResolution = {
  requestedModelId: string;
  modelId: string;
  lane: CloudInferenceLane;
  fundingSource: "demo_public" | "user_key" | "user_chatgpt";
  usedFallback: boolean;
};

export function resolveCloudModelSelection(params: {
  requestedModelId: string | null | undefined;
  enabledModelIds: ReadonlyArray<string>;
  defaultAuthedModelId: string;
  defaultGuestModelId: string;
  hasUserKeyConnection?: boolean;
  freeModelAllowlist?: ReadonlySet<string>;
  surface?: "web";
  hasChatgptAuth?: boolean;
}): CloudModelSelectionResolution {
  const allowlist = params.freeModelAllowlist ?? FREE_MODEL_ALLOWLIST;
  const requestedModelId = String(params.requestedModelId ?? "").trim();
  const defaultAuthedModelId = String(params.defaultAuthedModelId ?? "").trim();
  const defaultGuestModelId = String(params.defaultGuestModelId ?? "").trim();
  const hasUserKeyConnection = Boolean(params.hasUserKeyConnection);
  const hasChatgptAuth = Boolean(params.hasChatgptAuth);

  const enabledModelIds = params.enabledModelIds
    .map((id) => String(id ?? "").trim())
    .filter((id) => id.length > 0);
  const enabledSet = new Set(enabledModelIds);

  const authedFallbackModelId =
    (defaultAuthedModelId && enabledSet.has(defaultAuthedModelId) ? defaultAuthedModelId : "") ||
    enabledModelIds[0] ||
    defaultGuestModelId;

  const requestedAllowed =
    requestedModelId.length > 0 &&
    (enabledSet.has(requestedModelId) || isFreeModelId(requestedModelId, allowlist));
  const candidateModelId = requestedAllowed ? requestedModelId : authedFallbackModelId;

  const modelId = candidateModelId;
  const lane = resolveCloudInferenceLane({
    modelId,
    freeModelAllowlist: allowlist,
    surface: params.surface,
    hasChatgptAuth,
    hasUserKeyConnection,
  });
  const fundingSource =
    lane === "public"
      ? ("demo_public" as const)
      : lane === "chatgpt"
        ? ("user_chatgpt" as const)
        : ("user_key" as const);

  return {
    requestedModelId,
    modelId,
    lane,
    fundingSource,
    usedFallback: modelId !== requestedModelId,
  };
}
