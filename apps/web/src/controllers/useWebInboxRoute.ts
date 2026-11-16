import { useEffect, useRef } from "react";

import { isDesignV1Active } from "../../../../shared/designSystem";
import { readRouteDetail, useRouteDetail, writeRouteDetail } from "../../../../shared/routeDetails";
import { buildCommunityHomePath, buildCommunityTabPath } from "../../../../shared/webAppRouteState";
import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import type { useWebDirectMessagesController } from "./useWebDirectMessagesController";

// Design v1: Inbox is a page of the community (/c/<slug>/inbox, with the open
// conversation as /inbox/<conversation>). It is open exactly while the address
// is Inbox's; opening it goes there; its own close button returns to the page
// it was opened from.
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
  const shownConversationRef = useRef<string | null>(null);

  useEffect(() => {
    directMessages.followRoute(isInboxRoute);
    // Off Inbox nothing is shown, so nothing is remembered as shown.
    if (!isInboxRoute) shownConversationRef.current = null;
  }, [directMessages.followRoute, isInboxRoute]);
  // The page Inbox was opened from, so closing it goes back there directly,
  // however many conversations were opened in between.
  const openedFromRef = useRef<string | null>(null);

  directMessages.navigatorRef.current = isDesignV1Active() ? {
    open: () => {
      if (isInboxRouteRef.current) return true;
      const path = buildCommunityTabPath(latest.current.communitySlug, "inbox");
      if (!path) return false;
      openedFromRef.current = `${window.location.pathname}${window.location.search}`;
      latest.current.navigateTo(path);
      return true;
    },
    leave: (byUser) => {
      if (!isInboxRouteRef.current) return;
      // Closed by its own button or Escape: to the page it was opened from.
      const openedFrom = openedFromRef.current;
      openedFromRef.current = null;
      if (byUser && openedFrom) {
        latest.current.navigateTo(openedFrom);
        return;
      }
      // Another page is opening. On a phone that is a bottom tab, which has
      // no address of its own yet (slice B), so the community's list is
      // where the address rests; on a wide window, its channels.
      const onPhone = document.documentElement.dataset.layout === "phone";
      const path = onPhone
        ? buildCommunityHomePath(latest.current.communitySlug)
        : buildCommunityTabPath(latest.current.communitySlug, "chat");
      if (path) latest.current.navigateTo(path, { replace: true });
    },
  } : null;

  // Arriving on Inbox with a conversation in the address (refresh, back, a
  // link): open that one, unless it is the one Inbox already shows.
  const conversationInAddress = useRouteDetail("conversation");
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
