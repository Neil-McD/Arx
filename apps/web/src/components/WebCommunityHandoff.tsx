// Studio's /c/<slug>: the community's one link. Visitors go to its doorstep
// (Join on its site: the page that sells it, where joining and paying happen;
// Discover's cards come through here too). Members go where the owner's
// switch says they spend time: the community in Polynet's app, or its site.
// A community with no site yet gets a short note instead of a dead end, and a
// failed lookup says so (with a retry) rather than claiming it doesn't exist.
import { useEffect, useState } from "react";
import { resolveCloudPublicFunnel } from "../../../../shared/cloudPublicFunnelGateway";
import { communitySiteRedirectTarget } from "../../../../shared/webAppRouteState";

type HandoffCommunity = { slug?: string | null; name?: string | null; site_url?: string | null; members_use?: "app" | "site" };

export function WebCommunityHandoff(props: { communitySlug: string; membership: "loading" | "member" | "visitor" }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "no_site"; name: string } | { status: "missing" } | { status: "unreachable" }>({ status: "loading" });

  useEffect(() => {
    if (props.membership === "loading") return;
    let cancelled = false;
    void (async () => {
      try {
        const payload = await resolveCloudPublicFunnel<null, HandoffCommunity, unknown>({ communitySlug: props.communitySlug });
        if (cancelled) return;
        const community = payload?.ok ? payload.community : null;
        if (!community?.slug) return setState({ status: "missing" });
        if (props.membership === "member" && community.members_use !== "site") {
          return window.location.replace(`/c/${encodeURIComponent(community.slug)}/home`);
        }
        const target = communitySiteRedirectTarget(`/c/${community.slug}`, community.slug, community.site_url);
        // A visitor: the doorstep. A member of a community on its own site:
        // the place on the site they asked for.
        if (target) return window.location.replace(props.membership === "visitor" ? `${new URL(target).origin}/join` : target);
        setState({ status: "no_site", name: String(community.name ?? community.slug) });
      } catch {
        if (!cancelled) setState({ status: "unreachable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.communitySlug, props.membership]);

  if (state.status === "loading") return <div className="landing-auth-hold" aria-hidden="true" />;
  const title = state.status === "no_site" ? state.name : state.status === "unreachable" ? "Couldn't reach Polynet" : "Community not found";
  const copy = state.status === "no_site"
    ? "This community doesn't have its site yet, so it isn't taking new members here. Already have access? Sign in."
    : state.status === "unreachable"
      ? "We couldn't look up this community just now. Check your connection and try again."
      : "This community doesn't exist or isn't public.";
  return (
    <div className="public-funnel-page">
      <div className="public-funnel-shell public-funnel-shell-narrow">
        <section className="public-funnel-state-card">
          <h1 className="public-funnel-state-title">{title}</h1>
          <p className="public-funnel-state-copy">{copy}</p>
          <div className="public-funnel-state-actions">
            {state.status === "unreachable" ? (
              <button type="button" className="public-funnel-primary" onClick={() => window.location.reload()}>Try again</button>
            ) : null}
            {state.status === "no_site" && props.membership === "visitor" ? (
              // Someone who already has access (bought in the community's own
              // app, or was invited) signs in and lands inside.
              <a className="public-funnel-primary" href={`/login?returnTo=${encodeURIComponent(`/c/${props.communitySlug}/home`)}`}>Sign in</a>
            ) : null}
            <a className="public-funnel-secondary" href="/">Go to Polynet</a>
          </div>
        </section>
      </div>
    </div>
  );
}
