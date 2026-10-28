// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-page>, served at /__polynet/blocks/page.js: the one placeholder in a
// site's frame (/frame.html). The edge serves the frame at each standard page
// the site doesn't serve itself (/chat, /people/<handle>, /events/<event>,
// /learn/<course>/<lesson>, /knowledge, /ask, ...); this block
// reads the address and puts that page's blocks in place. It renders in the
// page's own DOM (no shadow root), so the site's CSS lays it out and its
// ::part() rules reach the blocks inside. Kept as text (a String.raw literal: no
// backticks or template placeholders inside) so the edge serves exactly what is
// reviewed; the route table is filled in from the one the edge routes by.
import { STANDARD_PAGES } from "../../../../../packages/polynet-cli/checks.mjs";

// What the block needs of each standard page, as JSON (no functions, no URLs):
// below is each level's pattern as regex source.
export const PAGE_ROUTES_JSON = JSON.stringify(STANDARD_PAGES.map((page) => ({
  path: page.path, name: page.name, title: page.title, blocks: page.blocks, members: Boolean(page.members),
  below: page.below.map(([, pattern]) => pattern.source),
})));

export const PAGE_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-page>. ui.js loads it on pages that place the tag.
// In the site's frame:
//   <main><polynet-page></polynet-page></main>
// Optional, inside it (each replaces Polynet's default for that page):
//   <h1 slot="chat-heading">The wall</h1>   <h1 slot="people-heading">The crew</h1>
//   (also events-heading, learn-heading, knowledge-heading, ask-heading)
//   <h1 slot="not-found-heading">Off the map</h1>
//   <p data-block="polynet-chat" slot="empty">Chalk's dry.</p>   (moved into that block, keeping its slot)
//   <polynet-page no-heading></polynet-page>                     (no headings at all)
// Lay it out with classes: .pn-page-header, .pn-page-heading, .pn-page-body,
// .pn-page-chat, .pn-page-people, .pn-page-events, .pn-page-learn,
// .pn-page-knowledge, .pn-page-ask, .pn-page-missing, .pn-page-links, and the
// page attribute: polynet-page[page=chat|people|events|learn|knowledge|ask|not-found].
// The blocks read the rest of the address themselves (/events/<event>,
// /learn/<course>/<lesson>).
import { h } from "/__polynet/blocks/kit.js";

const PAGES = __POLYNET_PAGE_ROUTES__;
for (const page of PAGES) page.below = page.below.map((source) => new RegExp(source));

// Which page this address is: { page, handle } or null (the edge's standardPage).
function route(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  for (const page of PAGES) {
    if (path === page.path) return { page: page, handle: null };
    if (!page.below.length || path.indexOf(page.path + "/") !== 0) continue;
    const below = path.slice(page.path.length + 1).split("/");
    if (below.length > page.below.length || !below.every((segment, i) => page.below[i].test(segment))) continue;
    return { page: page, handle: page.members ? below[0].toLowerCase() : null };
  }
  return null;
}

const HEADINGS = new Set(PAGES.map((page) => page.name + "-heading").concat(["not-found-heading"]));

class PolynetPage extends HTMLElement {
  connectedCallback() {
    // Rendered once: a frame that moves the element (a single-page app) keeps what's inside.
    if (this.rendered) return;
    this.rendered = true;
    const headings = {};
    const forBlocks = [];
    for (const child of Array.from(this.children)) {
      const slot = child.getAttribute("slot");
      if (child.hasAttribute("data-block")) forBlocks.push(child);
      else if (slot && HEADINGS.has(slot)) headings[slot] = child;
      child.remove();
    }
    const found = route(location.pathname);
    const name = found ? found.page.name : "not-found";
    this.setAttribute("page", name);
    const body = found ? this.body(found.page, forBlocks) : this.missing();
    const nodes = [];
    if (!this.hasAttribute("no-heading")) {
      const heading = headings[name + "-heading"];
      if (heading) heading.removeAttribute("slot");
      nodes.push(h("div", { class: "pn-page-header" }, [
        heading || h("h1", { class: "pn-page-heading", text: found ? found.page.title : "Page not found" }),
      ]));
    }
    nodes.push(body);
    this.replaceChildren(...nodes);
    this.markCurrent(found && found.page.path);
    if (found && found.handle) this.openMember(found.page.path, found.handle);
  }

  body(page, forBlocks) {
    const blocks = page.blocks.map((tag) => {
      const block = document.createElement(tag);
      for (const child of forBlocks) if (child.getAttribute("data-block") === tag) block.append(child);
      return block;
    });
    return h("div", { class: "pn-page-body pn-page-" + page.name }, blocks);
  }

  // Quiet, inside the site's own frame, with the way to every page that exists.
  missing() {
    const links = [h("li", {}, [h("a", { href: "/", text: "Home" })])]
      .concat(PAGES.map((page) => h("li", {}, [h("a", { href: page.path, text: page.title })])));
    return h("div", { class: "pn-page-body pn-page-missing" }, [
      h("p", { text: "There's nothing at this address." }),
      h("nav", { "aria-label": "Pages here" }, [h("ul", { class: "pn-page-links" }, links)]),
    ]);
  }

  // The frame's own navigation says which page this is.
  markCurrent(path) {
    if (!path) return;
    for (const link of document.querySelectorAll("nav a[href]")) {
      if (link.hasAttribute("aria-current") || this.contains(link)) continue;
      const url = new URL(link.getAttribute("href"), location.href);
      if (url.origin === location.origin && url.pathname.replace(/\/$/, "") === path) link.setAttribute("aria-current", "page");
    }
  }

  // /people/<handle>: the list's own address underneath, then the profile on
  // top (it adds ?member=), so Close and Back both land on the list.
  openMember(path, handle) {
    const params = new URLSearchParams(location.search);
    history.replaceState(history.state, "", path + location.search + location.hash);
    // A ?member= link already says whose profile is open.
    if (params.has("member")) return;
    document.dispatchEvent(new CustomEvent("polynet:profile", { detail: { handle: handle } }));
  }
}

if (!customElements.get("polynet-page")) customElements.define("polynet-page", PolynetPage);
`.replace("__POLYNET_PAGE_ROUTES__", PAGE_ROUTES_JSON);
