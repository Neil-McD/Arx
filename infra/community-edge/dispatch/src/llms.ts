// The builder doc served at /__polynet/llms.txt: everything an AI (or a person)
// needs to build this community's front end on Polynet. Kept beside the SDK so
// they change together.
export const LLMS_TXT = String.raw`# Polynet community front end

You are building the website of one community that runs on Polynet. Polynet
hosts everything hard: accounts, members, permissions, payments, posts,
events, courses, memory and the community's AI agent. Your site is the look
and the experience. It is a static site (HTML, CSS, JavaScript) served on the
community's own domain, and it talks to Polynet only through the SDK below.

## Load the SDK

    <script type="module">
      import polynet from "/__polynet/sdk.js";
      const session = await polynet.session();
    </script>

Always call polynet.session() first. Paths, sign-in state and live updates come
from it. Errors throw PolynetError with .code and .status.

## Sign-in and joining

- session() returns { signed_in, community, join_url, live }.
- signIn(returnPath?) sends the member to Polynet and back, signed in. If they
  already use Polynet, it is one quick redirect.
- signOut().
- A visitor who is on Polynet but not a member comes back to "/?polynet=join".
  Show a "Join" link to session.join_url (opens Polynet's join page: free,
  approval or paid), then a "Sign in" button.
- Everything except session() and signIn() needs a signed-in member. On
  code "sign_in_required", show sign-in.

## Chat

- channels() -> [{ slug, name, path, isGeneral, canPost }]
- feed(channelSlug) -> posts, oldest first. Each post has: ref, path, snippet,
  snippet_truncated, actor { type, display_name, handle, avatar_url },
  reactions [{ emoji, count }], reacted_by_me [emoji], by_me, reply_count,
  edited_at, attachments [{ ref, name, kind, mime, size }], created_at.
- thread(channelSlug, post.ref) -> the post, then its replies.
- post(channelSlug, text, { replyTo: post.ref, files: [File], askAgent: true })
  posts or replies. askAgent asks the community agent to answer in the channel.
- edit(post, text) and remove(post) work only on the member's own posts
  (by_me). Members cannot edit posts the agent made for them.
- react(ref, emoji, on) sets the member's reaction (on: true adds, false removes).
- fileUrl(attachment) -> a URL for <img src> (images) or a download link.
- watch(channelSlug, onChange) -> stop(). onChange runs whenever anything in
  the channel changes; call feed() again then. Use it instead of polling.

Author labels: actor.type "human" is a member. actor.type "community_agent" is
the community's agent; when it has a display_name it acted for that member:
show "<Community> agent · for <name>".

## Events, courses, knowledge

- events() -> upcoming events: title, description_md, starts_at (ISO),
  starts_at_zoned, timezone, location_label, url, recurrence_frequency.
- resources(path?) -> courses (kind "directory") and lessons (kind
  "document"). Pass a course's path to list its lessons.
- readText(entry) -> a lesson's or memory's text (markdown).
- knowledge(query?) -> what the community knows: top memories, or a search.
  Each has title, type, grade, applies_when.

## The community agent

Each community has one AI agent. Members talk to it privately:
- agentHistory() -> [{ role: "user" | "assistant", text, created_at }]
- askAgent(text, { onDelta(textSoFar) }) -> the full reply, streamed.
It is the same conversation the member has on the community's Agent page in
Polynet. In channels, post(..., { askAgent: true }) asks it publicly.

## Rules

- The member's session is an HttpOnly cookie you never see or handle. Never
  ask for passwords or tokens, and never store them.
- The site acts as the signed-in member, inside this community, with member
  powers only. Admin, settings, analytics, billing and direct messages stay in
  Polynet Studio; link there instead of rebuilding them.
- Do not call Polynet servers directly. Use the SDK; everything goes through
  /__polynet/ on this domain.
- Escape everything you render from Polynet (set textContent, not innerHTML).
- Lower-level access, if you need it: polynet.door.list/read/search/write/call
  over the community's paths (see /communities/<slug>/ via door.list).

## Example: a minimal live feed

    <ul id="feed"></ul>
    <form id="say"><input id="text"><button>Post</button></form>
    <script type="module">
      import polynet from "/__polynet/sdk.js";
      const s = await polynet.session();
      if (!s.signed_in) { polynet.signIn(); }
      const general = (await polynet.channels()).find((c) => c.isGeneral);
      async function render() {
        const posts = await polynet.feed(general.slug);
        document.getElementById("feed").replaceChildren(...posts.map((p) => {
          const li = document.createElement("li");
          li.textContent = (p.actor.display_name ?? "Member") + ": " + p.snippet;
          return li;
        }));
      }
      await polynet.watch(general.slug, render);
      document.getElementById("say").onsubmit = async (e) => {
        e.preventDefault();
        await polynet.post(general.slug, document.getElementById("text").value);
        document.getElementById("text").value = "";
      };
    </script>
`;
