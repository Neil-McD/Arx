import { useEffect } from "react";

export function useWebDirectMessageDeepLinkLifecycle(params: {
  isAuthenticated: boolean;
  openConversation: (conversationId: string) => void;
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
    params.openConversation(conversationId);
  }, [params.isAuthenticated, params.openConversation]);
}
