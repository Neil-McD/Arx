import { useEffect, useState } from "react";
import { Check, ExternalLink, Link2, Pencil, RotateCcw } from "lucide-react";
import {
  fetchCloudPublicFunnelStats,
  resolveCloudPublicFunnel,
} from "../../../../shared/cloudPublicFunnelGateway";
import { buildCommunityFunnelRenderModel } from "../../../../shared/communityFunnelUi";
import type { PublicPlanSummary } from "../../../../shared/communityTypes";
import type { WebPublicCommunityRecord } from "../webAppContracts";
import { useActiveCommunityLayout } from "../controllers/useWebCommunityLayout";
import { ChatBlockMarkdown } from "../../../../shared/chatBlockMarkdownUi";
import { renderChatInlineMarkdown } from "../../../../shared/chatInlineMarkdownUi";
import { communityJoinUrl, useWebCommunityFrame } from "../controllers/useWebCommunityFrame";
import { WebCommunityCard, WebCommunityUpcomingEvents } from "./WebCommunityAside";
import { WebCommunitySalesPage } from "./WebCommunitySalesPage";
import { useWebSalesPageDraft } from "../controllers/useWebSalesPageDraft";

type PublicCommunityStats = Pick<WebPublicCommunityRecord, "member_count" | "online_count" | "admin_count">;

// Members see the same sales page visitors land on, read from the same public
// queries, so the owner checks their funnel from inside the community. The
// card's button invites instead of joining.
function WebCommunityAboutSalesPage() {
  const frame = useWebCommunityFrame();
  const slug = frame.community?.slug ?? null;
  const [loaded, setLoaded] = useState<{
    slug: string;
    community: WebPublicCommunityRecord;
    plan: PublicPlanSummary | null;
    stats: PublicCommunityStats | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  // The owner edits the page where it sits; the changes go to the layout draft
  // until Publish, and the page shows the draft while editing.
  const [editing, setEditing] = useState(false);
  const [published, setPublished] = useState(0);
  const draft = useWebSalesPageDraft({
    communityId: frame.community?.id ?? null,
    session: frame.session,
    enabled: editing && frame.canEditSalesPage,
  });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void Promise.all([
      resolveCloudPublicFunnel<unknown, WebPublicCommunityRecord, PublicPlanSummary>({ communitySlug: slug }),
      fetchCloudPublicFunnelStats<unknown, PublicCommunityStats>({ communitySlug: slug }).catch(() => null),
    ])
      .then(([funnel, stats]) => {
        if (cancelled || !funnel?.ok || !funnel.community) return;
        setLoaded({
          slug,
          community: funnel.community,
          plan: funnel.active_plan ?? null,
          stats: stats?.ok ? stats.community ?? null : null,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug, published]);

  const current = loaded && loaded.slug === slug ? loaded : null;
  if (!current) {
    return (
      <div className="community-tab-scroll">
        <div className="community-interaction-loading web-skeleton-pill" aria-hidden="true" />
      </div>
    );
  }
  const community = { ...current.community, ...current.stats };
  const joinUrl = communityJoinUrl(slug);
  const invite = async () => {
    if (!joinUrl || !frame.onCopyJoinLink) return;
    await frame.onCopyJoinLink(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const renderModel = buildCommunityFunnelRenderModel({
    communityName: community.name,
    oneLiner: community.one_liner,
    about: community.about,
    funnel: community.funnel,
  });
  const draftAbout = editing ? draft.state?.draft.pages.about ?? null : null;
  const fallbackText = (renderModel.mode === "custom" ? renderModel.longFormMarkdown : null)
    ?? (String(community.about ?? "").trim() || String(community.one_liner ?? "").trim());
  const publishDraft = async () => {
    if (await draft.publish()) {
      setPublished((n) => n + 1);
      setEditing(false);
    }
  };
  const status = draft.busy
    ? "Saving…"
    : draft.error
      ? draft.error
      : draft.pageChanged
        ? draft.otherChanges
          ? "Draft saved. Publish also sends your other layout changes (tabs, navigation) live."
          : "Draft saved. Visitors see the live page until you publish."
        : draft.otherChanges
          ? "This page is live. Other layout changes are waiting to publish."
          : "Everything is live.";

  return (
    <div className="community-tab-scroll">
      {frame.canEditSalesPage ? (
        <div className={`community-sales-edit-bar${editing ? " is-editing" : ""}`} role="toolbar" aria-label="Edit this page">
          {editing ? (
            <>
              <span className="community-sales-edit-status" role="status">{draft.state ? status : draft.error ?? "Loading…"}</span>
              {draftAbout ? (
                <label className="community-sales-edit-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={draftAbout.show_members}
                    disabled={draft.busy}
                    onChange={(event) => void draft.saveAbout({ show_members: event.target.checked })}
                  />
                  Member count
                </label>
              ) : null}
              {draft.pageChanged ? (
                <button type="button" className="community-sales-edit-button" disabled={draft.busy} title="Put this page back as it is live" onClick={() => void draft.discard()}>
                  <RotateCcw size={14} aria-hidden="true" /> Discard
                </button>
              ) : null}
              <button type="button" className="community-sales-edit-link" onClick={() => frame.onSelectTab("settings")}>More settings</button>
              <button type="button" className="community-sales-edit-button" onClick={() => setEditing(false)}>Done</button>
              <button
                type="button"
                className="community-sales-edit-button is-primary"
                disabled={draft.busy || !draft.state?.hasUnpublishedChanges}
                onClick={() => void publishDraft()}
              >
                Publish
              </button>
            </>
          ) : (
            <>
              <span className="community-sales-edit-status">This is your sales page. Visitors see it at your public link.</span>
              <button type="button" className="community-sales-edit-button is-primary" onClick={() => setEditing(true)}>
                <Pencil size={14} aria-hidden="true" /> Edit page
              </button>
            </>
          )}
        </div>
      ) : null}
      <WebCommunitySalesPage
        community={community}
        plan={current.plan}
        renderModel={renderModel}
        media={draftAbout?.media ?? community.about_media ?? []}
        text={draftAbout ? draftAbout.text : community.about_text ?? ""}
        showMembers={draftAbout ? draftAbout.show_members : community.about_show_members !== false}
        edit={draftAbout ? {
          busy: draft.busy,
          saveMedia: (media) => draft.saveAbout({ media }),
          saveText: (text) => draft.saveAbout({ text }),
          uploadImage: draft.uploadImage,
          fallbackText,
        } : null}
        address={joinUrl ? joinUrl.replace(/^https?:\/\//, "") : null}
        action={
          <div className="community-sales-join">
            {frame.canInvite && joinUrl && frame.onCopyJoinLink ? (
              <button type="button" className="community-sales-join-button" onClick={() => void invite()}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
                {copied ? "Invite link copied" : "Invite people"}
              </button>
            ) : (
              <p className="community-sales-join-note">You're a member</p>
            )}
            {joinUrl ? (
              <a className="community-aside-link community-sales-join-note" href={joinUrl} target="_blank" rel="noreferrer">
                See it as a visitor <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        }
      />
    </div>
  );
}

// The About tab: the community's own description, from the same fields as its
// public page (Settings > Community), shown inside the community for members.
// The public page stays the place visitors join from.
export function WebCommunityAboutPage() {
  const layout = useActiveCommunityLayout();
  if (layout.pages.about.presentation === "funnel") return <WebCommunityAboutSalesPage />;
  return <WebCommunityAboutCard />;
}

function WebCommunityAboutCard() {
  const frame = useWebCommunityFrame();
  const community = frame.community;
  if (!community) return null;
  const about = String(community.about ?? "").trim();
  const publicUrl = communityJoinUrl(community.slug);
  return (
    <div className="community-tab-scroll">
      <div className="community-about-page">
        <article className="community-about-main community-aside-card">
          {community.banner_url ? (
            <div className="community-about-banner">
              <img
                src={community.banner_url}
                alt=""
                style={{ objectPosition: `${(community.banner_focus_x ?? 0.5) * 100}% ${(community.banner_focus_y ?? 0.5) * 100}%` }}
              />
            </div>
          ) : null}
          <div className="community-about-body">
            <h1 className="community-about-title">{community.name}</h1>
            {community.one_liner ? <p className="community-about-one-liner">{community.one_liner}</p> : null}
            {about ? (
              <div className="community-about-text">
                <ChatBlockMarkdown
                  text={about}
                  renderInline={(text) => renderChatInlineMarkdown(text, { allowLabeledLinks: true })}
                />
              </div>
            ) : (
              <p className="community-aside-empty">The owner hasn't written an About section yet.</p>
            )}
            {publicUrl ? (
              <a className="community-aside-link community-about-public-link" href={publicUrl} target="_blank" rel="noreferrer">
                View the public page <ExternalLink size={14} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </article>
        <div className="community-about-side">
          <WebCommunityCard />
          <WebCommunityUpcomingEvents />
        </div>
      </div>
    </div>
  );
}
