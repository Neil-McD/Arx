import { useEffect, useRef, useState } from "react";

// A small card that opens when someone rests the pointer on (or tabs to) a
// trigger, and closes when they move away: the profile card on names and
// avatars, and the card on a chip (shared/entityChipsUi.tsx). Opening waits a
// moment so sweeping past doesn't fire it; it opens above unless there isn't
// room inside the scrolling area, then below.

export const HOVER_OPEN_MS = 450;
export const HOVER_CLOSE_MS = 140;

export function useHoverIntent<A extends HTMLElement = HTMLSpanElement>(options: {
  enabled: boolean;
  // The scrolling area the card must fit inside; the window when none matches.
  viewportSelector?: string;
  maxCardHeight?: number;
}) {
  const anchorRef = useRef<A | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const openTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"top" | "bottom">("top");
  const maxCardHeight = options.maxCardHeight ?? 188;

  const clearClose = () => {
    if (closeTimer.current === null) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const clearOpen = () => {
    if (openTimer.current === null) return;
    window.clearTimeout(openTimer.current);
    openTimer.current = null;
  };
  const resolvePlacement = (): "top" | "bottom" => {
    const anchor = anchorRef.current;
    if (!anchor) return "top";
    const rect = anchor.getBoundingClientRect();
    const viewport = options.viewportSelector ? anchor.closest(options.viewportSelector) : null;
    const vRect = viewport instanceof HTMLElement ? viewport.getBoundingClientRect() : null;
    const top = Math.max(0, vRect?.top ?? 0);
    const bottom = Math.min(window.innerHeight, vRect?.bottom ?? window.innerHeight);
    const cardHeight = Math.min(cardRef.current?.getBoundingClientRect().height || maxCardHeight, maxCardHeight);
    const required = cardHeight + 10;
    const spaceAbove = rect.top - top;
    const spaceBelow = bottom - rect.bottom;
    return spaceAbove < required && spaceBelow > spaceAbove ? "bottom" : "top";
  };
  const openHover = () => {
    if (!options.enabled) return;
    clearClose();
    if (open || openTimer.current !== null) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      setPlacement(resolvePlacement());
      setOpen(true);
    }, HOVER_OPEN_MS);
  };
  const scheduleClose = () => {
    clearOpen();
    clearClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, HOVER_CLOSE_MS);
  };
  const closeNow = () => {
    clearOpen();
    clearClose();
    setOpen(false);
  };
  useEffect(() => () => {
    clearOpen();
    clearClose();
  }, []);

  return { anchorRef, cardRef, open, placement, openHover, scheduleClose, closeNow };
}
