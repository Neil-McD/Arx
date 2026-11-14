import { useEffect } from "react";

// Inbox is a page drawn over the main area; arriving on Settings (yours or
// the community's) closes it, or it would stay on top of Settings.
export function useCloseInboxOnSettings(params: { isOnSettingsPage: boolean; isInboxOpen: boolean; closeInbox: () => void }) {
  const { isOnSettingsPage, isInboxOpen, closeInbox } = params;
  useEffect(() => {
    if (isOnSettingsPage && isInboxOpen) closeInbox();
  }, [isOnSettingsPage, isInboxOpen, closeInbox]);
}
