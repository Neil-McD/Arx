// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-learn>, served at /__polynet/blocks/learn.js: the community's
// courses. The catalogue (/learn), a course's lessons in order
// (/learn/<course>), and the lesson reader with previous and next
// (/learn/<course>/<lesson>). Courses are Polynet's resource folders and
// lessons its documents; their addresses carry Polynet's own path segments
// (<name>~<id>), and only the id decides. Kept as text (a String.raw literal:
// no backticks or template placeholders inside) so the edge serves exactly
// what is reviewed; the address pattern comes from the one route table.
import { LEARN_SEGMENT } from "../../../../../packages/polynet-cli/checks.mjs";

export const LEARN_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-learn>. ui.js loads it on pages that place the tag.
//   <polynet-learn></polynet-learn>   the courses; on /learn/<course>[/<lesson>], that course or lesson
import polynet from "/__polynet/sdk.js";
import { BASE_STYLE, PROSE_STYLE, h, signInGate, pagePath, followLink } from "/__polynet/blocks/kit.js";

const STYLE = BASE_STYLE + "\n" + PROSE_STYLE + "\n" + [
  ":host { display: block; }",
  ".view { display: grid; gap: 1em; }",
  ".back { justify-self: start; }",
  ".courses { list-style: none; margin: 0; padding: 0; display: grid; gap: .75em; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15em), 1fr)); }",
  ".course { display: grid; gap: .375em; align-content: start; height: 100%; padding: 1em 1.125em; border: 1px solid var(--pn-border);",
  "  border-radius: var(--pn-radius); text-decoration: none; line-height: 1.35; }",
  "@media (hover: hover) { .course:hover { border-color: color-mix(in srgb, var(--pn-accent) 60%, var(--pn-border)); } }",
  ".course-title { font-weight: 600; font-size: 1.0625em; overflow-wrap: anywhere; }",
  ".count { color: var(--pn-muted); font-size: .875em; min-height: 1.35em; }",
  ".heading { margin: 0; font-size: 1.5em; line-height: 1.25; overflow-wrap: anywhere; }",
  ".lessons { list-style: none; margin: 0; padding: 0; display: grid; gap: .125em; counter-reset: lesson; }",
  ".lesson { display: grid; grid-template-columns: 2em minmax(0, 1fr); gap: .5em; align-items: baseline; padding: .5em .625em;",
  "  border-radius: calc(var(--pn-radius) * .7); text-decoration: none; line-height: 1.4; }",
  "@media (hover: hover) { .lesson:hover { background: var(--pn-tint); } }",
  ".number { color: var(--pn-muted); font-variant-numeric: tabular-nums; text-align: right; }",
  ".lesson-title { overflow-wrap: anywhere; }",
  ".kicker { margin: 0; color: var(--pn-muted); font-size: .875em; }",
  ".pager { display: grid; grid-template-columns: 1fr 1fr; gap: .75em; margin-top: 1em; padding-top: 1em; border-top: 1px solid var(--pn-border); }",
  ".pager a { display: grid; gap: .125em; text-decoration: none; padding: .5em 0; line-height: 1.35; }",
  ".pager .next { text-align: right; grid-column: 2; }",
  ".pager .label { color: var(--pn-muted); font-size: .8125em; }",
  ".pager .name { font-weight: 600; overflow-wrap: anywhere; }",
  "@media (hover: hover) { .pager a:hover .name { text-decoration: underline; text-underline-offset: .2em; } }",
  ".none { color: var(--pn-muted); margin: 0; }",
  "@media (pointer: coarse) { .lesson, .pager a { min-height: 44px; } }",
].join("\n");

const BASE = "/learn";
const SEGMENT = new RegExp(__POLYNET_LEARN_SEGMENT__);
// Lesson counts on the catalogue: this many folders read at a time.
const COUNT_AT_ONCE = 4;

// A folder's or document's own segment of its Polynet path: ".../resources/intro~k1/" -> "intro~k1".
function segmentOf(entry) {
  const parts = String((entry && entry.path) || "").replace(/\.md$/, "").split("/").filter(Boolean);
  const segment = parts[parts.length - 1] || "";
  return SEGMENT.test(segment) ? segment : null;
}
function idOf(segment) { return segment.slice(segment.indexOf("~") + 1); }
function titleOf(entry, fallback) { return String((entry && (entry.name || entry.title)) || fallback); }
function lessonCount(n) { return n === 1 ? "1 lesson" : n + " lessons"; }

class PolynetLearn extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.generation = 0;
    // Folders read once per visit: moving between lessons reads only the lesson.
    this.folders = new Map();
    this.onPop = () => { if (pagePath(BASE) !== null) this.load({ moved: true }); };
    this.view = h("div", { class: "view", part: "learn" });
    this.root.replaceChildren(h("style", { text: STYLE }), this.view);
  }

  connectedCallback() {
    window.addEventListener("popstate", this.onPop);
    this.load({});
  }

  disconnectedCallback() {
    window.removeEventListener("popstate", this.onPop);
    this.generation += 1;
  }

  folder(path) {
    const key = path || "";
    if (!this.folders.has(key)) {
      const read = polynet.resources(path || undefined);
      this.folders.set(key, read);
      read.catch(() => { if (this.folders.get(key) === read) this.folders.delete(key); });
    }
    return this.folders.get(key);
  }

  async load(options) {
    const generation = ++this.generation;
    this.setAttribute("state", "loading");
    this.view.replaceChildren(h("p", { class: "muted", part: "state", role: "status", text: "Loading…" }));
    try {
      const session = await polynet.session();
      if (generation !== this.generation) return;
      if (!session.signed_in) { this.signedOut(session); return; }
      if (options.fresh) this.folders.clear();
      const at = pagePath(BASE) || [];
      if (at.length === 2) await this.lesson(generation, at[0], at[1]);
      else if (at.length === 1) await this.course(generation, at[0]);
      else await this.catalogue(generation);
      if (generation === this.generation && options.moved) this.focusHeading();
    } catch (error) {
      if (generation !== this.generation) return;
      if (error && error.code === "sign_in_required") { this.signedOut(await polynet.session().catch(() => ({}))); return; }
      this.setAttribute("state", "error");
      this.view.replaceChildren(h("div", { class: "state", part: "state", role: "alert" }, [
        h("p", { text: "Couldn't load the courses." }),
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.load({ fresh: true }), text: "Try again" }),
      ]));
    }
  }

  // Never a course to someone who isn't a signed-in member.
  signedOut(session) {
    this.folders.clear();
    this.setAttribute("state", "signed-out");
    this.view.replaceChildren(h("div", { class: "state", part: "state" }, [signInGate(polynet, session, "Sign in to see the courses.")]));
  }

  link(href, attrs, children) {
    return h("a", Object.assign({ href: href, onclick: (event) => followLink(event, BASE, () => this.load({ moved: true })) }, attrs), children);
  }

  async courses() {
    return (await this.folder(null)).filter((entry) => entry.kind === "directory" && segmentOf(entry));
  }
  async lessons(course) {
    return (await this.folder(course.path)).filter((entry) => entry.kind === "document" && segmentOf(entry));
  }

  // The course this address names (by its id: a renamed course keeps its links).
  async findCourse(segment) {
    if (!SEGMENT.test(segment)) return null;
    return (await this.courses()).find((entry) => idOf(segmentOf(entry)) === idOf(segment)) || null;
  }

  async catalogue(generation) {
    const courses = await this.courses();
    if (generation !== this.generation) return;
    this.setAttribute("state", "ready");
    if (!courses.length) {
      this.view.replaceChildren(h("div", { class: "none", part: "empty" }, [h("slot", { name: "empty" }, ["No courses yet."])]));
      return;
    }
    const counts = new Map();
    this.view.replaceChildren(h("ul", { class: "courses", part: "courses", role: "list", "aria-label": "Courses" }, courses.map((course) => {
      const count = h("span", { class: "count", part: "course-count" });
      counts.set(course, count);
      return h("li", {}, [this.link(BASE + "/" + segmentOf(course), { class: "course", part: "course" }, [
        h("span", { class: "course-title", part: "course-title", text: titleOf(course, "Course") }),
        count,
      ])]);
    })));
    // Counts fill in as each course's folder is read; one that fails stays blank.
    const queue = courses.slice();
    const next = async () => {
      for (let course = queue.shift(); course; course = queue.shift()) {
        try {
          const lessons = await this.lessons(course);
          if (generation === this.generation) counts.get(course).textContent = lessonCount(lessons.length);
        } catch (error) {
          // The card still opens the course.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(COUNT_AT_ONCE, queue.length) }, next));
  }

  missing(text, back) {
    this.setAttribute("state", "missing");
    this.view.replaceChildren(
      h("h2", { class: "heading", part: "heading", tabindex: "-1", text: text }),
      h("p", { class: "muted", part: "missing", text: "It may have been moved or removed." }),
      back,
    );
  }

  async course(generation, segment) {
    const course = await this.findCourse(segment);
    const all = this.link(BASE, { class: "quiet back", part: "back", text: "All courses" });
    if (!course) { if (generation === this.generation) this.missing("This course isn't here", all); return; }
    const lessons = await this.lessons(course);
    if (generation !== this.generation) return;
    this.canonical([segmentOf(course)]);
    const title = titleOf(course, "Course");
    this.setAttribute("state", "ready");
    this.view.replaceChildren(
      all,
      h("h2", { class: "heading", part: "course-heading", tabindex: "-1", text: title }),
      h("p", { class: "kicker", part: "course-count", text: lessonCount(lessons.length) }),
      lessons.length
        ? h("ol", { class: "lessons", part: "lessons", "aria-label": "Lessons in " + title }, lessons.map((lesson, index) => h("li", {}, [
          this.link(BASE + "/" + segmentOf(course) + "/" + segmentOf(lesson), { class: "lesson", part: "lesson" }, [
            h("span", { class: "number", part: "lesson-number", "aria-hidden": "true", text: String(index + 1) }),
            h("span", { class: "lesson-title", part: "lesson-title", text: titleOf(lesson, "Lesson") }),
          ]),
        ])))
        : h("p", { class: "none", part: "no-lessons", text: "No lessons in this course yet." }),
    );
  }

  async lesson(generation, courseSegment, lessonSegment) {
    const course = await this.findCourse(courseSegment);
    const all = this.link(BASE, { class: "quiet back", part: "back", text: "All courses" });
    if (!course) { if (generation === this.generation) this.missing("This course isn't here", all); return; }
    const lessons = await this.lessons(course);
    const courseHref = BASE + "/" + segmentOf(course);
    const toCourse = this.link(courseHref, { class: "quiet back", part: "back", text: titleOf(course, "Course") });
    const index = SEGMENT.test(lessonSegment) ? lessons.findIndex((entry) => idOf(segmentOf(entry)) === idOf(lessonSegment)) : -1;
    if (index === -1) { if (generation === this.generation) this.missing("This lesson isn't here", toCourse); return; }
    const lesson = lessons[index];
    const text = await polynet.readText(lesson);
    if (generation !== this.generation) return;
    this.canonical([segmentOf(course), segmentOf(lesson)]);
    const neighbour = (entry, kind, label) => entry ? this.link(courseHref + "/" + segmentOf(entry), { class: kind, part: kind, rel: kind === "next" ? "next" : "prev" }, [
      h("span", { class: "label", text: label }),
      h("span", { class: "name", text: titleOf(entry, "Lesson") }),
    ]) : null;
    const previous = neighbour(lessons[index - 1], "previous", "Previous");
    const next = neighbour(lessons[index + 1], "next", "Next");
    this.setAttribute("state", "ready");
    this.view.replaceChildren(
      toCourse,
      h("article", { class: "view", part: "reader", "aria-labelledby": "pn-lesson-title" }, [
        h("p", { class: "kicker", part: "lesson-position", text: "Lesson " + (index + 1) + " of " + lessons.length }),
        h("h2", { class: "heading", part: "lesson-heading", id: "pn-lesson-title", tabindex: "-1", text: titleOf(lesson, "Lesson") }),
        h("div", { class: "prose", part: "lesson-body" }, [polynet.markdown(text)]),
      ]),
      previous || next ? h("nav", { class: "pager", part: "pager", "aria-label": "Lessons" }, [previous, next]) : null,
    );
  }

  // The address as Polynet names it now (a renamed course or lesson), without a new history entry.
  canonical(segments) {
    const path = BASE + "/" + segments.join("/");
    if (pagePath(BASE) !== null && location.pathname.replace(/\/$/, "") !== path) {
      history.replaceState(history.state, "", path + location.search + location.hash);
    }
  }

  // After moving, focus lands on the new heading (or the first course).
  focusHeading() {
    const target = this.view.querySelector(".heading, .course");
    if (!target) return;
    target.focus();
    this.scrollIntoView({ block: "start" });
  }
}

if (!customElements.get("polynet-learn")) customElements.define("polynet-learn", PolynetLearn);
`.replace("__POLYNET_LEARN_SEGMENT__", JSON.stringify(LEARN_SEGMENT.source));
