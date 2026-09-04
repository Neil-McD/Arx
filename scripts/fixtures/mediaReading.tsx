import React from "react";
import { createRoot } from "react-dom/client";
import { InteractionContent, InteractionAttachments } from "../../apps/web/src/components/communityInteractionFeed";
import { WebDirectMessagePanel } from "../../apps/web/src/components/WebDirectMessagePanel";
import { renderTextWithLinks } from "../../shared/linkEmbedUi";
import "../../apps/web/src/index.css";

const pdf = { id: "pdf", name: "Community welcome guide.pdf", type: "file" as const, mime: "application/pdf", size: 1000, url: "https://media.example.test/guide.pdf" };
const text = "Two things to watch before our next session:\nhttps://youtu.be/jNQXAC9IVRw\nhttps://youtu.be/M7lc1UVf-VE";
const images = Array.from({ length: 5 }, (_, i) => ({ id: `image-${i}`, name: `Workshop ${i + 1}`, type: "image" as const, mime: "image/svg+xml", size: 100, url: `https://media.example.test/image-${i}.svg` }));
const now = new Date().toISOString();
const mode = new URLSearchParams(location.search).get("mode");
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
  {mode === "dm" ? <div className="dm-review"><WebDirectMessagePanel
    conversation={{ id: "review", kind: "direct", created_from_community: null, last_seq: 2, viewer_last_read_seq: 2, unread_count: 0, has_unread: false, last_message_preview: null, last_message_at: now, created_at: now, updated_at: now, participants: [
      { id: "me", participant_type: "user", user_id: "me", display_name: "You", avatar_url: null, status: "active", last_read_seq: 2 },
      { id: "builder", participant_type: "user", user_id: "builder", display_name: "Community builder", avatar_url: null, status: "active", last_read_seq: 2 },
    ] }}
    messages={[
      { id: "m1", conversation_id: "review", seq: 1, sender_type: "user", sender_user_id: "builder", content_json: { text, attachments: [pdf] }, created_at: now, updated_at: now },
      { id: "m2", conversation_id: "review", seq: 2, sender_type: "user", sender_user_id: "me", content_json: { text: "Here is the PDF link too: https://media.example.test/guide.pdf" }, created_at: now, updated_at: now },
    ]}
    input="" isLoading={false} isSending={false} error={null} attachments={[]} typingPresence={{ users: [], total_count: 0 }} sessionUserId="me"
    getInitials={() => "CB"} getAvatarColor={() => "#555"} renderTextWithLinks={renderTextWithLinks} onInputChange={() => {}} onSend={() => {}}
  /></div> : <main className="review">
    <h1>Community media</h1><p>Local review · actual message components · fixture content</p>
    <article><h2>Two YouTube links in one message</h2><InteractionContent text={text} renderTextWithLinks={renderTextWithLinks} /></article>
    <article><h2>Five images in one message</h2><InteractionAttachments attachments={images} /></article>
    <article><h2>PDF attachment</h2><InteractionAttachments attachments={[pdf]} /></article>
    <article><h2>Pasted PDF link</h2><InteractionContent text="Read this before joining: https://media.example.test/guide.pdf" renderTextWithLinks={renderTextWithLinks} /></article>
    <article><h2>Unavailable PDF</h2><InteractionContent text="https://media.example.test/unavailable.pdf" renderTextWithLinks={renderTextWithLinks} /></article>
  </main>}
</>);
