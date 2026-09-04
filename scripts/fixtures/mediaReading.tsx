import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { InteractionContent, InteractionAttachments } from "../../apps/web/src/components/communityInteractionFeed";
import { WebDirectMessagesHost } from "../../apps/web/src/components/WebDirectMessagesHost";
import { renderTextWithLinks } from "../../shared/linkEmbedUi";
import "../../apps/web/src/index.css";

import { pdf, text } from "./mediaReadingData";
const images = Array.from({ length: 5 }, (_, i) => ({ id: `image-${i}`, name: `Workshop ${i + 1}`, type: "image" as const, mime: "image/svg+xml", size: 100, url: `https://media.example.test/image-${i}.svg` }));
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
document.documentElement.dataset.theme = "dark";
createRoot(document.getElementById("root")!).render(<>
  <style>{`
    html, body, #root { height:auto; min-height:100%; overflow:auto; }
    body { background:#181818; color:#eee; font-family:Arial,sans-serif; --bg-panel:#202020; --bg-card:#252525; --bg-workspace:#181818; --border-default:#424242; --text-primary:#eee; --text-muted:#aaa; --chat-link:#80b8ff; }
    .review { max-width:740px; margin:30px auto; padding:20px; }
    .review h1 {font-size:24px;} .review article {padding:24px 0; border-bottom:1px solid #383838;}
    .review h2 {font-size:14px; color:#aaa; margin:0 0 16px;} .review > p {color:#aaa;}
    .review .community-interaction-body {white-space:normal;}
    .dm-review .community-dm-panel { position:relative; inset:auto; width:min(680px,100%); height:850px; max-height:none; margin:20px auto; }
  `}</style>
  {mode?.startsWith("dm") ? <DirectMessageReview /> : <main className="review">
    <h1>Community media</h1><p>Local review · actual message components · fixture content</p>
    <article><h2>Two YouTube links in one message</h2><InteractionContent text={text} renderTextWithLinks={renderTextWithLinks} /></article>
    <article><h2>Five images in one message</h2><InteractionAttachments attachments={images} /></article>
    <article><h2>PDF attachment</h2><InteractionAttachments attachments={[pdf]} /></article>
    <article><h2>Pasted PDF link</h2><InteractionContent text="Read this before joining: https://media.example.test/guide.pdf" renderTextWithLinks={renderTextWithLinks} /></article>
    <article><h2>Unavailable PDF</h2><InteractionContent text="https://media.example.test/unavailable.pdf" renderTextWithLinks={renderTextWithLinks} /></article>
    <article><h2>Slow PDF</h2><InteractionContent text="https://media.example.test/stalled.pdf" renderTextWithLinks={renderTextWithLinks} /></article>
  </main>}
</>);
