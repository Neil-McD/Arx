import { useCallback, useState } from "react";

// In the Classroom (top-tab) layout the community agent opens as a floating
// panel instead of a rail, so the shell tracks where the layout put its tabs
// and whether that panel is open.
export function useWebFloatingCommunityAgent() {
  const [communityLayoutPosition, setCommunityLayoutPosition] = useState<"top" | "side">("side");
  const [isFloatingCommunityAgentOpen, setIsFloatingCommunityAgentOpen] = useState(false);
  const openFloatingCommunityAgent = useCallback(() => setIsFloatingCommunityAgentOpen(true), []);
  return {
    communityLayoutPosition,
    setCommunityLayoutPosition,
    isFloatingCommunityAgentOpen,
    setIsFloatingCommunityAgentOpen,
    openFloatingCommunityAgent,
  };
}
