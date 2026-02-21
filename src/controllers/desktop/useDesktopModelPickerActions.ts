import { useCallback, useMemo } from "react";
import { inferModelSection, isFreeModelId, type ModelSectionId, type ModelToggle, type PremiumModelCatalogEntry } from "../../../shared/modelCatalog";

type ProviderId = "openai" | "anthropic" | "google" | "x-ai" | "openrouter";

export type DesktopCuratedPickerModel = {
  id: string;
  label: string;
  section: ModelSectionId;
  access: "free" | "paid";
  description?: string | null;
};

type UseDesktopModelPickerActionsArgs = {
  modelToggles: ModelToggle[];
  activeModelId: string | null;
  isModelReady: (modelId: string) => boolean;
  providerIdForModelId: (modelId: string) => ProviderId | null;
  freeModelAllowlist: ReadonlySet<string>;
  freeModelLabels: Record<string, string>;
  premiumModelCatalog: PremiumModelCatalogEntry[];
  hasPaidAccess: boolean;
  hasSupabaseSession: boolean;
  hasChatgptAuth: boolean;
  handleSignIn: () => Promise<void> | void;
  openBuilderUpgrade: () => void;
  openModelSettings: () => void;
  setMemoryToast: (message: string) => void;
  onApplyModelSelection: (modelId: string) => Promise<void>;
};

export function useDesktopModelPickerActions(args: UseDesktopModelPickerActionsArgs) {
  const {
    modelToggles,
    activeModelId,
    isModelReady,
    providerIdForModelId,
    freeModelAllowlist,
    freeModelLabels,
    premiumModelCatalog,
    hasPaidAccess,
    hasSupabaseSession,
    hasChatgptAuth,
    handleSignIn,
    openBuilderUpgrade,
    openModelSettings,
    setMemoryToast,
    onApplyModelSelection,
  } = args;

  const enabledModels = useMemo(
    () => modelToggles.filter((toggle) => toggle.enabled),
    [modelToggles],
  );

  const selectedModelLabel = useMemo(() => {
    const id = (activeModelId ?? "").trim();
    if (!id) return "Model";
    if (isFreeModelId(id, freeModelAllowlist)) {
      const freeLabel = (freeModelLabels[id] ?? "").trim();
      if (freeLabel) return freeLabel;
    }
    return modelToggles.find((toggle) => toggle.id === id)?.label ?? id;
  }, [activeModelId, freeModelAllowlist, freeModelLabels, modelToggles]);

  const inferPickerSection = useCallback((modelId: string): ModelSectionId => {
    const provider = providerIdForModelId(modelId);
    return inferModelSection(modelId, provider);
  }, [providerIdForModelId]);

  const curatedPickerModels = useMemo(() => {
    const byId = new Map<string, DesktopCuratedPickerModel>();
    for (const [id, label] of Object.entries(freeModelLabels)) {
      byId.set(id, { id, label, section: "free", access: "free", description: "OpenRouter free tier" });
    }
    for (const toggle of enabledModels) {
      const isFreeModel = isFreeModelId(toggle.id, freeModelAllowlist);
      byId.set(toggle.id, {
        id: toggle.id,
        label: toggle.label,
        section: isFreeModel ? "free" : inferPickerSection(toggle.id),
        access: isFreeModel ? "free" : "paid",
      });
    }
    for (const model of premiumModelCatalog) {
      if (byId.has(model.id)) continue;
      byId.set(model.id, { ...model, access: "paid" });
    }
    return Array.from(byId.values());
  }, [enabledModels, freeModelAllowlist, freeModelLabels, inferPickerSection, premiumModelCatalog]);

  const canSelectPickerModel = useCallback((model: DesktopCuratedPickerModel): boolean => {
    if (model.access === "free") return true;
    const isEnabled = modelToggles.some((toggle) => toggle.id === model.id);
    if (!isEnabled) return false;
    return isModelReady(model.id);
  }, [isModelReady, modelToggles]);

  const handleSelectPickerModel = useCallback(async (model: DesktopCuratedPickerModel, closeModelPicker: () => void) => {
    const isEnabled = model.access === "free" || modelToggles.some((toggle) => toggle.id === model.id);
    const providerId = providerIdForModelId(model.id);
    const ready = isEnabled && (model.access === "free" || isModelReady(model.id));
    if (!ready) {
      if (!isEnabled) {
        setMemoryToast("This model is coming soon.");
        return;
      }
      if (model.access === "paid" && !hasPaidAccess) {
        closeModelPicker();
        if (!hasSupabaseSession) {
          await handleSignIn();
          return;
        }
        openBuilderUpgrade();
        return;
      }
      if (providerId === "openai" && !hasChatgptAuth) {
        openModelSettings();
        setMemoryToast("Sign in with ChatGPT to use OpenAI on free tier, or upgrade for Arx AI.");
        closeModelPicker();
        return;
      }
      setMemoryToast("This model is unavailable right now.");
      return;
    }

    await onApplyModelSelection(model.id);
    closeModelPicker();
  }, [
    handleSignIn,
    hasChatgptAuth,
    hasPaidAccess,
    hasSupabaseSession,
    isModelReady,
    modelToggles,
    onApplyModelSelection,
    openBuilderUpgrade,
    openModelSettings,
    providerIdForModelId,
    setMemoryToast,
  ]);

  return {
    selectedModelLabel,
    curatedPickerModels,
    canSelectPickerModel,
    handleSelectPickerModel,
  };
}
