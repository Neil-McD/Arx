// Design system v1: whether this community's agent is on
// (docs/specs/community-agent-gateway-v0.md, "AI on and off"). Free
// communities are plain: no guide, no curation, no written summaries. Pages
// read it with useCommunityAgentOn(); until it is known, they show the guide,
// so a paid community never flashes plain.
import { createContext, useContext, type ReactNode } from "react";

const CommunityAgentOnContext = createContext<boolean>(true);

export function CommunityAgentOnProvider(props: { value: boolean; children: ReactNode }) {
  return <CommunityAgentOnContext.Provider value={props.value}>{props.children}</CommunityAgentOnContext.Provider>;
}

export function useCommunityAgentOn(): boolean {
  return useContext(CommunityAgentOnContext);
}

// Whether the community's guide is on comes with the access record the app
// waits for before it draws a community (getMyCommunityAccess), which also
// reloads when the window comes back. Unknown (you may not read its chat)
// stays "on": the server still refuses what it must.
export function communityAgentOnFromAccess(known: boolean | null | undefined): boolean {
  return known !== false;
}
