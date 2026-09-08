import { useEffect, useState } from "react";
import { fetchCloudProfileCommunityContext } from "../../../../shared/cloudProfilesGateway";
import type { ProfileCommunityContext } from "../../../../shared/communityTypes";
import { WebCommunityProfilePanel } from "./WebCommunityProfilePanel";
import type { WebCommunityChatPanelProps } from "./WebCommunityChatPanel";

export function WebCommunityMembersProfile({ userId, chat, onBack }: {
  userId: string;
  chat: WebCommunityChatPanelProps;
  onBack: () => void;
}) {
  const [context, setContext] = useState<ProfileCommunityContext | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!chat.session) { setError(true); return; }
    void fetchCloudProfileCommunityContext({
      session: chat.session,
      targetUserId: userId,
      preferredCommunityId: chat.activeCommunity?.id ?? null,
    }).then(result => { if (!cancelled) setContext(result); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [chat.session, chat.activeCommunity?.id, userId]);
  const profile = chat.profilesByUserId[userId] ?? null;
  return <div className="community-members-profile">
    <button type="button" className="resources-back-btn" onClick={onBack}>← Members</button>
    {error ? <p role="alert">Unable to load this profile. Return to Members and try again.</p>
      : !context ? <p role="status">Loading profile…</p>
      : <WebCommunityProfilePanel
          profile={profile}
          displayName={profile?.display_name || chat.displayName(userId)}
          avatarColor={chat.getAvatarColor(userId)}
          communityContext={context}
          isSelfProfile={context.is_self}
          isMessageDisabled={!context.can_message}
          onMessage={context.can_message && context.message_context_community_id && chat.onOpenDirectMessageFromCommunity
            ? () => chat.onOpenDirectMessageFromCommunity?.(userId, context.message_context_community_id!)
            : undefined}
          getInitials={chat.getInitials}
          docked
        />}
  </div>;
}
