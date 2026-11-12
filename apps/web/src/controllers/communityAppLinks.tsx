// One door: the community's own apps (Manage → Your app, with an address),
// which members open from the community's left column.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchCloudCommunityAppLinks, type CloudCommunityAppLink } from "../../../../shared/cloudConnectedAppsGateway";

const CommunityAppLinksContext = createContext<CloudCommunityAppLink[]>([]);

export function CommunityAppLinksProvider(props: { value: CloudCommunityAppLink[]; children: ReactNode }) {
  return <CommunityAppLinksContext.Provider value={props.value}>{props.children}</CommunityAppLinksContext.Provider>;
}

export function useCommunityAppLinks(): CloudCommunityAppLink[] {
  return useContext(CommunityAppLinksContext);
}

// Read once per community; none until known.
export function useCommunityAppLinksState(args: {
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  communityId: string | null;
}): CloudCommunityAppLink[] {
  const [state, setState] = useState<{ communityId: string; apps: CloudCommunityAppLink[] } | null>(null);
  useEffect(() => {
    const communityId = args.communityId;
    if (!communityId) return;
    let cancelled = false;
    void (async () => {
      try {
        const session = await args.ensureSession(args.session);
        if (!session) return;
        const apps = await fetchCloudCommunityAppLinks({ session, communityId });
        if (!cancelled) setState({ communityId, apps });
      } catch { /* No links rather than a broken column. */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.communityId, args.session]);
  return state && state.communityId === args.communityId ? state.apps : [];
}
