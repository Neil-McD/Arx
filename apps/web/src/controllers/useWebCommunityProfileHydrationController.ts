import { useCallback, useEffect, useMemo, useRef } from "react";

import type {
  UserProfile,
  UserProfileDetail,
} from "../../../../shared/communityTypes";
import { mergeUserProfileEntry } from "../../../../shared/userProfileMerge";
import { shortId } from "../../../../shared/chatUi";
import { useResumeEpochEffect } from "../../../../shared/useResumeEpochEffect";
import type { AuthSession } from "../auth";

type ActorRoot = {
  root: {
    actor_user_id?: string | null;
    last_reply_actor_user_id?: string | null;
  };
};

type ActorReply = {
  reply: {
    actor_user_id?: string | null;
  };
};

type ActivityActor = {
  actor_user_id?: string | null;
};

type UseWebCommunityProfileHydrationControllerParams = {
  activePage: string;
  canonicalSessionUserId: string | null;
  resumeEpoch: number;
  session: AuthSession | null;
  cloudProfile: UserProfileDetail | null;
  profilesByUserId: Record<string, UserProfile>;
  communityDirectoryMembers: readonly { user_id?: string | null }[];
  communityActivityEvents: readonly ActivityActor[];
  communityInteractionRoots: readonly ActorRoot[];
  communityInteractionRepliesByRootId: Record<
    string,
    readonly ActorReply[]
  >;
  loadUserProfiles: (
    userIds: string[],
    session: AuthSession,
    options?: { force?: boolean },
  ) => Promise<void>;
};

export function useWebCommunityProfileHydrationController(
  params: UseWebCommunityProfileHydrationControllerParams,
) {
  const sessionRef = useRef(params.session);
  sessionRef.current = params.session;
  const visibleProfileIds = useMemo(() => {
    if (params.activePage !== "community") return [] as string[];
    const ids = new Set<string>();
    for (const member of params.communityDirectoryMembers) {
      const userId = String(member.user_id ?? "").trim();
      if (userId) ids.add(userId);
    }
    for (const bundle of params.communityInteractionRoots) {
      const actorId = String(bundle.root.actor_user_id ?? "").trim();
      const lastReplyActorId = String(
        bundle.root.last_reply_actor_user_id ?? "",
      ).trim();
      if (actorId) ids.add(actorId);
      if (lastReplyActorId) ids.add(lastReplyActorId);
    }
    for (const event of params.communityActivityEvents) {
      const actorId = String(event.actor_user_id ?? "").trim();
      if (actorId) ids.add(actorId);
    }
    for (
      const replies of Object.values(
        params.communityInteractionRepliesByRootId,
      )
    ) {
      for (const bundle of replies) {
        const actorId = String(bundle.reply.actor_user_id ?? "").trim();
        if (actorId) ids.add(actorId);
      }
    }
    if (params.canonicalSessionUserId) ids.delete(params.canonicalSessionUserId);
    return Array.from(ids);
  }, [
    params.activePage,
    params.canonicalSessionUserId,
    params.communityDirectoryMembers,
    params.communityActivityEvents,
    params.communityInteractionRepliesByRootId,
    params.communityInteractionRoots,
  ]);

  const profilesByUserId = useMemo(() => {
    const userId = params.canonicalSessionUserId;
    const cloudProfile = params.cloudProfile;
    if (!userId || !cloudProfile) return params.profilesByUserId;
    const existing = params.profilesByUserId[userId] ?? undefined;
    const cloudHasAvatar = Boolean(
      cloudProfile.avatar_storage_id || cloudProfile.avatar_url,
    );
    return {
      ...params.profilesByUserId,
      [userId]: mergeUserProfileEntry<UserProfile>(existing, {
        user_id: userId,
        display_name:
          cloudProfile.display_name ?? existing?.display_name ?? null,
        handle: cloudProfile.handle ?? null,
        normalized_handle: cloudProfile.normalized_handle ?? null,
        bio: cloudProfile.bio ?? existing?.bio ?? null,
        social_links:
          cloudProfile.social_links ?? existing?.social_links ?? null,
        avatar_url: cloudProfile.avatar_url,
        avatar_storage_id:
          cloudProfile.avatar_storage_id,
        avatar_focus_x: cloudHasAvatar
          ? cloudProfile.avatar_focus_x ?? 0.5
          : existing?.avatar_focus_x ?? 0.5,
        avatar_focus_y: cloudHasAvatar
          ? cloudProfile.avatar_focus_y ?? 0.5
          : existing?.avatar_focus_y ?? 0.5,
        avatar_zoom: cloudHasAvatar
          ? cloudProfile.avatar_zoom ?? 1
          : existing?.avatar_zoom ?? 1,
      }),
    } satisfies Record<string, UserProfile>;
  }, [
    params.canonicalSessionUserId,
    params.cloudProfile,
    params.profilesByUserId,
  ]);

  const displayName = useCallback(
    (userId: string): string => {
      const remoteName =
        profilesByUserId[userId]?.display_name?.trim();
      if (remoteName) return remoteName;
      if (
        params.canonicalSessionUserId &&
        userId === params.canonicalSessionUserId
      ) {
        const sessionDisplayName = String(
          params.session?.user?.displayName ?? "",
        ).trim();
        if (sessionDisplayName) return sessionDisplayName;
      }
      return shortId(
        userId,
        params.canonicalSessionUserId ?? undefined,
        params.session?.user?.email ?? undefined,
      );
    },
    [
      params.canonicalSessionUserId,
      params.session?.user?.displayName,
      params.session?.user?.email,
      profilesByUserId,
    ],
  );

  useEffect(() => {
    if (!params.canonicalSessionUserId || !sessionRef.current || visibleProfileIds.length === 0) return;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    void params.loadUserProfiles(visibleProfileIds, currentSession);
  }, [
    params.loadUserProfiles,
    params.canonicalSessionUserId,
    visibleProfileIds,
  ]);

  useResumeEpochEffect(params.resumeEpoch, () => {
    const currentSession = sessionRef.current;
    if (!params.canonicalSessionUserId || !currentSession || visibleProfileIds.length === 0) return;
    void params.loadUserProfiles(visibleProfileIds, currentSession, {
      force: true,
    });
  });

  return { profilesByUserId, displayName };
}
