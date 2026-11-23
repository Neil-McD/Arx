import { useEffect } from "react";

export function useDirectMessageDismissLifecycle(params: {
  isOpen: boolean;
  mobileRoot?: boolean;
  inboxIsPage: boolean;
  onClose: () => void;
}) {
  const { isOpen, mobileRoot, inboxIsPage, onClose } = params;

  useEffect(() => {
    if (!isOpen || mobileRoot) return;

    const handlePointerDown = (event: PointerEvent) => {
      // A page is left by going somewhere else (that page's address closes
      // it), not by a click beside it; closing here would race that click.
      if (inboxIsPage) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      const host = document.querySelector(".web-direct-messages-host");
      if (host?.contains(target)) return;
      if (target instanceof Element && target.closest(".direct-messages-topbar-button, .community-nav-inbox")) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A control disabling itself (for example Next on the last PDF page) can
      // move focus to body. The native modal still owns this Escape's default action.
      if (document.querySelector(".web-direct-messages-host dialog[open]")) return;
      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [inboxIsPage, isOpen, mobileRoot, onClose]);
}
