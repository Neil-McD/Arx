import { useEffect, type MutableRefObject } from "react";

type UseCommunityAgentTemplateMenuLifecycleArgs = {
  isOpen: boolean;
  menuRef: MutableRefObject<HTMLDivElement | null>;
  closeMenu: () => void;
  closeOnEscape?: boolean;
  pointerTarget?: "document" | "window";
};

export function useCommunityAgentTemplateMenuLifecycle(
  args: UseCommunityAgentTemplateMenuLifecycleArgs,
): void {
  useEffect(() => {
    if (!args.isOpen) return;

    const pointerHost = args.pointerTarget === "window" ? window : document;
    const keyHost = args.pointerTarget === "window" ? window : document;

    const handlePointerDown = (event: MouseEvent) => {
      const root = args.menuRef.current;
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!root.contains(target)) args.closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") args.closeMenu();
    };

    pointerHost.addEventListener("mousedown", handlePointerDown);
    if (args.closeOnEscape ?? true) {
      keyHost.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      pointerHost.removeEventListener("mousedown", handlePointerDown);
      if (args.closeOnEscape ?? true) {
        keyHost.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [args.isOpen, args.menuRef, args.closeMenu, args.closeOnEscape, args.pointerTarget]);
}
