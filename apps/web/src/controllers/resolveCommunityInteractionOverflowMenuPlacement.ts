export type CommunityInteractionOverflowMenuPlacement = "above" | "below";

type TriggerVerticalBounds = {
  top: number;
  bottom: number;
};

export function resolveCommunityInteractionOverflowMenuPlacement(
  triggerBounds: TriggerVerticalBounds,
  viewportHeight: number,
): CommunityInteractionOverflowMenuPlacement {
  if (
    !Number.isFinite(triggerBounds.top) ||
    !Number.isFinite(triggerBounds.bottom) ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  ) {
    return "below";
  }

  const triggerMidpoint = triggerBounds.top + (triggerBounds.bottom - triggerBounds.top) / 2;
  return triggerMidpoint >= viewportHeight / 2 ? "above" : "below";
}
