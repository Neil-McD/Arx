// Design system v1: whether this community's agent is on
// (docs/specs/community-agent-gateway-v0.md, "AI on and off"). Free
// communities are plain: no guide, no curation, no written summaries. Pages
// read it with useCommunityAgentOn(); until it is known, they show the guide,
// so a paid community never flashes plain.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchCloudCommunityAgentOn } from "../../../../shared/cloudCommunityAgentGateway";

const CommunityAgentOnContext = createContext<boolean>(true);

export function CommunityAgentOnProvider(props: { value: boolean; children: ReactNode }) {
  return <CommunityAgentOnContext.Provider value={props.value}>{props.children}</CommunityAgentOnContext.Provider>;
}

export function useCommunityAgentOn(): boolean {
  return useContext(CommunityAgentOnContext);
}

// Read once per community, and again when the window comes back (the owner may
// have just turned the agent on in another tab).
export function useCommunityAgentOnState(args: {
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  communityId: string | null;
}): boolean {
  const [state, setState] = useState<{ communityId: string; on: boolean } | null>(null);
  useEffect(() => {
    const communityId = args.communityId;
    if (!communityId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const session = await args.ensureSession(args.session);
        if (!session) return;
        const on = await fetchCloudCommunityAgentOn({ session, communityId });
        if (!cancelled) setState({ communityId, on });
      } catch { /* Unknown stays "on": the server still refuses what it must. */ }
    };
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.communityId, args.session]);
  return state && state.communityId === args.communityId ? state.on : true;
}
