import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { InteractionContent, InteractionAttachments } from "../../apps/web/src/components/communityInteractionFeed";
import { WebDirectMessagesHost } from "../../apps/web/src/components/WebDirectMessagesHost";
import { WebCommunityResourceViewerContent } from "../../apps/web/src/components/WebCommunityResourceViewerContent";
import { CommunityPinnedRootSurface } from "../../apps/web/src/components/CommunityPinnedRootSurface";
import { communityInteractionRootHasRichContent } from "../../apps/web/src/components/WebCommunityInteractionProjection";
import { renderTextWithLinks } from "../../shared/linkEmbedUi";
import "../../apps/web/src/index.css";

import { pdf, text, images } from "./mediaReadingData";
const mode = new URLSearchParams(location.search).get("mode");
const session = { access_token: "local-fixture-only", user: { id: "me" } };
const openConversationRequest = { requestId: 1, conversationId: "review" };
function DirectMessageReview() {
  const [open, setOpen] = useState(true);
  return <div className="dm-review">
    <button className="direct-messages-topbar-button" onClick={() => setOpen(true)}>Open conversation</button>
    <button className="outside-dm">Outside conversation</button>
    <output aria-label="Conversation state">{open ? "Open" : "Closed"}</output>
    <WebDirectMessagesHost isOpen={open} mobileRoot={mode === "dm-mobile"} openRequest={null}
      openConversationRequest={openConversationRequest} session={session} sessionUserId="me"
      getInitials={() => "CB"} getAvatarColor={() => "#555"} renderTextWithLinks={renderTextWithLinks}
      onClose={() => setOpen(false)} />
  </div>;
}
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") || "dark";
createRoot(document.getElementById("root")!).render(<>
  <style>{`
    html, body, #root { height:auto; min-height:100%; overflow:auto; }
    body { background:var(--bg-workspace); color:var(--text-primary); }
    .review { max-width:1008px; margin:30px auto; padding:20px; }
    .review h1 {font-size:24px;} .review article {padding:24px 0; border-bottom:1px solid #383838;}
    .review h2 {font-size:14px; color:#aaa; margin:0 0 16px;} .review > p {color:#aaa;}
    .review .community-interaction-body {white-space:normal;}
  `}</style>
  {mode === "surfaces" ? <SurfaceReview /> : mode === "performance" ? <PerformanceReview /> : mode?.startsWith("dm") ? <DirectMessageReview /> : <main className="review">
    <h1>Community media</h1><p>Local review · actual message components · fixture content</p>
    <article><h2>Two YouTube links in one message</h2><InteractionContent text={text} renderTextWithLinks={renderTextWithLinks} /></article>
    <article><h2>Five images in one message</h2><InteractionAttachments attachments={images} /></article>
    <article><h2>PDF attachment</h2><InteractionAttachments attachments={[pdf]} /></article>
    <article><h2>Pasted PDF link</h2><InteractionContent text="Read this before joining: https://media.example.test/guide.pdf" renderTextWithLinks={renderTextWithLinks} /></article>
    <article><h2>Unavailable PDF</h2><InteractionContent text="https://media.example.test/unavailable.pdf" renderTextWithLinks={renderTextWithLinks} /></article>
    <article><h2>Slow PDF</h2><InteractionContent text="https://media.example.test/stalled.pdf" renderTextWithLinks={renderTextWithLinks} /></article>
  </main>}
</>);
function PerformanceReview() {
  const [revision, setRevision] = useState(0);
  return <main className="review"><button onClick={() => setRevision(revision + 1)}>Rerender {revision}</button>
    {Array.from({ length: 20 }, (_, i) => <article key={i}><h2>Video message {i + 1}</h2>
      <InteractionContent text={`https://youtu.be/${i % 2 ? "M7lc1UVf-VE" : "jNQXAC9IVRw"}?t=12`} renderTextWithLinks={renderTextWithLinks} />
    </article>)}
  </main>;
}

function SurfaceReview() {
  const [opened, setOpened] = useState(false);
  const pinText = "Read https://media.example.test/guide.pdf";
  const bundle = { attachments: [], content_blocks: [], root: { content_summary: pinText } } as unknown as Parameters<typeof communityInteractionRootHasRichContent>[0];
  return <main className="review">
    <h1>Shared media surfaces</h1>
    <CommunityPinnedRootSurface hasRichContent={communityInteractionRootHasRichContent(bundle)} selected={false} canUnpin={false} isUnpinning={false} openLabel="Open pinned post" onUnpin={() => {}} onOpen={() => setOpened(true)}>
      <InteractionContent text={pinText} renderTextWithLinks={renderTextWithLinks} />
    </CommunityPinnedRootSurface>
    {opened ? <article aria-label="Opened pinned post"><InteractionContent text={pinText} renderTextWithLinks={renderTextWithLinks} /></article> : null}
    <article aria-label="Reply"><InteractionContent text={text} renderTextWithLinks={renderTextWithLinks} /></article>
    <article aria-label="Resource"><WebCommunityResourceViewerContent resource={{
      id: "fixture-resource", module_id: null, directory_uri: "", directory_path: "", type: "embed",
      resource_role: "page", resource_status: "published", title: "YouTube resource", body_md: null,
      url: "https://youtu.be/M7lc1UVf-VE?t=12", pinned: false, sort_order: 0, created_at: "2026-09-04T12:00:00.000Z",
    }} /></article>
  </main>;
}
