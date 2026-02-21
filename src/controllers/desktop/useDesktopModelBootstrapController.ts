import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { RuntimeClient } from "../../runtime/arp/client";
import type { DesktopShellClient } from "../../runtime/shell/client";
import { type ModelToggle } from "../../../shared/modelCatalog";
import { resolveCloudInferenceLane } from "../../../shared/inferenceLaneResolver";

type ChatgptAuthSummary = {
  email?: string | null;
  account_id?: string | null;
  access_token_expires_at?: number | null;
};

type ProviderKey = {
  id: string;
  label: string;
  hasKey: boolean;
  inputValue: string;
  error?: string | null;
};

type UseDesktopModelBootstrapControllerArgs = {
  shellClient: DesktopShellClient;
  runtimeClient: RuntimeClient;
  preferredModelId: string;
  freeModelAllowlist: ReadonlySet<string>;
  defaultModelToggles: ModelToggle[];
  modelToggles: ModelToggle[];
  activeModelId: string | null;
  providerKeys: ProviderKey[];
  isModelReady: (modelId: string) => boolean;
  setModelToggles: Dispatch<SetStateAction<ModelToggle[]>>;
  setActiveModelId: Dispatch<SetStateAction<string | null>>;
  setChatgptAuthSummary: Dispatch<SetStateAction<ChatgptAuthSummary | null>>;
};

export function useDesktopModelBootstrapController(args: UseDesktopModelBootstrapControllerArgs) {
  const {
    shellClient,
    runtimeClient,
    preferredModelId,
    freeModelAllowlist,
    defaultModelToggles,
    modelToggles,
    activeModelId,
    providerKeys,
    isModelReady,
    setModelToggles,
    setActiveModelId,
    setChatgptAuthSummary,
  } = args;

  const loadModelToggles = useCallback(async () => {
    try {
      const data = await shellClient.getModelToggles();
      const allowedIds = new Set(defaultModelToggles.map((toggle) => toggle.id));
      const cleaned = (data ?? []).filter((toggle) => allowedIds.has(toggle.id));
      const merged = defaultModelToggles.map((toggle) => ({ ...toggle, enabled: true }));
      const needsPersist =
        cleaned.length !== (data ?? []).length ||
        cleaned.length !== merged.length ||
        cleaned.some((toggle) => toggle.enabled !== true);
      if (needsPersist) {
        await shellClient.setModelToggles(merged).catch(() => null);
      }
      setModelToggles(merged);
    } catch (error) {
      console.error(error);
      setModelToggles(defaultModelToggles);
    }
  }, [defaultModelToggles, setModelToggles, shellClient]);

  const loadActiveModel = useCallback(async () => {
    const modelId = await shellClient.getActiveModel();
    setActiveModelId(modelId);
  }, [setActiveModelId, shellClient]);

  const loadChatgptAuthSummary = useCallback(async () => {
    try {
      const summary = await shellClient.getChatgptAuthSummary();
      setChatgptAuthSummary(summary);
    } catch {
      setChatgptAuthSummary(null);
    }
  }, [setChatgptAuthSummary, shellClient]);

  const syncActiveModel = useCallback(
    async (nextToggles: ModelToggle[]) => {
      const enabled = nextToggles.filter((toggle) => toggle.enabled);
      if (enabled.length === 0) {
        setActiveModelId(null);
        return;
      }
      const enabledReady = enabled.filter((toggle) => isModelReady(toggle.id));
      const activeId = (activeModelId ?? "").trim();
      const isFreeActive =
        Boolean(activeId) &&
        resolveCloudInferenceLane({
          modelId: activeId,
          freeModelAllowlist,
        }) === "public";
      const activeIsEnabled = isFreeActive || enabled.some((toggle) => toggle.id === activeId);
      const activeIsReady = isFreeActive || enabledReady.some((toggle) => toggle.id === activeId);

      const shouldKeepActive =
        Boolean(activeId) &&
        activeIsEnabled &&
        (enabledReady.length === 0 || activeIsReady);

      if (shouldKeepActive) return;

      const preferredReady = enabledReady.find((toggle) => toggle.id === preferredModelId)?.id;
      const preferredEnabled = enabled.find((toggle) => toggle.id === preferredModelId)?.id;
      const fallback = preferredReady ?? enabledReady[0]?.id ?? preferredEnabled ?? enabled[0].id;
      setActiveModelId(fallback);
      await runtimeClient.setActiveModel(fallback);
    },
    [activeModelId, freeModelAllowlist, isModelReady, preferredModelId, runtimeClient, setActiveModelId],
  );

  useEffect(() => {
    void syncActiveModel(modelToggles);
  }, [activeModelId, modelToggles, providerKeys, syncActiveModel]);

  return {
    loadModelToggles,
    loadActiveModel,
    loadChatgptAuthSummary,
  };
}
