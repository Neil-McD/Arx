// Studio's /c/<slug>: every community lives on its own site, so this page only
// hands the visitor over to it (joining, paying and members happen there). A
// community with no site yet gets a short note instead of a dead end.
import { useEffect, useState } from "react";
import { resolveCloudPublicFunnel } from "../../../../shared/cloudPublicFunnelGateway";
import { communitySiteRedirectTarget } from "../../../../shared/webAppRouteState";

type HandoffCommunity = { slug?: string | null; name?: string | null; site_url?: string | null };

export function WebCommunityHandoff(props: { communitySlug: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "no_site"; name: string } | { status: "missing" }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await resolveCloudPublicFunnel<null, HandoffCommunity, unknown>({ communitySlug: props.communitySlug });
        if (cancelled) return;
        const community = payload?.ok ? payload.community : null;
        if (!community?.slug) return setState({ status: "missing" });
        const target = communitySiteRedirectTarget(`/c/${community.slug}`, community.slug, community.site_url);
        if (target) return window.location.replace(target);
        setState({ status: "no_site", name: String(community.name ?? community.slug) });
      } catch {
        if (!cancelled) setState({ status: "missing" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.communitySlug]);

  if (state.status === "loading") return <div className="landing-auth-hold" aria-hidden="true" />;
  return (
    <div className="public-funnel-page">
      <div className="public-funnel-shell public-funnel-shell-narrow">
        <section className="public-funnel-state-card">
          <h1 className="public-funnel-state-title">
            {state.status === "no_site" ? state.name : "Community not found"}
          </h1>
          <p className="public-funnel-state-copy">
            {state.status === "no_site"
              ? "This community doesn't have its site yet, so it isn't taking new members here."
              : "This community doesn't exist or isn't public."}
          </p>
          <div className="public-funnel-state-actions">
            <a className="public-funnel-secondary" href="/">Go to Polynet</a>
          </div>
        </section>
      </div>
    </div>
  );
}
