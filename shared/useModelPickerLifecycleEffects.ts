import { useEffect, type MutableRefObject } from "react";

type UseModelPickerLifecycleEffectsArgs = {
  isModelPickerOpen: boolean;
  modelPickerRef: MutableRefObject<HTMLDivElement | null>;
  modelPickerSearchRef: MutableRefObject<HTMLInputElement | null>;
  closeModelPicker: () => void;
};

export function useModelPickerLifecycleEffects(args: UseModelPickerLifecycleEffectsArgs): void {
  useEffect(() => {
    if (!args.isModelPickerOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const root = args.modelPickerRef.current;
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!root.contains(target)) args.closeModelPicker();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") args.closeModelPicker();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    const raf = window.requestAnimationFrame(() => args.modelPickerSearchRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(raf);
    };
  }, [
    args.isModelPickerOpen,
    args.modelPickerRef,
    args.modelPickerSearchRef,
    args.closeModelPicker,
  ]);
}
