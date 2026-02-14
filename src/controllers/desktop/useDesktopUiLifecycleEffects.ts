import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useModelPickerLifecycleEffects } from "../../../shared/useModelPickerLifecycleEffects";
import { useCommunityAgentTemplateMenuLifecycle } from "../../../shared/useCommunityAgentTemplateMenuLifecycle";
import { useCommunityAgentPreviewTabFallbackEffect } from "../../../shared/useCommunityAgentPreviewTabFallbackEffect";

type LandingLike = {
  tabs: Array<{ id: string }>;
};

export function useDesktopUiLifecycleEffects(params: {
  isModelPickerOpen: boolean;
  modelPickerRef: MutableRefObject<HTMLDivElement | null>;
  modelPickerSearchRef: MutableRefObject<HTMLInputElement | null>;
  closeModelPicker: () => void;
  activeThreadId: string | null;
  emptyThreadLanding: LandingLike;
  setEmptyThreadSection: Dispatch<SetStateAction<string>>;
  communityAgentDraftLanding: LandingLike;
  setCommunityAgentPreviewTabId: Dispatch<SetStateAction<string>>;
  isCommunityAgentTemplateMenuOpen: boolean;
  communityAgentTemplatePickerRef: MutableRefObject<HTMLDivElement | null>;
  setIsCommunityAgentTemplateMenuOpen: Dispatch<SetStateAction<boolean>>;
}) {
  useModelPickerLifecycleEffects({
    isModelPickerOpen: params.isModelPickerOpen,
    modelPickerRef: params.modelPickerRef,
    modelPickerSearchRef: params.modelPickerSearchRef,
    closeModelPicker: params.closeModelPicker,
  });

  useEffect(() => {
    if (params.activeThreadId) return;
    const first = params.emptyThreadLanding.tabs[0]?.id ?? "community";
    params.setEmptyThreadSection(first);
  }, [params.activeThreadId, params.emptyThreadLanding, params.setEmptyThreadSection]);

  useCommunityAgentPreviewTabFallbackEffect({
    tabs: params.communityAgentDraftLanding.tabs,
    setPreviewTabId: params.setCommunityAgentPreviewTabId,
    resetWhenNoTabs: true,
  });

  useCommunityAgentTemplateMenuLifecycle({
    isOpen: params.isCommunityAgentTemplateMenuOpen,
    menuRef: params.communityAgentTemplatePickerRef,
    closeMenu: () => params.setIsCommunityAgentTemplateMenuOpen(false),
    closeOnEscape: false,
    pointerTarget: "window",
  });
}
