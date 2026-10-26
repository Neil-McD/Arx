// The builder doc, served at https://polynet.page/llms.txt (the front door) and
// /__polynet/llms.txt on every community site: everything an AI (or a person)
// needs to build and deploy a community's front end. Kept beside the SDK so
// they change together.
export const LLMS_TXT = String.raw`# Polynet community front end

You are building the website of one community that runs on Polynet. Polynet
hosts everything hard: accounts, members, permissions, payments, posts,
events, courses, memory and the community's AI agent. Your site is the look
and the experience. It is a static site (HTML, CSS, JavaScript) served on the
community's own domain, and it talks to Polynet only through the SDK below.

## Workflow (start here)

1. Know the community's slug: it is in the community's Polynet address
   (.../c/<slug>). The person deploying must be its owner or an admin.
2. Design first (the next section): learn the community's world, show the
   founder three directions, build the one they choose.
3. Build the site in a folder with an index.html, and test it live. The SDK
   is served by the site's own address, so it only works once deployed.
   From the folder:

       npx @polynet/cli deploy --community <slug>

   Then open https://<slug>.polynet.page. A deploy takes seconds: change,
   deploy, refresh, repeat. The first deploy opens a browser to sign in with
   Polynet; later deploys reuse it.
4. Signed out, the site shows its public face. Sign in on the site to see
   member features.

Preview: during the preview, polynet.page sites run against Polynet's
staging environment.

## Design (before any code)

There is no template: every site starts from its community's own world. Aim
for the site members screenshot and send to friends. If it could be any
community's site, it isn't done.

1. Discover. Ask the founder once: who the members are and what brings them
   together; where and when it happens and what that looks and feels like;
   three words for the feeling and one thing it should feel like (a brand, a
   magazine, a place); any logo, photos, colors or phrases to use. Collect
   concrete nouns: "6:00 am, the river, coffee after".
2. Explore three directions that differ in kind: different type, color
   world, layout idea and voice. Make one feel risky. Give each a name, a
   one-sentence idea, typefaces, a palette, a signature move and real copy.
   Build each as one static page (concepts/a.html, b.html, c.html, each
   with the shell), deploy, and let the founder pick or mix.
3. Build the chosen one. Write each page's structure in HTML by hand and fill
   it with live data from JavaScript. Design the loading, empty, error and
   signed-out states in the concept's voice. Real words everywhere, never
   test data. Delete the concept pages.
4. Look at it at 390px and 1440px wide, twice: where is it timid (make the
   hierarchy louder), where is it noisy (remove), what is misaligned. Fix,
   deploy, look again.

Craft: typefaces with character (Google Fonts or Fontshare) used at
conviction-level scale (headlines at clamp(48px, 9vw, 140px) are normal); a
committed color world with one sharp accent; texture with meaning (a gradient
that is the dawn, grain, duotone photos, huge numerals); layouts with one
unapologetically huge element; purposeful motion inside
prefers-reduced-motion: no-preference; the community's own photos. Example
of the bar: Dawn Patrol Run Club, "the city before sunrise": a night-navy
page warming into an orange dawn gradient, Barlow Condensed at 88px,
"Early miles. Good people." over "Every weekday · 6:00 am · Riverside
boathouse", and stats like "Coffee after: Always". Bold and accessible are
the same craft; make it accessible as the final pass.

## Load the SDK

    <script type="module">
      import polynet from "/__polynet/sdk.js";
      const session = await polynet.session();
    </script>

Always await polynet.session() first: every other call builds on it.

## Who is here

session() -> {
  signed_in,           // true when a member is signed in
  community,           // the community's slug, e.g. "dawn-patrol"
  community_name,      // public: its display name, e.g. "Dawn Patrol Run Club"
  community_one_liner, // public: its one-line promise (or null)
  community_about,     // public: its longer description (or null)
  member_count,        // public: how many members it has
  member,              // { name, handle, avatar_url, role } when signed in, else null
                       // role: "owner", "admin", "moderator" or "member"
  join_url,            // Polynet's join page for this community
  studio_url,          // where owners and admins manage it in Polynet Studio
  live                 // used by watch(); ignore it
}

What works signed out: session() (with the public fields above) and
community(). Everything else (channels, posts, events, courses, knowledge,
the agent) needs a signed-in member and otherwise throws sign_in_required.

- Signed out: show the community's public face from the public fields, a
  "Sign in" button that calls polynet.signIn(), and a "Join" link to
  session.join_url. Anything else on the public page is yours to write.
- For an owner or admin (member.role), link to session.studio_url for what the
  site can't do: creating events and courses, settings, members, billing.
- signIn(returnPath?) sends the visitor to Polynet and back here signed in.
  For someone already on Polynet it is one quick redirect.
- Someone on Polynet who is not a member yet comes back to "/?polynet=join",
  still signed out. Show "Join" (session.join_url opens the join page: free,
  approval or paid), then "Sign in" again once they have joined.
- signOut() signs out and refreshes session().
- polynet.community() -> { name, slug } (the same name as community_name).

## The Polynet shell (required on every page)

Every community site shows the Polynet account control, so members can always
reach their account, their communities, Discover, messages and settings:

    <script type="module" src="/__polynet/ui.js"></script>
    <polynet-account></polynet-account>

Put it where your design wants it (usually the top-right of the header) and
keep it visible on every page and at every width. Signed out it shows "Join"
and "Sign in"; signed in, the member's avatar opens their account menu (with
"Manage this community" for owners and admins, and "Your communities", which
opens Polynet). Don't rebuild these yourself.

Polynet adds the ui.js script to every page that doesn't load it, and if a
page has no <polynet-account> shortly after it loads, ui.js puts one in the
top-right corner. That fallback is a safety net, not a design: place the
shell yourself.

Style it from your CSS to match the site; its structure and keyboard behavior
are Polynet's:

    polynet-account {
      --polynet-accent: #c2410c;     /* buttons, focus rings, initials */
      --polynet-on-accent: #fff;     /* text on the accent */
      --polynet-surface: #111;       /* menu background (default: Canvas) */
      --polynet-text: #f5f5f4;       /* menu text (default: CanvasText) */
      --polynet-radius: 12px;
      --polynet-font: inherit;
    }

It takes the page's font unless --polynet-font says otherwise. Keep
text/background contrast at least 4.5:1. Add align="start" if it sits at
the left edge. polynet.account() returns what the menu shows, for this
community only: { member { name, handle, avatar_url }, community { slug,
name, role, studio_url }, links { communities, discover, settings, messages } }.
The member's other communities are never readable from a site.

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
  actor               // { type, display_name, handle, avatar_url, user_id, agent_key }
                      // all keys always present; the agent's name fields are null
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
  everywhere. Editing that post later doesn't ask the agent again; keep the
  prefix in the edit box.
- edit(post, text) when post.can_edit; remove(post) when post.by_me.
- react(ref, emoji, on) adds (on: true) or removes (on: false) the member's
  reaction on a post or reply. Returns { reacted, reaction_summary }.
- fileUrl(attachment) -> a URL for <img src>, <video src> or a download link.

Live updates:
- const stop = await watch(channelSlug, onChange). onChange runs once right
  away and again whenever anything in the channel changes (posts, replies,
  edits, deletes, reactions): call feed() or thread() again then. Use it
  instead of polling. Needs a signed-in member. When the session ends
  (signed out elsewhere, expired), onChange runs once more and the re-read
  throws sign_in_required: show sign-in then.
- Content-Security-Policy: scripts, styles and the SDK's connections come from
  this domain ('self'), but avatar_url images come from Polynet's storage
  host, so allow img-src 'self' https:.

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
- members() -> [{ name, role, ref, path }], role "owner", "admin",
  "moderator" or "member".
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
- Post text, agent replies and descriptions are markdown: render them with
  polynet.markdown(text), which returns safe DOM nodes (a DocumentFragment)
  to append. It handles paragraphs, headings, lists, quotes, code, bold,
  italic and https links, and never interprets HTML.

## Rules

- The member's session is an HttpOnly cookie you never see or handle. Never
  ask for passwords or tokens, and never store them.
- The site acts as the signed-in member, inside this community, with member
  powers only. Admin, settings, analytics, billing and direct messages stay in
  Polynet Studio; link there instead of rebuilding them.
- Do not call Polynet servers directly. Use the SDK; everything goes through
  /__polynet/ on this domain, and only this site's own pages can call it
  (another site gets 403 cross_site_request).
- Lower-level access, if you need it: polynet.door.list/read/search/write/call
  over the community's paths (start with door.list("/communities/" +
  session.community + "/")). door.read bodies can be JSON even when the path
  ends in .md: prefer readText().

## Deploy

The site is a folder of static files with an index.html. From that folder:

    npx @polynet/cli deploy --community <community-slug>

The first run opens the browser to sign in with Polynet (the community's owner
or an admin) and saves the community in polynet.json, so later deploys are just
"npx @polynet/cli deploy".

Every deploy checks the site first ("npx @polynet/cli check" runs the same
checks alone). These stop a deploy until fixed: a page without
<html lang>, a <title> or a viewport that allows zooming; an <img> without
alt; a button or link with no text or aria-label. Warnings (unlabelled
fields, removed focus outlines, animation without prefers-reduced-motion,
innerHTML, positive tabindex) are printed but don't stop it.

Only changed files upload. The site is live at
https://<community-slug>.polynet.page within a minute. Opening or refreshing
any path in the browser serves index.html, so client-side routes (/events)
work; a script's fetch() of a path that isn't a file gets 404. No server code
runs: everything dynamic comes from the SDK.

Using a bundler (Vite, Rollup, esbuild): the SDK and shell are served by the
site, so mark /__polynet/ imports external, never bundle them. For Vite:

    // vite.config.js
    export default { build: { rollupOptions: { external: [/^\/__polynet\//] } } };

Then deploy the build folder: "npx @polynet/cli deploy dist". polynet.json
stays in the project folder (the one you run the command from), so a clean
build doesn't lose it. If the bundler moves the ui.js script into its own
bundle, that's fine: Polynet adds it to every page anyway.

Skills for AI agents: "npx @polynet/cli create --community <slug>" sets up a
folder (no template) with AGENTS.md, CLAUDE.md and Polynet's skills
(polynet-build-site, polynet-design, polynet-sdk, polynet-accessibility,
polynet-deploy-verify); "npx @polynet/cli skills" adds or updates them in any
folder. AGENTS.md, CLAUDE.md, polynet.json and dotfolders are never uploaded.

If your agent can't run commands (for example claude.ai or ChatGPT with the
Polynet MCP connected), it can deploy through the MCP instead: polynet_call
community.site.deploy with input.files as "/path" -> { content, encoding }
("utf8", or "base64" for images and fonts), including /index.html, up to 200
files and 5 MB. The same checks run there (site_checks_failed lists what to
fix). The result has the live url.

## Example: a minimal live feed

This shows behavior only. The markup and the look are yours to design.

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
          li.append((p.actor.display_name ?? "Member") + ": ", polynet.markdown(p.text));
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
