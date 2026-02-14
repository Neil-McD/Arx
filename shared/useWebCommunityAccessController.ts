import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

type UseWebCommunityAccessControllerArgs<SessionT, CommunityRecordT, CommunityAccessT, UserProfileT> = {
  getSupabaseUrl: () => string | null;
  getSupabaseAuthUid: (session: SessionT) => string;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  toCanonicalCommunityVisibility: (value: string | null | undefined, fallback: string) => string;

  activeCommunityId: string | null;

  setIsLoadingCommunities: Dispatch<SetStateAction<boolean>>;
  setCommunityRoleById: Dispatch<SetStateAction<Record<string, string>>>;
  setCommunities: Dispatch<SetStateAction<CommunityRecordT[]>>;
  setActiveCommunityId: Dispatch<SetStateAction<string | null>>;

  setIsLoadingCommunityAccess: Dispatch<SetStateAction<boolean>>;
  setActiveCommunityAccess: Dispatch<SetStateAction<CommunityAccessT | null>>;

  setProfilesByUserId: Dispatch<SetStateAction<Record<string, UserProfileT>>>;
};

export function useWebCommunityAccessController<
  SessionT,
  CommunityRecordT extends { id: string; visibility: string },
  CommunityAccessT,
  UserProfileT extends { user_id: string },
>(args: UseWebCommunityAccessControllerArgs<SessionT, CommunityRecordT, CommunityAccessT, UserProfileT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunities = useCallback(async (session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return;
    const userId = current.getSupabaseAuthUid(session);
    try {
      current.setIsLoadingCommunities(true);
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/community_memberships?select=community_id,role,communities(id,slug,name,owner_id,description,avatar_url,banner_url,visibility,free_join_requires_approval,created_at,updated_at)&user_id=eq.${userId}`,
        {},
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        throw new Error(message);
      }
      const rows = (await response.json()) as Array<{
        community_id: string;
        role: string;
        communities: CommunityRecordT;
      }>;
      const roleMap: Record<string, string> = {};
      for (const row of rows) {
        if (row.community_id) roleMap[row.community_id] = row.role;
      }
      current.setCommunityRoleById(roleMap);

      const list = rows
        .map((row) => row.communities)
        .filter(Boolean)
        .map((community) => ({
          ...community,
          visibility: current.toCanonicalCommunityVisibility(community.visibility, "unlisted"),
        }));
      current.setCommunities(list);
      if (!current.activeCommunityId) {
        if (list.length > 0) current.setActiveCommunityId(list[0].id);
        return;
      }
      if (!list.some((item) => item.id === current.activeCommunityId) && list.length > 0) {
        current.setActiveCommunityId(list[0].id);
      }
    } catch (error) {
      console.warn("Failed to load communities:", error);
    } finally {
      current.setIsLoadingCommunities(false);
    }
  }, []);

  const loadCommunityAccess = useCallback(async (communityId: string, session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setIsLoadingCommunityAccess(true);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/get_my_community_access`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_community_id: communityId }),
        },
        session,
      );
      if (!response.ok) return;
      const rows = (await response.json()) as CommunityAccessT[];
      current.setActiveCommunityAccess(rows[0] ?? null);
    } catch {
      // ignore
    } finally {
      current.setIsLoadingCommunityAccess(false);
    }
  }, []);

  const loadUserProfiles = useCallback(async (userIds: string[], session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return;
    const unique = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
    if (unique.length === 0) return;
    const idsFilter = unique.map((id) => `"${id}"`).join(",");
    try {
      const profilesResponse = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/profiles?select=user_id,display_name,avatar_url&user_id=in.(${idsFilter})`,
        { method: "GET" },
        session,
      );
      if (!profilesResponse.ok) return;
      const profiles = (await profilesResponse.json()) as UserProfileT[];
      if (profiles.length === 0) return;
      current.setProfilesByUserId((prev) => {
        const next = { ...prev };
        for (const profile of profiles) {
          next[profile.user_id] = profile;
        }
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  return {
    loadCommunities,
    loadCommunityAccess,
    loadUserProfiles,
  };
}
