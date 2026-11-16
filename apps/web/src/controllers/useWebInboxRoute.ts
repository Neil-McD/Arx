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
  // The page Inbox was opened from, so closing it goes back there directly,
  // however many conversations were opened in between.
  const openedFromRef = useRef<string | null>(null);
  // Off Inbox nothing is shown, and a later return (Back, a link) was not
  // opened from anywhere.
  if (!isInboxRoute) {
    shownConversationRef.current = null;
    openedFromRef.current = null;
  }

  directMessages.addressRef.current = isDesignV1Active() ? {
    isOpen: () => isInboxRouteRef.current,
    open: () => {
      if (isInboxRouteRef.current) return true;
      const path = buildCommunityTabPath(latest.current.communitySlug, "inbox");
      if (!path) return false;
      openedFromRef.current = `${window.location.pathname}${window.location.search}`;
      latest.current.navigateTo(path);
      return true;
    },
    close: () => {
      const openedFrom = openedFromRef.current;
      openedFromRef.current = null;
      if (openedFrom) {
        latest.current.navigateTo(openedFrom);
        return;
      }
      // Reached by Back, a link or a refresh: the community's front page,
      // in Inbox's place.
      const path = document.documentElement.dataset.layout === "phone"
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

  // Open exactly while the address is Inbox's; in place only when there is no
  // address to use.
  const isOpen = isInboxRoute || directMessages.isOpenInPlace;
  return { isInboxRoute, isOpen, onActiveConversationChange };
}
