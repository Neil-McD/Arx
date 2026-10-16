import { useEffect, useRef, useState } from "react";
import { readConvexSiteUrl } from "../../../../shared/convexRuntime";
import {
  COMMUNITY_APP_SESSION_ERROR,
  COMMUNITY_APP_SESSION_MESSAGE,
  COMMUNITY_APP_SESSION_REQUEST,
  type CommunityAppSessionMessage,
} from "../../../../shared/communityAppSession";
import type { CloudCommunityAppSession, CloudCommunityAppSummary } from "../../../../shared/cloudCommunityAppsGateway";

const REUSE_SESSION_MIN_REMAINING_MS = 60_000;

// Hosts one community app on its own origin. The shell answers session requests
// only from this iframe's window and that app's exact registered origin, and
// posts only to that origin. The token never touches Polynet's own storage.
export function WebCommunityAppFrame(props: {
  app: CloudCommunityAppSummary;
  communitySlug: string;
  mint: (appSlug: string) => Promise<CloudCommunityAppSession>;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const sessionRef = useRef<CloudCommunityAppSession | null>(null);
  const pendingRef = useRef<Promise<CloudCommunityAppSession> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { app, communitySlug, mint } = props;

  useEffect(() => {
    sessionRef.current = null;
    pendingRef.current = null;
    setError(null);
    const siteUrl = readConvexSiteUrl();
    const post = (message: Record<string, unknown>) => {
      frameRef.current?.contentWindow?.postMessage(message, app.origin);
    };
    const session = async () => {
      const cached = sessionRef.current;
      if (cached && Date.parse(cached.expires_at) - Date.now() > REUSE_SESSION_MIN_REMAINING_MS) return cached;
      pendingRef.current ??= mint(app.slug).finally(() => {
        pendingRef.current = null;
      });
      const minted = await pendingRef.current;
      sessionRef.current = minted;
      return minted;
    };
    const deliver = async () => {
      try {
        if (!siteUrl) throw new Error("convex_site_url_missing");
        const minted = await session();
        const message: CommunityAppSessionMessage = {
          type: COMMUNITY_APP_SESSION_MESSAGE,
          version: 1,
          token: minted.token,
          expires_at: minted.expires_at,
          community_slug: communitySlug,
          api_url: `${siteUrl.replace(/\/+$/, "")}/runtime/app`,
        };
        post(message);
        setError(null);
      } catch {
        post({ type: COMMUNITY_APP_SESSION_ERROR, code: "session_unavailable" });
        setError("This app couldn't be connected. Try reopening it.");
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== app.origin) return;
      if (event.data && typeof event.data === "object" && event.data.type === COMMUNITY_APP_SESSION_REQUEST) {
        void deliver();
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      sessionRef.current = null;
    };
  }, [app.slug, app.origin, communitySlug, mint]);

  return (
    <div className="web-community-app-frame">
      {error ? <div role="alert" className="error">{error}</div> : null}
      <iframe
        ref={frameRef}
        src={`${app.origin}/`}
        title={app.name}
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{ width: "100%", height: "calc(100vh - 160px)", minHeight: 480, border: 0, borderRadius: 12, background: "var(--surface, transparent)" }}
      />
    </div>
  );
}
