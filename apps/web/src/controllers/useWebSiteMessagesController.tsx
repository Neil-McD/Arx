import { MessageCircle } from "lucide-react";
import { useCallback, useMemo } from "react";

import type { UserProfile } from "../../../../shared/communityTypes";
import type { WebCommunityRecord } from "../webAppContracts";

// Direct messages live on community sites: Messages on a site's private pages
// shows the member's whole inbox. Studio has no inbox of its own; its Messages
// button and a profile's "Message" open the site's (the active community's, or
// another of theirs that has one). Without any site there's no button.
export function siteMessagesUrl(
  communities: Array<Pick<WebCommunityRecord, "id" | "messages_url">>,
  preferredCommunityId: string | null,
): string | null {
  const preferred = communities.find((community) => community.id === preferredCommunityId)?.messages_url;
  const url = preferred ?? communities.find((community) => community.messages_url)?.messages_url ?? null;
  try {
    return url && new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

// "Message @handle": the site's new-conversation page; their inbox without a handle.
export function siteNewMessageUrl(messagesUrl: string, handle: string | null | undefined): string {
  const to = String(handle ?? "").trim().replace(/^@/, "");
  return to ? `${messagesUrl.replace(/\/+$/, "")}/new?to=${encodeURIComponent(to)}` : messagesUrl;
}

export function useWebSiteMessagesController(params: {
  isAuthenticated: boolean;
  communities: WebCommunityRecord[];
  activeCommunityId: string | null;
  profilesByUserId: Record<string, UserProfile>;
}) {
  const messagesUrl = params.isAuthenticated ? siteMessagesUrl(params.communities, params.activeCommunityId) : null;

  const open = useCallback(() => {
    if (messagesUrl) window.location.assign(messagesUrl);
  }, [messagesUrl]);

  const messageMember = useCallback((targetUserId: string, communityId: string) => {
    const url = siteMessagesUrl(params.communities, communityId);
    if (url) window.location.assign(siteNewMessageUrl(url, params.profilesByUserId[targetUserId]?.handle));
  }, [params.communities, params.profilesByUserId]);

  const button = useMemo(() => messagesUrl ? (
    <a className="icon-button direct-messages-topbar-button" href={messagesUrl} aria-label="Messages" title="Messages">
      <MessageCircle aria-hidden="true" />
    </a>
  ) : null, [messagesUrl]);

  return { messagesUrl, open, messageMember, button };
}
