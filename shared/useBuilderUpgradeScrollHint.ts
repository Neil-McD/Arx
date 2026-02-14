import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

type UseBuilderUpgradeScrollHintArgs = {
  isOpen: boolean;
  refreshToken?: string | number | null;
  threshold?: number;
};

export function useBuilderUpgradeScrollHint(
  args: UseBuilderUpgradeScrollHintArgs,
): {
  builderUpgradeModalBodyRef: MutableRefObject<HTMLDivElement | null>;
  showBuilderUpgradeScrollHint: boolean;
  updateBuilderUpgradeScrollHint: () => void;
} {
  const { isOpen, refreshToken = null, threshold = 8 } = args;
  const builderUpgradeModalBodyRef = useRef<HTMLDivElement | null>(null);
  const [showBuilderUpgradeScrollHint, setShowBuilderUpgradeScrollHint] = useState(false);

  const updateBuilderUpgradeScrollHint = useCallback(() => {
    const el = builderUpgradeModalBodyRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight > threshold;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    setShowBuilderUpgradeScrollHint(scrollable && !atBottom);
  }, [threshold]);

  useEffect(() => {
    if (!isOpen) {
      setShowBuilderUpgradeScrollHint(false);
      return;
    }
    updateBuilderUpgradeScrollHint();
    const handleResize = () => updateBuilderUpgradeScrollHint();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen, updateBuilderUpgradeScrollHint]);

  useEffect(() => {
    if (!isOpen) return;
    updateBuilderUpgradeScrollHint();
  }, [isOpen, refreshToken, updateBuilderUpgradeScrollHint]);

  return {
    builderUpgradeModalBodyRef,
    showBuilderUpgradeScrollHint,
    updateBuilderUpgradeScrollHint,
  };
}
