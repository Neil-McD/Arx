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

// Manage → Your app announces a change, so the column shows it without a reload.
const CHANGED_EVENT = "polynet:community-app-links-changed";
export function announceCommunityAppLinksChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT));
}

// Manage → Plans announces a change, so Your app's setup prompt carries the
// current plans.
export const COMMUNITY_PLANS_CHANGED_EVENT = "polynet:community-plans-changed";
export function announceCommunityPlansChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMMUNITY_PLANS_CHANGED_EVENT));
}

// Read once per community (and again after a change); none until known.
export function useCommunityAppLinksState(args: {
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  communityId: string | null;
}): CloudCommunityAppLink[] {
  const [state, setState] = useState<{ communityId: string; apps: CloudCommunityAppLink[] } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((value) => value + 1);
    window.addEventListener(CHANGED_EVENT, bump);
    return () => window.removeEventListener(CHANGED_EVENT, bump);
  }, []);
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
  }, [args.communityId, args.session, version]);
  return state && state.communityId === args.communityId ? state.apps : [];
}
