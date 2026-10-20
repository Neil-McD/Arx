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

Always await polynet.session() first: every other call builds on it.

## Who is here

session() -> {
  signed_in,         // true when a member is signed in
  community,         // the community's slug, e.g. "dawn-patrol"
  community_name,    // its display name, e.g. "Dawn Patrol Run Club" (null when signed out)
  member,            // { name, handle, avatar_url, role } when signed in, else null
                     // role: "owner", "admin", "moderator" or "member"
  join_url,          // Polynet's join page for this community
  live               // used by watch(); ignore it
}

- Signed out: show the community's public face, a "Sign in" button that calls
  polynet.signIn(), and a "Join" link to session.join_url.
- signIn(returnPath?) sends the visitor to Polynet and back here signed in.
  For someone already on Polynet it is one quick redirect.
- Someone on Polynet who is not a member yet comes back to "/?polynet=join",
  still signed out. Show "Join" (session.join_url opens the join page: free,
  approval or paid), then "Sign in" again once they have joined.
- signOut() signs out and refreshes session().
- polynet.community() -> { name, slug } (the same name as community_name).

## Errors

Failed calls throw PolynetError with .code, .message and .status. Codes:
- sign_in_required (status 401): the member is signed out or the session
  expired. Show sign-in. session() then reads signed_in: false.
- not_ready: you called something before awaiting session().
- upload_failed, live_unavailable, agent_unavailable, agent_failed: show
  .message and let the member retry.
- any other code (for example a permission or rate limit): show .message.

## Chat

- channels() -> [{ slug, name, path, isGeneral, canPost }]. Use the one with
  isGeneral as the default. Hide the composer when canPost is false.
- feed(channelSlug, { limit }) -> the newest posts (default 50), oldest first
  (chat order; reverse() for newest-first). Older history isn't pageable yet.
- thread(channelSlug, post.ref) -> the post, then its replies, oldest first.

Each post or reply has:
  ref                 // "interaction:root:<id>" or "interaction:reply:<id>"
  path
  text                // the whole text (markdown); render this
  snippet             // the first 500 characters; snippet_truncated says if cut
  actor               // { type, display_name, handle, avatar_url }
  reactions           // [{ emoji, count }]
  reacted_by_me       // [emoji]
  by_me               // posted by or for the signed-in member: they may remove() it
  can_edit            // they may edit() it (their own words only)
  reply_count         // a number (0 on replies)
  root_ref            // on replies: the ref of their post
  attachments         // [{ ref, name, kind, mime, size }], kind "image" | "video" | "file"
  edited_at           // ISO time or null
  created_at          // ISO time

Writing:
- post(channelSlug, text, { replyTo: post.ref, files: [File], askAgent: true })
  posts, or replies when replyTo is set. Returns { ref, path, ... }.
  askAgent asks the community agent to answer in the channel; Polynet puts
  "@<community name> " in front of the text, which is how agent mentions read
  everywhere.
- edit(post, text) when post.can_edit; remove(post) when post.by_me.
- react(ref, emoji, on) adds (on: true) or removes (on: false) the member's
  reaction on a post or reply. Returns { reacted, reaction_summary }.
- fileUrl(attachment) -> a URL for <img src>, <video src> or a download link.

Live updates:
- const stop = await watch(channelSlug, onChange). onChange runs once right
  away and again whenever anything in the channel changes (posts, replies,
  edits, deletes, reactions): call feed() or thread() again then. Use it
  instead of polling. Needs a signed-in member. Everything the SDK loads comes
  from this domain, so a Content-Security-Policy of 'self' works.

Authors: actor.type "human" is a member. "community_agent" is the community's
agent; when it has a display_name it acted for that member. Label it
"<community_name> agent · for <display_name>", and show an agent mark of your
own rather than avatar_url (which is the member's).

## Events, courses, knowledge

- events({ limit }) -> upcoming events (default 20). Fields: title,
  description_md, starts_at and ends_at (ISO), timezone (IANA name),
  location_type ("online", "physical" or "tbd"), location_label, url (a link the
  organizer set, or null), recurrence_frequency, recurrence_interval.
  Show times with new Date(starts_at).toLocaleString(undefined, { timeZone:
  timezone }). Ignore starts_at_zoned (not readable by Date). No RSVP yet.
- resources(path?) -> courses (kind "directory") and lessons (kind
  "document"). Pass a course's path to list its lessons.
- readText(entry) -> the text of a lesson, a memory or a post (markdown).
- knowledge(query?) -> what the community knows: top memories, or a search.
  Each has title, type, grade, applies_when.

## The community agent

Each community has one AI agent. Members talk to it privately:
- agentHistory() -> [{ role: "user" | "assistant", text, created_at }]
- askAgent(text, { onDelta(textSoFar) }) -> the full reply (markdown).
  The reply streams: onDelta runs with the text so far as the agent writes.
  The agent may use tools first, so the first words can take a few seconds:
  show a "thinking" state until onDelta first runs. Render the last onDelta
  (or the resolved reply) as the answer; it replaces anything shown before.
It is the same conversation the member has on the community's Agent page in
Polynet. In channels, post(..., { askAgent: true }) asks it publicly.

## Rendering

- Escape everything you render from Polynet: set textContent, never
  innerHTML with Polynet text.
- Post text, agent replies and descriptions are markdown. Show them as plain
  text, or convert with a markdown library and sanitize the HTML (for
  example marked + DOMPurify) before inserting it.

## Rules

- The member's session is an HttpOnly cookie you never see or handle. Never
  ask for passwords or tokens, and never store them.
- The site acts as the signed-in member, inside this community, with member
  powers only. Admin, settings, analytics, billing and direct messages stay in
  Polynet Studio; link there instead of rebuilding them.
- Do not call Polynet servers directly. Use the SDK; everything goes through
  /__polynet/ on this domain.
- Lower-level access, if you need it: polynet.door.list/read/search/write/call
  over the community's paths (start with door.list("/communities/" +
  session.community + "/")). door.read bodies can be JSON even when the path
  ends in .md: prefer readText().

## Deploy

The site is a folder of static files with an index.html. From that folder:

    npx polynet-cli deploy --community <community-slug>

The first run opens the browser to sign in with Polynet (the community's owner
or an admin) and saves the community in polynet.json, so later deploys are just
"npx polynet-cli deploy". Only changed files upload. The site is live at
https://<community-slug>.polynet.page within a minute. Every path that isn't a
file serves index.html, so client-side routes work. No server code runs:
everything dynamic comes from the SDK.

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
          li.textContent = (p.actor.display_name ?? "Member") + ": " + p.text;
          return li;
        }));
      }
      await polynet.watch(general.slug, render); // renders now, then on every change
      document.getElementById("say").onsubmit = async (e) => {
        e.preventDefault();
        await polynet.post(general.slug, document.getElementById("text").value);
        document.getElementById("text").value = "";
      };
    </script>
`;
