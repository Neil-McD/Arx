export const pdf = { id: "pdf", name: "Community welcome guide.pdf", type: "file" as const, mime: "application/pdf", size: 1000, url: "https://media.example.test/guide.pdf" };
export const text = "Two things to watch before our next session:\nhttps://youtu.be/jNQXAC9IVRw\nhttps://youtu.be/M7lc1UVf-VE";
export const images = Array.from({ length: 5 }, (_, i) => ({ id: `image-${i}`, name: `Workshop ${i + 1}`, type: "image" as const, mime: "image/svg+xml", size: 100, url: `https://media.example.test/image-${i}.svg` }));
const now = "2026-09-04T12:00:00.000Z";
export const conversation = {
  id: "review", kind: "direct", created_from_community: null, last_seq: 2, viewer_last_read_seq: 2,
  unread_count: 0, has_unread: false, last_message_preview: null, last_message_at: now, created_at: now, updated_at: now,
  participants: [
    { id: "me", participant_type: "user", user_id: "me", display_name: "You", avatar_url: null, status: "active", last_read_seq: 2 },
    { id: "builder", participant_type: "user", user_id: "builder", display_name: "Community builder", avatar_url: null, status: "active", last_read_seq: 2 },
  ],
};
export const messages = [
  { id: "m1", conversation_id: "review", seq: 1, sender_type: "user", sender_user_id: "builder", content_json: { text, attachments: [pdf] }, created_at: now, updated_at: now },
  { id: "m2", conversation_id: "review", seq: 2, sender_type: "user", sender_user_id: "me", content_json: { text: `${text}\nHere is the PDF link too: https://media.example.test/guide.pdf`, attachments: images }, created_at: now, updated_at: now },
];
