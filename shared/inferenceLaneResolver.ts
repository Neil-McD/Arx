import { DEFAULT_GUEST_MODEL_ID, FREE_MODEL_ALLOWLIST, isFreeModelId } from "./modelCatalog";

export type CloudInferenceLane = "chatgpt" | "public" | "platform";

function isChatgptEligibleModelAlias(modelId: string | null | undefined): boolean {
  const cleaned = String(modelId ?? "").trim().toLowerCase();
  return cleaned.startsWith("gpt-") && !cleaned.startsWith("gpt-oss-");
}

export function resolveCloudInferenceLane(params: {
  modelId: string | null | undefined;
  freeModelAllowlist?: ReadonlySet<string>;
  surface?: "web" | "desktop";
  hasChatgptAuth?: boolean;
}): CloudInferenceLane {
  const allowlist = params.freeModelAllowlist ?? FREE_MODEL_ALLOWLIST;
  const surface = params.surface ?? "web";
  const hasChatgptAuth = Boolean(params.hasChatgptAuth);
  if (surface === "desktop" && hasChatgptAuth && isChatgptEligibleModelAlias(params.modelId)) {
    return "chatgpt";
  }
  return isFreeModelId(params.modelId, allowlist) ? "public" : "platform";
}

export type DesktopCloudInferenceExecutionPlan = {
  primaryLane: CloudInferenceLane;
  laneOrder: CloudInferenceLane[];
  publicFallbackModelId: string;
};

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

export function resolveDesktopCloudInferenceExecutionPlan(params: {
  modelId: string | null | undefined;
  freeModelAllowlist?: ReadonlySet<string>;
  hasChatgptAuth?: boolean;
  defaultGuestModelId?: string | null | undefined;
}): DesktopCloudInferenceExecutionPlan {
  const allowlist = params.freeModelAllowlist ?? FREE_MODEL_ALLOWLIST;
  const primaryLane = resolveCloudInferenceLane({
    modelId: params.modelId,
    freeModelAllowlist: allowlist,
    surface: "desktop",
    hasChatgptAuth: params.hasChatgptAuth,
  });

  const laneOrder = (() => {
    if (primaryLane === "public") return ["public"] as CloudInferenceLane[];
    if (primaryLane === "chatgpt") return ["chatgpt", "platform", "public"] as CloudInferenceLane[];
    return ["platform", "public"] as CloudInferenceLane[];
  })();

  return {
    primaryLane,
    laneOrder,
    publicFallbackModelId: resolvePublicFallbackModelId({
      requestedModelId: params.modelId,
      freeModelAllowlist: allowlist,
      defaultGuestModelId: params.defaultGuestModelId,
    }),
  };
}

export type CloudModelSelectionResolution = {
  requestedModelId: string;
  modelId: string;
  lane: CloudInferenceLane;
  usedFallback: boolean;
};

export function resolveCloudModelSelection(params: {
  requestedModelId: string | null | undefined;
  enabledModelIds: ReadonlyArray<string>;
  defaultAuthedModelId: string;
  defaultGuestModelId: string;
  hasPaidAccess: boolean;
  freeModelAllowlist?: ReadonlySet<string>;
  surface?: "web" | "desktop";
  hasChatgptAuth?: boolean;
}): CloudModelSelectionResolution {
  const allowlist = params.freeModelAllowlist ?? FREE_MODEL_ALLOWLIST;
  const requestedModelId = String(params.requestedModelId ?? "").trim();
  const defaultAuthedModelId = String(params.defaultAuthedModelId ?? "").trim();
  const defaultGuestModelId = String(params.defaultGuestModelId ?? "").trim();

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

  const candidateLane = resolveCloudInferenceLane({
    modelId: candidateModelId,
    freeModelAllowlist: allowlist,
    surface: params.surface,
    hasChatgptAuth: params.hasChatgptAuth,
  });

  const modelId =
    !params.hasPaidAccess && candidateLane === "platform"
      ? defaultGuestModelId
      : candidateModelId;
  const lane = resolveCloudInferenceLane({
    modelId,
    freeModelAllowlist: allowlist,
    surface: params.surface,
    hasChatgptAuth: params.hasChatgptAuth,
  });

  return {
    requestedModelId,
    modelId,
    lane,
    usedFallback: modelId !== requestedModelId,
  };
}
