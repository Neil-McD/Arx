import { useEffect } from "react";

type UseAuthGateLifecycleEffectsArgs = {
  isAuthGateOpen: boolean;
  isAuthenticated: boolean;
  closeAuthGate: () => void;
  keyTarget?: "window" | "document";
};

export function useAuthGateLifecycleEffects(args: UseAuthGateLifecycleEffectsArgs): void {
  useEffect(() => {
    if (!args.isAuthGateOpen) return;
    const keyHost = args.keyTarget === "document" ? document : window;
    const handleKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === "Escape") args.closeAuthGate();
    };
    keyHost.addEventListener("keydown", handleKeyDown);
    return () => keyHost.removeEventListener("keydown", handleKeyDown);
  }, [args.isAuthGateOpen, args.closeAuthGate, args.keyTarget]);

  useEffect(() => {
    if (!args.isAuthenticated) return;
    if (!args.isAuthGateOpen) return;
    args.closeAuthGate();
  }, [args.isAuthenticated, args.isAuthGateOpen, args.closeAuthGate]);
}
