import { useEffect, useRef } from "react";

import { isDesignV1Active } from "../../../../shared/designSystem";
import { readRouteDetail, useRouteDetail, writeRouteDetail } from "../../../../shared/routeDetails";
import { buildCommunityTabPath } from "../../../../shared/webAppRouteState";
import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import type { useWebDirectMessagesController } from "./useWebDirectMessagesController";

// Design v1: Inbox is a page of the community (/c/<slug>/inbox, with the open
// conversation as /inbox/<conversation>). It is open exactly while the address
// is Inbox's; opening it goes there; its own close button goes back.
export function useWebInboxRoute(params: {
  directMessages: ReturnType<typeof useWebDirectMessagesController>;
  activePage: AppPage;
  communityTab: CommunityTab;
  communitySlug: string | null;
  navigateTo: (path: string, options?: { replace?: boolean; state?: unknown }) => void;
  openConversationById: (conversationId: string) => void;
}) {
  const { directMessages } = params;
  const isInboxRoute = isDesignV1Active() && params.activePage === "community" && params.communityTab === "inbox";
  const isInboxRouteRef = useRef(isInboxRoute);
  isInboxRouteRef.current = isInboxRoute;
  const latest = useRef(params);
  latest.current = params;

  useEffect(() => { directMessages.followRoute(isInboxRoute); }, [directMessages.followRoute, isInboxRoute]);

  directMessages.navigatorRef.current = isDesignV1Active() ? {
    open: () => {
      if (isInboxRouteRef.current) return true;
      const path = buildCommunityTabPath(latest.current.communitySlug, "inbox");
      if (!path) return false;
      latest.current.navigateTo(path, { state: { polynetInbox: true } });
      return true;
    },
    leave: (byUser) => {
      if (!isInboxRouteRef.current) return;
      // Opened from another page in this tab: back is where you came from.
      if (byUser && (window.history.state as { polynetInbox?: boolean } | null)?.polynetInbox) {
        window.history.back();
        return;
      }
      const path = buildCommunityTabPath(latest.current.communitySlug, "chat");
      if (path) latest.current.navigateTo(path, { replace: true });
    },
  } : null;

  // Arriving on Inbox with a conversation in the address (refresh, back, a
  // link): open that one, unless it is the one Inbox already shows.
  const conversationInAddress = useRouteDetail("conversation");
  const shownConversationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isInboxRoute || !conversationInAddress) return;
    if (conversationInAddress === shownConversationRef.current) return;
    latest.current.openConversationById(conversationInAddress);
  }, [isInboxRoute, conversationInAddress]);

  // Inbox's shown conversation goes in the address; one opened for you only
  // fills it in, picking another is a step back can return from.
  const onActiveConversationChange = (conversationId: string | null) => {
    shownConversationRef.current = conversationId;
    if (!isInboxRouteRef.current) return;
    const inAddress = readRouteDetail("conversation");
    if (conversationId === inAddress) return;
    writeRouteDetail("conversation", conversationId, { replace: !inAddress || !conversationId });
  };

  return { isInboxRoute, onActiveConversationChange };
}
