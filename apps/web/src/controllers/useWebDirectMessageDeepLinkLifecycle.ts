import { useEffect } from "react";

// ?dm=<conversation id> opens that conversation; ?dm=inbox (the community
// sites' shell links here) opens the messages panel.
export function useWebDirectMessageDeepLinkLifecycle(params: {
  isAuthenticated: boolean;
  openConversation: (conversationId: string) => void;
  openInbox: () => void;
}) {
  useEffect(() => {
    if (!params.isAuthenticated || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const conversationId = String(
      url.searchParams.get("dm") ?? "",
    ).trim();
    if (!conversationId) return;
    url.searchParams.delete("dm");
    window.history.replaceState(
      window.history.state ?? {},
      document.title,
      `${url.pathname}${url.search}${url.hash}`,
    );
    if (conversationId === "inbox") params.openInbox();
    else params.openConversation(conversationId);
  }, [params.isAuthenticated, params.openConversation, params.openInbox]);
}
