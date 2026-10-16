import { useMemo, useRef } from "react";
import type { AuthSession } from "../auth";
import type { CommunityAppTool } from "../../../../shared/communityAppSession";
import {
  listCloudCommunityAppsForManager,
  listCloudCommunityAppsForMember,
  mintCloudCommunityAppSession,
  registerCloudCommunityApp,
  setCloudCommunityAppStatus,
  type CloudCommunityAppDetail,
  type CloudCommunityAppSession,
  type CloudCommunityAppSummary,
} from "../../../../shared/cloudCommunityAppsGateway";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

export type CommunityAppsGateway = {
  scopeKey: string;
  canManage: boolean;
  listForMember: () => Promise<CloudCommunityAppSummary[]>;
  mint: (appSlug: string) => Promise<CloudCommunityAppSession>;
  listForManager: () => Promise<CloudCommunityAppDetail[]>;
  register: (app: { slug: string; name: string; origin: string; allowedTools: CommunityAppTool[] }) => Promise<CloudCommunityAppDetail>;
  setStatus: (slug: string, status: "active" | "disabled") => Promise<CloudCommunityAppDetail>;
};

// Every call re-checks that the community and signed-in user it was created for
// are still current, so a late result can never land in another community.
export function useWebCommunityAppsGateway(params: {
  activeCommunityId: string | null;
  canManage: boolean;
  session: AuthSession | null;
  ensureSession: EnsureAuthSession;
}): CommunityAppsGateway | undefined {
  const current = useRef(params);
  current.current = params;
  return useMemo(() => {
    const { activeCommunityId: communityId, session } = params;
    if (!communityId || !session) return undefined;
    const run = async <T,>(operation: (session: AuthSession) => Promise<T>): Promise<T> => {
      const valid = () =>
        current.current.activeCommunityId === communityId && current.current.session?.user.id === session.user.id;
      if (!valid()) throw new Error("community_app_scope_changed");
      const ready = await params.ensureSession(session, "community_apps");
      if (!ready || ready.user.id !== session.user.id || !valid()) throw new Error("community_app_scope_changed");
      const result = await operation(ready);
      if (!valid()) throw new Error("community_app_scope_changed");
      return result;
    };
    return {
      scopeKey: `${communityId}:${session.user.id}`,
      canManage: params.canManage,
      listForMember: () => run((s) => listCloudCommunityAppsForMember(s, communityId)),
      mint: (appSlug) => run((s) => mintCloudCommunityAppSession(s, communityId, appSlug)),
      listForManager: () => run((s) => listCloudCommunityAppsForManager(s, communityId)),
      register: (app) => run((s) => registerCloudCommunityApp(s, communityId, app)),
      setStatus: (slug, status) => run((s) => setCloudCommunityAppStatus(s, communityId, slug, status)),
    };
  }, [params.activeCommunityId, params.canManage, params.session, params.ensureSession]);
}
