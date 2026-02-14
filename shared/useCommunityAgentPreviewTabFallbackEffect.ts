import { useEffect, type Dispatch, type SetStateAction } from "react";

type CommunityAgentPreviewTab = {
  id: string;
};

type UseCommunityAgentPreviewTabFallbackEffectArgs = {
  tabs: readonly CommunityAgentPreviewTab[];
  setPreviewTabId: Dispatch<SetStateAction<string>>;
  resetWhenNoTabs?: boolean;
};

export function useCommunityAgentPreviewTabFallbackEffect(
  args: UseCommunityAgentPreviewTabFallbackEffectArgs,
): void {
  useEffect(() => {
    const first = args.tabs[0]?.id ?? "";
    args.setPreviewTabId((prev) => {
      if (!first && !(args.resetWhenNoTabs ?? true)) return prev;
      if (!prev) return first;
      if (args.tabs.some((tab) => tab.id === prev)) return prev;
      return first;
    });
  }, [args.tabs, args.setPreviewTabId, args.resetWhenNoTabs]);
}
