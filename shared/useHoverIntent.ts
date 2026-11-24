import { useEffect, useRef, useState } from "react";

// A small card that opens when someone rests the pointer on (or tabs to) a
// trigger, and closes when they move away: the profile card on names and
// avatars, and the card on a chip (shared/entityChipsUi.tsx). Opening waits a
// moment so sweeping past doesn't fire it; it opens above unless there isn't
// room inside the scrolling area, then below. It starts at the trigger's left
// edge and slides sideways by `shift` when that would run past the area's edge.

export const HOVER_OPEN_MS = 450;
export const HOVER_CLOSE_MS = 140;

export const HOVER_EDGE_GAP = 8;

// The sideways move that keeps a card of `width` starting at `start` inside
// [areaLeft, areaRight], with a small gap. The right edge wins over the left
// only when the card fits; a card wider than the area stays at its left edge.
export function hoverCardShift(input: { start: number; width: number; areaLeft: number; areaRight: number }): number {
  const min = input.areaLeft + HOVER_EDGE_GAP;
  const max = input.areaRight - HOVER_EDGE_GAP - input.width;
  const wanted = Math.max(min, Math.min(input.start, max));
  return Math.round(wanted - input.start);
}

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
  const [shift, setShift] = useState(0);
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
  // How far to slide the card sideways (px) so it stays inside the area. A
  // trigger that wraps onto two lines anchors the card at its first line.
  const resolveShift = (): number => {
    const anchor = anchorRef.current;
    const card = cardRef.current;
    if (!anchor || !card) return 0;
    const start = anchor.getClientRects()[0]?.left ?? anchor.getBoundingClientRect().left;
    const viewport = options.viewportSelector ? anchor.closest(options.viewportSelector) : null;
    const vRect = viewport instanceof HTMLElement ? viewport.getBoundingClientRect() : null;
    return hoverCardShift({
      start,
      width: card.offsetWidth,
      areaLeft: Math.max(0, vRect?.left ?? 0),
      areaRight: Math.min(window.innerWidth, vRect?.right ?? window.innerWidth),
    });
  };
  const openHover = () => {
    if (!options.enabled) return;
    clearClose();
    if (open || openTimer.current !== null) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      setPlacement(resolvePlacement());
      setShift(resolveShift());
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

  return { anchorRef, cardRef, open, placement, shift, openHover, scheduleClose, closeNow };
}
