import { useEffect, type Dispatch, type SetStateAction } from "react";

type UseCommunityAgentRenamingResetEffectArgs = {
  isTemplateMenuOpen: boolean;
  setCommunityAgentRenamingSlot: Dispatch<SetStateAction<number | null>>;
  setCommunityAgentRenamingValue: Dispatch<SetStateAction<string>>;
};

export function useCommunityAgentRenamingResetEffect(
  args: UseCommunityAgentRenamingResetEffectArgs,
): void {
  useEffect(() => {
    if (args.isTemplateMenuOpen) return;
    args.setCommunityAgentRenamingSlot(null);
    args.setCommunityAgentRenamingValue("");
  }, [args.isTemplateMenuOpen, args.setCommunityAgentRenamingSlot, args.setCommunityAgentRenamingValue]);
}
