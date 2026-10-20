// app.js: the community site. Everything dynamic comes from the Polynet SDK
// (/__polynet/sdk.js); the guide is at https://polynet.page/llms.txt.
// Pages: / (public page or home), /chat/<channel>[/<post>], /events, /courses,
// /lesson?path=…, /knowledge, /note?path=…, /members, /agent.
import polynet from "/__polynet/sdk.js";
import { content } from "/content.js";
import { renderMarkdown } from "/md.js";

const REACTIONS = ["👍", "❤️", "😂", "🎉", "🔥", "👀"];
const app = document.getElementById("app");
const state = { session: null, channels: [], stopWatch: null, navOpen: false };

// ---------- small helpers ----------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function communityName() {
  return state.session?.community_name || "Community";
}

function link(href, props, ...children) {
  return el("a", { href, ...props, onclick: (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(href);
  } }, ...children);
}

function navigate(href) {
  history.pushState({}, "", href);
  state.navOpen = false;
  render();
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isBuilder() {
  const role = state.session?.member?.role;
  return role === "owner" || role === "admin";
}

function errorView(error) {
  if (error?.code === "sign_in_required") {
    polynet.session({ refresh: true }).then((session) => { state.session = session; render(); });
    return el("p", { class: "muted", text: "Your session ended. Signing you out…" });
  }
  return el("p", { class: "error-text", role: "alert", text: error?.message || "Something went wrong. Try again." });
}

// ---------- the public page (signed out) ----------

function renderPublic() {
  const session = state.session;
  const name = content.headline || communityName();
  const tagline = content.tagline || session.community_one_liner;
  const about = content.about || session.community_about;
  const joining = new URLSearchParams(location.search).get("polynet") === "join";
  document.title = communityName();
  return el("div", { class: "public" },
    el("header", { class: "public-bar" },
      el("span", { class: "masthead" }, el("span", { class: "monogram", "aria-hidden": "true", text: initials(communityName()) }),
        el("span", { class: "name", text: communityName() })),
      el("polynet-account")),
    el("main", { id: "main", tabindex: "-1" },
      el("section", { class: "hero", "aria-labelledby": "hero-title" },
        el("span", { class: "monogram large", "aria-hidden": "true", text: initials(communityName()) }),
        el("h1", { id: "hero-title", text: name }),
        tagline ? el("p", { class: "tagline", text: tagline }) : null,
        joining ? el("p", { class: "notice", text: "You're not a member yet. Join first, then sign in here." }) : null,
        el("div", { class: "actions" },
          session.join_url ? el("a", { class: "button", href: session.join_url, text: content.joinLabel }) : null,
          el("button", { class: "button quiet", type: "button", onclick: () => polynet.signIn(), text: "I'm a member, sign in" }),
          typeof session.member_count === "number" && session.member_count > 1
            ? el("span", { class: "muted count", text: session.member_count + " members" }) : null)),
      about ? el("section", { class: "about", "aria-label": "About" }, renderMarkdown(about)) : null,
      el("section", { class: "features", "aria-label": "What members get" },
        content.whatYouGet.map((item) => el("div", { class: "feature" }, el("h2", { text: item.title }), el("p", { class: "muted", text: item.text }))))),
    el("footer", { class: "footer", text: content.footer }));
}

// ---------- the member layout ----------

function route() {
  const parts = location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || "home", parts, query: new URLSearchParams(location.search) };
}

function sidebar(current) {
  const item = (href, label, active, prefix) => el("li", {}, link(href, {
    class: "nav-link", "aria-current": active ? "page" : null,
  }, prefix || null, el("span", { text: label })));
  return el("aside", { class: "sidebar", id: "sidebar", "aria-label": "Community navigation" },
    link("/", { class: "masthead" }, el("span", { class: "monogram", "aria-hidden": "true", text: initials(communityName()) }),
      el("span", { class: "name", text: communityName() })),
    el("nav", { "aria-label": "Sections" },
      el("ul", {},
        item("/", content.nav.home, current.name === "home"),
        item("/events", content.nav.events, current.name === "events"),
        item("/courses", content.nav.courses, current.name === "courses" || current.name === "lesson"),
        item("/knowledge", content.nav.knowledge, current.name === "knowledge" || current.name === "note"),
        item("/members", content.nav.members, current.name === "members"),
        item("/agent", content.nav.agent, current.name === "agent"))),
    el("nav", { "aria-label": content.nav.chat },
      el("p", { class: "group-label", text: content.nav.chat }),
      el("ul", {}, state.channels.map((channel) => item("/chat/" + encodeURIComponent(channel.slug), channel.name,
        current.name === "chat" && current.parts[1] === channel.slug, el("span", { class: "hash", "aria-hidden": "true", text: "#" }))))));
}

function topbar(title) {
  return el("header", { class: "topbar" },
    el("button", { class: "icon-button menu-button", type: "button", "aria-label": "Open navigation", "aria-controls": "sidebar",
      "aria-expanded": state.navOpen ? "true" : "false", onclick: () => { state.navOpen = !state.navOpen; renderLayoutState(); } },
      el("span", { "aria-hidden": "true", text: "☰" })),
    el("h1", { id: "page-title", tabindex: "-1", text: title }),
    el("polynet-account"));
}

function renderLayoutState() {
  const layout = app.querySelector(".layout");
  if (!layout) return;
  layout.classList.toggle("nav-open", state.navOpen);
  const button = layout.querySelector(".menu-button");
  if (button) button.setAttribute("aria-expanded", state.navOpen ? "true" : "false");
  if (state.navOpen) layout.querySelector(".sidebar a")?.focus();
}

async function renderApp() {
  if (!state.channels.length) {
    try { state.channels = await polynet.channels(); } catch (error) { state.channels = []; }
  }
  const current = route();
  if (state.stopWatch) { const stop = state.stopWatch; state.stopWatch = null; (await stop)?.(); }
  const views = { home: viewHome, chat: viewChat, events: viewEvents, courses: viewCourses, lesson: viewDocument,
    knowledge: viewKnowledge, note: viewDocument, members: viewMembers, agent: viewAgent };
  const view = views[current.name] || viewHome;
  const main = el("main", { id: "main", class: "main", tabindex: "-1" });
  const layout = el("div", { class: "layout" + (state.navOpen ? " nav-open" : "") },
    sidebar(current), el("div", { class: "scrim", onclick: () => { state.navOpen = false; renderLayoutState(); } }), main);
  app.replaceChildren(layout);
  await view(main, current);
  app.removeAttribute("aria-busy");
  const heading = document.getElementById("page-title");
  document.title = (heading?.textContent ? heading.textContent + " · " : "") + communityName();
  if (heading && document.activeElement === document.body) heading.focus();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.navOpen) { state.navOpen = false; renderLayoutState(); app.querySelector(".menu-button")?.focus(); }
});

// ---------- home ----------

async function viewHome(main) {
  const general = state.channels.find((channel) => channel.isGeneral) || state.channels[0];
  const page = el("div", { class: "page home-grid" });
  main.append(topbar("Welcome back" + (state.session.member?.name ? ", " + state.session.member.name.split(" ")[0] : "")), page);
  const [posts, events] = await Promise.all([
    general ? polynet.feed(general.slug, { limit: 30 }).then((posts) => posts.slice(-5)).catch(() => []) : [],
    polynet.events({ limit: 3 }).catch(() => []),
  ]);
  page.append(
    el("section", { "aria-labelledby": "latest" },
      el("div", { class: "section-head" }, el("h2", { id: "latest", text: "Latest in #" + (general?.name || "chat") }),
        general ? link("/chat/" + encodeURIComponent(general.slug), { text: "Open chat" }) : null),
      posts.length ? el("div", {}, posts.slice().reverse().map((post) => postView(post, { channel: general.slug, compact: true })))
        : el("p", { class: "empty", text: "No posts yet. Start the conversation." })),
    el("section", { "aria-labelledby": "upcoming" },
      el("div", { class: "section-head" }, el("h2", { id: "upcoming", text: "Coming up" }), link("/events", { text: "All events" })),
      events.length ? el("ul", { class: "list" }, events.map((event) => el("li", {}, eventView(event))))
        : el("p", { class: "empty", text: "No upcoming events." })),
    el("section", { "aria-labelledby": "ask" },
      el("div", { class: "section-head" }, el("h2", { id: "ask", text: content.nav.agent })),
      link("/agent", { class: "row-link" }, el("span", { class: "avatar agent", "aria-hidden": "true", text: "✦" }),
        el("span", { class: "grow" }, el("span", { class: "title", text: communityName() + " agent" }),
          el("span", { class: "muted small", text: " Answers questions about the community, privately." })))));
}

// ---------- chat ----------

function displayText(post) {
  const prefix = "@" + communityName() + " ";
  const text = post.text || post.snippet || "";
  return post.actor?.type === "human" && text.startsWith(prefix) ? { text: text.slice(prefix.length), asksAgent: true } : { text, asksAgent: false };
}

function authorName(actor) {
  if (actor?.type === "community_agent") return communityName() + " agent" + (actor.display_name ? " · for " + actor.display_name : "");
  return actor?.display_name || actor?.handle || "Member";
}

function avatarView(actor) {
  if (actor?.type === "community_agent") return el("span", { class: "avatar agent", "aria-hidden": "true", text: "✦" });
  if (actor?.avatar_url) return el("img", { class: "avatar", src: actor.avatar_url, alt: "" });
  return el("span", { class: "avatar", "aria-hidden": "true", text: initials(actor?.display_name || actor?.handle) });
}

function postView(post, options) {
  const body = displayText(post);
  const bodyNode = el("div", { class: "post-body" }, renderMarkdown(body.text));
  const tools = el("div", { class: "post-tools" });
  const article = el("article", { class: "post", "aria-label": authorName(post.actor) + ", " + formatTime(post.created_at) },
    avatarView(post.actor),
    el("div", {},
      el("div", { class: "post-head" },
        el("span", { class: "author", text: authorName(post.actor) }),
        el("time", { class: "time", datetime: post.created_at, text: formatTime(post.created_at) + (post.edited_at ? " · edited" : "") }),
        body.asksAgent ? el("span", { class: "chip", text: "Asked the agent" }) : null),
      bodyNode,
      (post.attachments || []).length ? el("div", { class: "attachments" }, post.attachments.map((file) => file.kind === "image"
        ? el("a", { href: polynet.fileUrl(file), target: "_blank", rel: "noopener" }, el("img", { src: polynet.fileUrl(file), alt: file.name || "Image", loading: "lazy" }))
        : el("a", { class: "file-link", href: polynet.fileUrl(file), text: "📄 " + (file.name || "File") }))) : null,
      options.compact ? null : tools));
  if (!options.compact) fillTools(tools, post, options, bodyNode, article);
  return article;
}

function fillTools(tools, post, options, bodyNode, article) {
  const counts = new Map((post.reactions || []).map((reaction) => [reaction.emoji, reaction.count]));
  const mine = new Set(post.reacted_by_me || []);
  const react = (emoji) => polynet.react(post.ref, emoji, !mine.has(emoji)).catch(() => undefined);
  for (const [emoji, count] of counts) {
    tools.append(el("button", { class: "reaction", type: "button", "aria-pressed": mine.has(emoji) ? "true" : "false",
      "aria-label": "React with " + emoji + ", " + count, onclick: () => react(emoji) }, emoji + " " + count));
  }
  const threadHref = options.channel && post.object_type === "root"
    ? "/chat/" + encodeURIComponent(options.channel) + "/" + post.ref.replace("interaction:root:", "") : null;
  if (threadHref && post.reply_count) {
    tools.append(link(threadHref, { class: "text-button", text: post.reply_count + (post.reply_count === 1 ? " reply" : " replies") }));
  }
  const picker = el("div", { class: "picker", hidden: true, role: "group", "aria-label": "Choose a reaction" },
    REACTIONS.map((emoji) => el("button", { type: "button", "aria-label": "React with " + emoji, onclick: () => { picker.hidden = true; react(emoji); } }, emoji)));
  const actions = el("div", { class: "post-actions", role: "group", "aria-label": "Message actions" },
    el("button", { class: "text-button", type: "button", "aria-label": "Add a reaction", onclick: () => {
      picker.hidden = !picker.hidden;
      if (!picker.hidden) picker.querySelector("button")?.focus();
    } }, "☺ React"),
    threadHref ? link(threadHref, { class: "text-button", text: "Reply" }) : null,
    post.can_edit ? el("button", { class: "text-button", type: "button", onclick: () => editInPlace(post, bodyNode) }, "Edit") : null,
    post.by_me ? el("button", { class: "text-button", type: "button", onclick: async () => {
      if (confirm("Delete this message?")) await polynet.remove(post).catch(() => undefined);
    } }, "Delete") : null);
  article.append(actions);
  tools.after(picker);
  if (!tools.childElementCount) tools.hidden = true;
}

function editInPlace(post, bodyNode) {
  const field = el("textarea", { class: "edit-field", rows: "3", "aria-label": "Edit message" });
  field.value = post.text || post.snippet || "";
  const original = bodyNode.firstChild;
  const save = async () => {
    const text = field.value.trim();
    if (text) await polynet.edit(post, text).catch(() => undefined);
  };
  bodyNode.replaceChildren(field, el("div", { class: "post-tools" },
    el("button", { class: "button", type: "button", onclick: save }, "Save"),
    el("button", { class: "button quiet", type: "button", onclick: () => bodyNode.replaceChildren(original) }, "Cancel")));
  field.focus();
}

function composer(options) {
  const field = el("textarea", { rows: "1", placeholder: options.placeholder, "aria-label": options.label, disabled: options.disabled || null });
  const files = el("input", { type: "file", multiple: true, class: "visually-hidden", id: "attach-" + options.id, tabindex: "-1" });
  const chips = el("div", { class: "file-chips" });
  const ask = options.allowAsk ? el("input", { type: "checkbox", id: "ask-" + options.id }) : null;
  const send = el("button", { class: "button", type: "submit", disabled: options.disabled || null }, "Send");
  const note = el("p", { class: "composer-note", "aria-live": "polite" });
  files.onchange = () => chips.replaceChildren(...[...files.files].map((file) => el("span", { class: "chip", text: file.name })));
  field.addEventListener("input", () => { field.style.height = "auto"; field.style.height = Math.min(field.scrollHeight, 240) + "px"; });
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
  });
  const form = el("form", { class: "composer", onsubmit: async (event) => {
    event.preventDefault();
    const text = field.value.trim();
    if (!text && !files.files.length) return;
    send.disabled = true;
    note.textContent = ask?.checked ? "Sending — the agent will reply here…" : "";
    try {
      await options.onSend(text, { files: [...files.files], askAgent: Boolean(ask?.checked) });
      field.value = ""; field.style.height = "auto"; files.value = ""; chips.replaceChildren();
      if (ask) ask.checked = false;
    } catch (error) {
      note.textContent = error?.message || "Couldn't send. Try again.";
    }
    send.disabled = Boolean(options.disabled);
    field.focus();
  } },
    el("div", { class: "composer-inner" }, field, chips,
      el("div", { class: "composer-bar" },
        options.allowFiles ? el("label", { class: "icon-button", for: files.id, title: "Attach files" },
          el("span", { "aria-hidden": "true", text: "📎" }), el("span", { class: "visually-hidden", text: "Attach files" })) : null,
        files,
        ask ? el("label", { class: "toggle", for: ask.id }, ask, "Ask the agent") : null,
        el("span", { class: "spacer" }), send)),
    options.disabled ? el("p", { class: "composer-note", text: options.disabledNote }) : note);
  return form;
}

async function viewChat(main, current) {
  const channel = state.channels.find((item) => item.slug === current.parts[1]) || state.channels.find((item) => item.isGeneral) || state.channels[0];
  if (!channel) { main.append(topbar("Chat"), el("div", { class: "page" }, el("p", { class: "empty", text: "No channels yet." }))); return; }
  const threadId = current.parts[2];
  const feed = el("div", { class: "feed", role: "log", "aria-label": "Messages in #" + channel.name, "aria-live": "off" });
  const inner = el("div", { class: "feed-inner" });
  feed.append(inner);
  const column = el("section", { class: "chat-column", "aria-label": "#" + channel.name }, feed,
    composer({ id: "chat", label: "Message #" + channel.name, placeholder: content.composerPlaceholder.replace("…", " in #" + channel.name + "…"),
      allowFiles: true, allowAsk: true, disabled: !channel.canPost, disabledNote: "Only some members can post in this channel.",
      onSend: (text, extra) => polynet.post(channel.slug, text, extra) }));
  const chat = el("div", { class: "chat" + (threadId ? " with-thread" : "") }, column);
  main.append(topbar("#" + channel.name), chat);

  let threadInner = null;
  if (threadId) {
    threadInner = el("div", { class: "feed-inner" });
    chat.append(el("section", { class: "thread-panel", "aria-label": "Thread" },
      el("div", { class: "thread-head" }, el("h2", { text: "Thread" }),
        link("/chat/" + encodeURIComponent(channel.slug), { class: "icon-button", "aria-label": "Close thread", text: "✕" })),
      el("div", { class: "feed" }, threadInner),
      composer({ id: "thread", label: "Reply in thread", placeholder: "Reply…", allowFiles: true, allowAsk: true,
        disabled: !channel.canPost, disabledNote: "Only some members can reply here.",
        onSend: (text, extra) => polynet.post(channel.slug, text, { ...extra, replyTo: "interaction:root:" + threadId }) })));
  }

  const draw = async () => {
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
    try {
      const posts = await polynet.feed(channel.slug);
      inner.replaceChildren(...(posts.length ? posts.map((post) => postView(post, { channel: channel.slug }))
        : [el("p", { class: "empty", text: "No messages yet. Say hello." })]));
      if (nearBottom || !draw.done) feed.scrollTop = feed.scrollHeight;
      draw.done = true;
      if (threadInner) {
        const entries = await polynet.thread(channel.slug, "interaction:root:" + threadId);
        threadInner.replaceChildren(...entries.map((post) => postView(post, {})));
      }
    } catch (error) {
      inner.replaceChildren(errorView(error));
    }
  };
  try {
    state.stopWatch = polynet.watch(channel.slug, draw);
    await state.stopWatch;
  } catch (error) {
    await draw();
  }
}

// ---------- events ----------

function eventView(event) {
  const start = new Date(event.starts_at);
  const zone = event.timezone || undefined;
  const month = start.toLocaleDateString(undefined, { month: "short", timeZone: zone });
  const day = start.toLocaleDateString(undefined, { day: "numeric", timeZone: zone });
  const when = start.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short" });
  return el("article", { class: "event", "aria-labelledby": "event-" + (event.id || event.path || event.title) },
    el("div", { class: "date-tile", "aria-hidden": "true" }, el("div", { class: "month", text: month }), el("div", { class: "day", text: day })),
    el("div", {},
      el("h3", { id: "event-" + (event.id || event.path || event.title), text: event.title || event.name || "Event" }),
      el("div", { class: "meta" }, el("span", { text: when }),
        event.location_label ? el("span", { text: event.location_label }) : event.location_type === "online" ? el("span", { text: "Online" }) : null),
      event.description_md ? renderMarkdown(event.description_md) : null,
      event.url ? el("p", {}, el("a", { class: "button quiet", href: event.url, target: "_blank", rel: "noopener", text: "Event details" })) : null));
}

async function viewEvents(main) {
  const page = el("div", { class: "page" });
  main.append(topbar(content.nav.events), page);
  if (isBuilder() && state.session.studio_url) {
    page.append(el("p", { class: "page-intro" }, "Create and edit events in ", el("a", { href: state.session.studio_url, text: "Polynet" }), "."));
  }
  try {
    const events = await polynet.events();
    page.append(events.length ? el("ul", { class: "list" }, events.map((event) => el("li", {}, eventView(event))))
      : el("div", { class: "empty" }, el("p", { text: "No upcoming events yet." }),
        isBuilder() && state.session.studio_url ? el("a", { class: "button", href: state.session.studio_url, text: "Create an event" }) : null));
  } catch (error) {
    page.append(errorView(error));
  }
}

// ---------- courses and documents ----------

async function viewCourses(main, current) {
  const path = current.query.get("path");
  const page = el("div", { class: "page" });
  main.append(topbar(current.query.get("title") || content.nav.courses), page);
  try {
    const entries = await polynet.resources(path || undefined);
    if (!entries.length) {
      page.append(el("div", { class: "empty" }, el("p", { text: "Nothing here yet." }),
        isBuilder() && state.session.studio_url ? el("a", { class: "button", href: state.session.studio_url, text: "Add courses in Polynet" }) : null));
      return;
    }
    page.append(el("ul", { class: "list" }, entries.map((entry) => {
      const title = entry.title || entry.name || "Untitled";
      const href = entry.kind === "directory"
        ? "/courses?path=" + encodeURIComponent(entry.path) + "&title=" + encodeURIComponent(title)
        : "/lesson?path=" + encodeURIComponent(entry.path) + "&title=" + encodeURIComponent(title);
      return el("li", {}, link(href, { class: "row-link" },
        el("span", { class: "grow" }, el("span", { class: "title", text: title })),
        el("span", { class: "kind", text: entry.kind === "directory" ? "Course" : "Lesson" })));
    })));
  } catch (error) {
    page.append(errorView(error));
  }
}

async function viewDocument(main, current) {
  const path = current.query.get("path");
  const page = el("div", { class: "page" });
  main.append(topbar(current.query.get("title") || "Document"), page);
  if (!path) { page.append(el("p", { class: "empty", text: "Nothing to show." })); return; }
  try {
    const text = await polynet.readText({ path });
    page.append(el("div", { class: "document" }, renderMarkdown(text || "This page is empty.")));
  } catch (error) {
    page.append(errorView(error));
  }
}

// ---------- knowledge ----------

async function viewKnowledge(main, current) {
  const query = current.query.get("q") || "";
  const page = el("div", { class: "page" });
  main.append(topbar(content.nav.knowledge), page);
  const input = el("input", { type: "search", name: "q", value: query, placeholder: "Search what the community knows", "aria-label": "Search knowledge" });
  page.append(el("p", { class: "page-intro", text: "What the community has learned, kept by its agent." }),
    el("form", { class: "search", role: "search", onsubmit: (event) => {
      event.preventDefault();
      navigate("/knowledge" + (input.value.trim() ? "?q=" + encodeURIComponent(input.value.trim()) : ""));
    } }, input, el("button", { class: "button", type: "submit" }, "Search")));
  try {
    const notes = await polynet.knowledge(query || undefined);
    page.append(notes.length ? el("ul", { class: "list" }, notes.map((note) => el("li", {},
      link("/note?path=" + encodeURIComponent(note.path) + "&title=" + encodeURIComponent(note.title || "Note"), { class: "row-link" },
        el("span", { class: "grow" }, el("span", { class: "title", text: note.title || "Note" }),
          note.applies_when ? el("div", { class: "muted small", text: note.applies_when }) : null),
        note.type ? el("span", { class: "kind", text: note.type }) : null))))
      : el("p", { class: "empty", text: query ? "Nothing matches that yet." : "The community hasn't learned anything yet." }));
  } catch (error) {
    page.append(errorView(error));
  }
}

// ---------- members ----------

async function viewMembers(main) {
  const page = el("div", { class: "page" });
  main.append(topbar(content.nav.members), page);
  try {
    const members = await polynet.members();
    page.append(el("p", { class: "page-intro", text: members.length + (members.length === 1 ? " member" : " members") }),
      el("ul", { class: "members" }, members.map((member) => el("li", { class: "member" },
        el("span", { class: "avatar", "aria-hidden": "true", text: initials(member.name) }),
        el("span", {}, el("span", { class: "title", text: member.name }), el("div", { class: "role", text: member.role || "member" }))))));
  } catch (error) {
    page.append(errorView(error));
  }
}

// ---------- the community agent ----------

async function viewAgent(main) {
  const page = el("div", { class: "page" });
  const log = el("div", { class: "agent-log", role: "log", "aria-label": "Conversation with the agent" });
  const status = el("p", { class: "agent-status", role: "status" });
  main.append(topbar(content.nav.agent), page);
  const ask = composer({ id: "agent", label: "Ask the agent", placeholder: content.agentPlaceholder, onSend: async (text) => {
      log.append(el("div", { class: "bubble user" }, renderMarkdown(text)));
      const reply = el("div", { class: "bubble assistant" });
      status.textContent = "Thinking…";
      ask.scrollIntoView({ block: "end" });
      let shown = false;
      await polynet.askAgent(text, { onDelta: (soFar) => {
        if (!shown) { log.append(reply); shown = true; status.textContent = ""; }
        reply.replaceChildren(renderMarkdown(soFar));
        ask.scrollIntoView({ block: "end" });
      } });
      status.textContent = "";
    } });
  ask.classList.add("sticky");
  page.append(el("p", { class: "page-intro", text: "Private to you. The agent knows the community's channels, events, courses and knowledge." }), log, status, ask);
  try {
    const history = await polynet.agentHistory();
    log.append(...history.map((message) => el("div", { class: "bubble " + (message.role === "user" ? "user" : "assistant") }, renderMarkdown(message.text))));
    if (!history.length) log.append(el("p", { class: "muted", text: "Ask about what's happening, upcoming events, or anything the community knows." }));
    ask.scrollIntoView({ block: "end" });
  } catch (error) {
    page.prepend(errorView(error));
  }
}

// ---------- start ----------

async function render() {
  try {
    state.session = state.session || await polynet.session();
    if (!state.session.signed_in) {
      app.replaceChildren(renderPublic());
      app.removeAttribute("aria-busy");
      return;
    }
    await renderApp();
  } catch (error) {
    app.replaceChildren(el("div", { class: "page" }, errorView(error)));
  }
}

window.addEventListener("popstate", () => render());
render();
