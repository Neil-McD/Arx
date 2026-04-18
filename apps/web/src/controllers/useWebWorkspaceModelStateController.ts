import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import {
  DEFAULT_ACTIVE_MODEL_ID,
  DEFAULT_GUEST_MODEL_ID,
  FREE_MODEL_ALLOWLIST,
  FREE_MODEL_LABELS,
  getFreeModelEntries,
  getSupportedFundingSourcesForModel,
  inferModelSection,
  isFreeModelId,
  type ModelFundingSource,
  type ModelSectionId,
  type ModelToggle,
} from "../../../../shared/modelCatalog";

export type WorkspacePickerModel = {
  id: string;
  label: string;
  section: ModelSectionId;
  supportedFundingSources: readonly ModelFundingSource[];
  description?: string | null;
};

type GuestThreadStorageLike = {
  model_id: string;
} & Record<string, unknown>;

type UseWebWorkspaceModelStateControllerParams<SessionT> = {
  session: SessionT | null;
  activeThreadId: string | null;
  activeThreadModelId: string | null | undefined;
  activeModelId: string | null;
  setActiveModelId: Dispatch<SetStateAction<string | null>>;
  guestModelId: string;
  setGuestModelId: Dispatch<SetStateAction<string>>;
  modelToggles: ModelToggle[];
  modelProviderById: Record<string, string>;
  hasPaidAccess: boolean;
  hasUserKeyConnection: boolean;
  hasUserChatgptConnection: boolean;
  updateThreadModel: (threadId: string, modelId: string, session: SessionT) => Promise<void>;
  showAppToastMessage: (message: string) => void;
  requireSignIn: (opts?: { reason?: string; payload?: Record<string, unknown> }) => void;
  openModelProviderSettings: (message: string) => void;
  connectChatgpt: () => void | Promise<void>;
  loadGuestThreadStorage: () => GuestThreadStorageLike;
  storeGuestThreadStorage: (storage: GuestThreadStorageLike) => void;
};

export function useWebWorkspaceModelStateController<SessionT>(
  params: UseWebWorkspaceModelStateControllerParams<SessionT>,
) {
  const [modelPickerOpenRequestKey, setModelPickerOpenRequestKey] = useState(0);

  const enabledModels = useMemo(
    () => params.modelToggles.filter((toggle) => toggle.enabled),
    [params.modelToggles],
  );

  const guestModelLabel = useMemo(() => {
    const label = (FREE_MODEL_LABELS[params.guestModelId] ?? "").trim();
    return label || params.guestModelId || "Model";
  }, [params.guestModelId]);

  const selectedModelId = useMemo(() => {
    const isGuestModel = (modelId: string): boolean => isFreeModelId(modelId, FREE_MODEL_ALLOWLIST);
    const isEnabledAuthedModel = (modelId: string): boolean =>
      params.modelToggles.some((toggle) => toggle.id === modelId);
    const isKnownModel = (modelId: string): boolean => isGuestModel(modelId) || isEnabledAuthedModel(modelId);
    const canUseAuthedModel = (modelId: string): boolean => {
      if (isGuestModel(modelId)) return true;
      if (params.hasPaidAccess) return true;
      const supportedFundingSources = getSupportedFundingSourcesForModel(modelId);
      return (
        (params.hasUserKeyConnection && supportedFundingSources.includes("user_key")) ||
        (params.hasUserChatgptConnection && supportedFundingSources.includes("user_chatgpt"))
      );
    };

    const threadModel = (params.activeThreadModelId ?? "").trim();
    if (
      threadModel &&
      isKnownModel(threadModel) &&
      (!params.session || canUseAuthedModel(threadModel))
    ) {
      return threadModel;
    }

    const stored = (params.activeModelId ?? "").trim();
    if (
      stored &&
      isKnownModel(stored) &&
      (!params.session || canUseAuthedModel(stored))
    ) {
      return stored;
    }

    const fallbackModelId =
      enabledModels.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id ??
      enabledModels[0]?.id ??
      params.modelToggles[0]?.id ??
      "";
    if (
      !params.session ||
      params.hasPaidAccess ||
      params.hasUserKeyConnection ||
      params.hasUserChatgptConnection
    ) {
      return fallbackModelId;
    }
    return isGuestModel(fallbackModelId) ? fallbackModelId : DEFAULT_GUEST_MODEL_ID;
  }, [
    enabledModels,
    params.activeModelId,
    params.activeThreadModelId,
    params.session,
    params.hasPaidAccess,
    params.hasUserChatgptConnection,
    params.hasUserKeyConnection,
    params.modelToggles,
  ]);

  const selectedModelLabel = useMemo(() => {
    if (!selectedModelId) return "Model";
    if (isFreeModelId(selectedModelId, FREE_MODEL_ALLOWLIST)) {
      return FREE_MODEL_LABELS[selectedModelId] ?? selectedModelId;
    }
    return enabledModels.find((toggle) => toggle.id === selectedModelId)?.label ?? selectedModelId;
  }, [enabledModels, selectedModelId]);

  const activeModelLabel = params.session ? selectedModelLabel : guestModelLabel;

  const inferProviderSection = useCallback(
    (modelId: string): ModelSectionId => {
      const id = (modelId ?? "").trim().toLowerCase();
      const mappedProvider = String(params.modelProviderById[id] ?? "").trim().toLowerCase();
      return inferModelSection(modelId, mappedProvider || null);
    },
    [params.modelProviderById],
  );

  const selectedPickerModelId = params.session ? selectedModelId : params.guestModelId;

  const curatedPickerModels = useMemo(() => {
    const byId = new Map<string, WorkspacePickerModel>();
    for (const model of getFreeModelEntries()) {
      byId.set(model.id, {
        id: model.id,
        label: model.label,
        section: "free",
        supportedFundingSources: model.supportedFundingSources,
        description: model.description,
      });
    }
    for (const toggle of enabledModels) {
      byId.set(toggle.id, {
        id: toggle.id,
        label: toggle.label,
        section: inferProviderSection(toggle.id),
        supportedFundingSources: getSupportedFundingSourcesForModel(toggle.id),
      });
    }
    return Array.from(byId.values());
  }, [enabledModels, inferProviderSection]);

  const canSelectPickerModel = useCallback(
    (model: WorkspacePickerModel): boolean => {
      const supportsDemo = model.supportedFundingSources.includes("demo_public");
      const supportsUserKey = model.supportedFundingSources.includes("user_key");
      const supportsUserChatgpt = model.supportedFundingSources.includes("user_chatgpt");
      if (!params.session) return supportsDemo;
      if (supportsDemo) return true;
      const isEnabled = params.modelToggles.some((toggle) => toggle.id === model.id);
      if (!isEnabled) return false;
      return (
        (params.hasUserKeyConnection && supportsUserKey) ||
        (params.hasUserChatgptConnection && supportsUserChatgpt)
      );
    },
    [
      params.session,
      params.hasUserChatgptConnection,
      params.hasUserKeyConnection,
      params.modelToggles,
    ],
  );

  const selectPickerModel = useCallback(
    (model: WorkspacePickerModel): void => {
      const isModelEnabled = params.modelToggles.some((toggle) => toggle.id === model.id);
      const supportsDemo = model.supportedFundingSources.includes("demo_public");
      const supportsUserKey = model.supportedFundingSources.includes("user_key");
      const supportsUserChatgpt = model.supportedFundingSources.includes("user_chatgpt");

      if (!canSelectPickerModel(model)) {
        if (params.session && !supportsDemo && !isModelEnabled) {
          params.showAppToastMessage("This model isn't enabled yet.");
          return;
        }
        if (
          params.session &&
          !supportsDemo &&
          !(params.hasUserKeyConnection && supportsUserKey) &&
          !(params.hasUserChatgptConnection && supportsUserChatgpt) &&
          (supportsUserKey || supportsUserChatgpt)
        ) {
          if (supportsUserChatgpt && !supportsUserKey) {
            void params.connectChatgpt();
            return;
          }
          params.openModelProviderSettings(
            supportsUserChatgpt && !supportsUserKey
              ? "Connect ChatGPT in Settings to use this model."
              : supportsUserKey && !supportsUserChatgpt
                ? "Connect OpenRouter in Settings to use this model."
                : "Connect a provider in Settings to use this model.",
          );
          return;
        }
        if (!params.session && !supportsDemo) {
          params.requireSignIn({ reason: "select_model", payload: { model_id: model.id } });
          return;
        }
        if (params.session && supportsDemo) {
          params.setActiveModelId(model.id);
          if (params.activeThreadId) {
            void params.updateThreadModel(params.activeThreadId, model.id, params.session);
          }
          return;
        }
        params.showAppToastMessage("This model is not available yet.");
        return;
      }

      if (!params.session) {
        params.setGuestModelId(model.id);
        try {
          const storage = params.loadGuestThreadStorage();
          params.storeGuestThreadStorage({ ...storage, model_id: model.id });
        } catch {
          // ignore
        }
        return;
      }

      const session = params.session;
      params.setActiveModelId(model.id);
      if (params.activeThreadId && session) {
        void params.updateThreadModel(params.activeThreadId, model.id, session);
      }
    },
    [canSelectPickerModel, params],
  );

  const requestModelPickerOpen = useCallback(() => {
    setModelPickerOpenRequestKey((value) => value + 1);
  }, []);

  return {
    state: {
      guestModelId: params.guestModelId,
      modelPickerOpenRequestKey,
    },
    derived: {
      activeModelLabel,
      curatedPickerModels,
      selectedModelId,
      selectedPickerModelId,
      selectedModelLabel,
      guestModelLabel,
      enabledModels,
      modelToggles: params.modelToggles,
      hasUserKeyConnection: params.hasUserKeyConnection,
      hasUserChatgptConnection: params.hasUserChatgptConnection,
      canSelectPickerModel,
    },
    actions: {
      selectPickerModel,
      requestModelPickerOpen,
      setGuestModelId: params.setGuestModelId,
    },
  };
}
