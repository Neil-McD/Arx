import type { CloudAutoplayScreenStep } from "../../../../shared/cloudCommunityTestMembersGateway";

// Autoplay on screen: in a test member's own tab, does one step the way a
// person would, in the real member screens: goes to the page, moves a visible
// cursor to each control, types answers and clicks. It only drives what is on
// the page (by its words and the member screens' own classes), so anything it
// can't find comes back as a reason, and the server does that step instead.

const FIND_MS = 7_000;
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function shown(node: Element): node is HTMLElement {
  return node instanceof HTMLElement && node.getClientRects().length > 0
    && !node.closest(".test-run-bar, .test-run-cursor");
}

function words(node: Element): string {
  return (node as HTMLElement).innerText?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

/** The first control on the page showing these words: exactly, then containing them. */
function byText(selector: string, text: string, root: ParentNode = document): HTMLElement | null {
  const wanted = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!wanted) return null;
  const nodes = Array.from(root.querySelectorAll(selector)).filter(shown);
  return nodes.find((node) => words(node) === wanted) ?? nodes.find((node) => words(node).includes(wanted)) ?? null;
}

async function waitFor<T>(find: () => T | null | undefined, ms = FIND_MS): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() > end) return null;
    await sleep(120);
  }
}

/** Lesson controls ignore a second answer while one saves: wait until it's saved. */
async function settled(root: Element) {
  await sleep(80);
  await waitFor(() => root.querySelector("[aria-disabled='true']") ? null : true, 4_000);
}

class Cursor {
  private node: HTMLDivElement;
  constructor(label: string, private pace: number) {
    this.node = document.createElement("div");
    this.node.className = "test-run-cursor";
    this.node.setAttribute("aria-hidden", "true");
    this.node.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l16 10-7 1.5L9.5 21z" /></svg><span></span>`;
    this.node.querySelector("span")!.textContent = label;
    this.node.style.transitionDuration = `${pace}ms`;
    const start = document.querySelector(".test-run-cursor-at") as HTMLElement | null;
    this.node.style.left = start?.dataset.x ?? `${window.innerWidth / 2}px`;
    this.node.style.top = start?.dataset.y ?? `${window.innerHeight - 120}px`;
    document.body.appendChild(this.node);
  }

  async moveTo(target: HTMLElement) {
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    await sleep(Math.min(400, this.pace));
    const rect = target.getBoundingClientRect();
    this.node.style.left = `${rect.left + Math.min(rect.width / 2, 40)}px`;
    this.node.style.top = `${rect.top + rect.height / 2}px`;
    await sleep(this.pace);
  }

  async click(target: HTMLElement) {
    await this.moveTo(target);
    this.node.classList.add("is-clicking");
    target.classList.add("test-run-highlight");
    target.click();
    await sleep(Math.max(120, this.pace / 2));
    this.node.classList.remove("is-clicking");
    window.setTimeout(() => target.classList.remove("test-run-highlight"), 1_200);
  }

  /** Types into a field the way React sees typing, a few letters at a time. */
  async type(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
    await this.click(field);
    field.focus();
    const setter = Object.getOwnPropertyDescriptor(field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
    const chunk = text.length > 80 ? 4 : text.length > 30 ? 2 : 1;
    const perChunk = Math.max(6, Math.min(40, this.pace / 15));
    for (let at = chunk; at < text.length + chunk; at += chunk) {
      setter?.call(field, text.slice(0, at));
      field.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(perChunk);
    }
  }

  remove() {
    // The next step's cursor starts where this one stopped.
    let mark = document.querySelector(".test-run-cursor-at") as HTMLElement | null;
    if (!mark) { mark = document.createElement("i"); mark.className = "test-run-cursor-at"; mark.hidden = true; document.body.appendChild(mark); }
    mark.dataset.x = this.node.style.left; mark.dataset.y = this.node.style.top;
    this.node.remove();
  }
}

class StepProblem extends Error {}
const need = <T>(value: T | null, problem: string): T => { if (!value) throw new StepProblem(problem); return value; };

function goTo(path: string | undefined) {
  if (!path || window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** The welcome page can open with screens of words before a step: read on past them, as a member would. */
async function passWelcomeScreens(cursor: Cursor, pace: number) {
  for (let turn = 0; turn < 20; turn += 1) {
    const next = Array.from(document.querySelectorAll(".community-welcome-next button")).filter(shown)[0];
    if (!next) return;
    await sleep(pace / 2);
    await cursor.click(next);
    await waitFor(() => (next.isConnected ? null : true), 2_000);
  }
}

async function fillForm(cursor: Cursor, step: Extract<CloudAutoplayScreenStep, { kind: "form" }>, pace: number) {
  await passWelcomeScreens(cursor, pace);
  const name = step.formName.trim().toLowerCase();
  const formOpen = () => Array.from(document.querySelectorAll(".member-form-dialog")).filter(shown)
    .find((dialog) => words(dialog.querySelector("header h2") ?? dialog).startsWith(name)) ?? null;
  let dialog = formOpen();
  if (!dialog) {
    const opener = await waitFor(() => byText(".community-next-step, .member-form-list-row", step.formName), 4_000);
    if (opener) await cursor.click(opener);
    dialog = await waitFor(formOpen);
  }
  const form = need(dialog, `couldn't find the ${step.formName} form`);
  for (let turn = 0; turn <= step.questions.length + 1; turn += 1) {
    const section = need(await waitFor(() => form.querySelector("section")), "the form didn't open");
    const heading = words(section.querySelector("h2") ?? section);
    if (heading === "submitted") {
      const done = byText("button", "Done", section);
      if (done) await cursor.click(done);
      return;
    }
    const question = need(step.questions.find((q) => q.title.trim().toLowerCase() === heading) ?? null, `couldn't match the question “${heading}”`);
    const answer = step.answers[question.key];
    if (question.type.endsWith("choice")) {
      const labels = Array.from(section.querySelectorAll("fieldset label")).filter(shown);
      for (const index of Array.isArray(answer) ? answer : answer ? [answer] : []) {
        const label = labels[Number(index)];
        if (label && !label.querySelector<HTMLInputElement>("input")?.checked) await cursor.click(label);
      }
    } else if (typeof answer === "string") {
      const field = need(section.querySelector<HTMLInputElement | HTMLTextAreaElement>("textarea, input:not([type=radio]):not([type=checkbox])"), "no answer box");
      if (field.value !== answer) await cursor.type(field, answer);
    }
    await sleep(pace / 2);
    const next = need(byText("footer button", "Submit", section) ?? byText("footer button", "Continue", section), "no Continue or Submit button");
    await cursor.click(next);
    await waitFor(() => { const now = form.querySelector("section h2"); return now && words(now) !== heading ? now : null; }, 8_000);
  }
}

/** Opens the lesson, unless it's already on screen (the welcome page shows it directly). */
async function openLesson(cursor: Cursor, step: { lessonTitle: string; welcome: boolean }, pace: number) {
  if (step.welcome) {
    await passWelcomeScreens(cursor, pace);
    need(await waitFor(() => document.querySelector(".community-welcome-lesson")), "the welcome lesson isn't showing");
    return;
  }
  const open = () => byText("h1, h2", step.lessonTitle);
  if (open() && document.querySelector("section.lesson-element, .lesson-board-step, .community-resource-viewer")) return;
  const link = need(await waitFor(() => byText("a, button, [role='button'], [role='link'], li", step.lessonTitle)), `couldn't find the lesson “${step.lessonTitle}”`);
  await cursor.click(link);
  await sleep(600);
}

async function doLessonStep(cursor: Cursor, step: Extract<CloudAutoplayScreenStep, { kind: "lesson_step" }>, pace: number) {
  await openLesson(cursor, step, pace);
  const name = step.elementName.trim();
  const section = need(await waitFor(() => Array.from(document.querySelectorAll("section.lesson-element")).filter(shown)
    .find((node) => (node.getAttribute("aria-label") ?? "").trim() === name) ?? null), `couldn't find “${name}” in the lesson`);
  if (step.elementType === "checklist") {
    for (const label of Array.from(section.querySelectorAll("label")).filter(shown)) {
      if (label.querySelector<HTMLInputElement>("input")?.checked) continue;
      await cursor.click(label);
      await settled(section);
    }
  } else {
    if (step.elementType === "quiz") {
      for (const choice of step.choiceLabels) {
        const label = byText("label", choice, section);
        if (label) await cursor.click(label);
      }
      await sleep(pace / 2);
    }
    await cursor.click(need(section.querySelector<HTMLElement>(".lesson-element-button:not(:disabled)"), "the button is disabled"));
    await settled(section);
  }
  await sleep(Math.max(600, pace));
}

async function markLessonDone(cursor: Cursor, step: Extract<CloudAutoplayScreenStep, { kind: "lesson_done" }>) {
  await openLesson(cursor, step, 600);
  const button = need(await waitFor(() => byText("button", "Mark done") ?? byText("button", "Mark as done") ?? byText("button", "Mark complete")),
    "no Mark done button");
  await cursor.click(button);
  await sleep(800);
}

async function post(cursor: Cursor, step: Extract<CloudAutoplayScreenStep, { kind: "post" }>) {
  const box = need(await waitFor(() => Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea.chat-input")).find(shown) ?? null), "no message box");
  await cursor.type(box, step.message);
  const send = need(await waitFor(() => document.querySelector<HTMLButtonElement>("button[aria-label='Send']:not(:disabled)")), "Send stayed disabled");
  await cursor.click(send);
  await sleep(800);
}

/** Does the step on screen. Resolves with null when done, or the reason it couldn't be. */
export async function runScreenStep(step: CloudAutoplayScreenStep, label: string): Promise<string | null> {
  goTo(step.path);
  await sleep(Math.max(500, step.pace));
  const cursor = new Cursor(label, step.pace);
  try {
    if (step.kind === "form") await fillForm(cursor, step, step.pace);
    else if (step.kind === "lesson_step") await doLessonStep(cursor, step, step.pace);
    else if (step.kind === "lesson_done") await markLessonDone(cursor, step);
    else if (step.kind === "post") await post(cursor, step);
    return null;
  } catch (error) {
    return error instanceof StepProblem ? error.message : "something on the page got in the way";
  } finally {
    await sleep(200);
    cursor.remove();
  }
}
