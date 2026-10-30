// Lesson presentation data for a resource page. The same lesson can be shown
// as a board card, a library row or a wizard step; these fields say where it
// sits and what it carries. The Markdown body stays canonical: platform
// variants, slides and commands are derived from it on read, never stored twice.

export const COMMUNITY_LESSON_KINDS = [
  "lesson",
  "build",
  "checkpoint",
  "prompt",
  "skill",
  "video",
  "doc",
] as const;

export type CommunityLessonKind = (typeof COMMUNITY_LESSON_KINDS)[number];

export type CommunityLessonFields = {
  kind?: CommunityLessonKind;
  // Board column. Absent keeps the lesson in the library only.
  stage?: string;
  stage_order?: number;
  order?: number;
  minutes?: number;
  video_url?: string;
  // A gate keeps every later stage locked until the member completes it.
  gate?: boolean;
  summary?: string;
};

export type CommunityLessonVariant = {
  key: string;
  label: string;
  body_md: string;
};

export type CommunityLessonSlide = {
  image: string;
  alt: string;
  note_md: string;
};

export type CommunityLessonCommand = {
  variant: string | null;
  language: string | null;
  text: string;
};

export const COMMUNITY_LESSON_ELEMENT_TYPES = ["button", "checklist", "quiz", "form"] as const;

// What a button does. confirm records the click as the member's answer; the
// others call something Polynet already does: mark the lesson done, ask the
// community agent the button's text, or open a Polynet Form.
export const COMMUNITY_LESSON_BUTTON_ACTIONS = ["confirm", "mark_done", "ask_agent", "open_form"] as const;

export type CommunityLessonButtonAction = (typeof COMMUNITY_LESSON_BUTTON_ACTIONS)[number];

export type CommunityLessonElementType = (typeof COMMUNITY_LESSON_ELEMENT_TYPES)[number];

export type CommunityLessonChoice = { id: string; label: string };

// What a member sees. Quiz answers and explanations never leave the server
// until the member has answered.
export type CommunityLessonElement = {
  id: string;
  type: CommunityLessonElementType;
  required: boolean;
  prompt: string;
  // button: the button text. checklist: the items. quiz: the options.
  label?: string;
  choices?: CommunityLessonChoice[];
  multiple?: boolean;
  action?: CommunityLessonButtonAction;
  // open_form buttons and form blocks: the Polynet Form, by its key.
  form_key?: string;
};

export type CommunityLessonElementWithAnswers = CommunityLessonElement & {
  correct?: string[];
  explanation_md?: string;
};

export type CommunityLessonResponseValue = boolean | string[];

export type CommunityLessonProjection = {
  intro_md: string;
  variants: CommunityLessonVariant[];
  slides: CommunityLessonSlide[];
  commands: CommunityLessonCommand[];
  elements: CommunityLessonElement[];
};

const STAGE_MAX_CHARS = 80;
const SUMMARY_MAX_CHARS = 280;
const VIDEO_URL_MAX_CHARS = 2_048;
const MAX_VARIANTS = 8;
const MAX_SLIDES = 60;
const MAX_COMMANDS = 60;
const COMMAND_MAX_CHARS = 4_000;
const MAX_ELEMENTS = 40;
const MAX_CHOICES = 20;
const CHOICE_MAX_CHARS = 300;
const PROMPT_MAX_CHARS = 1_000;
const ELEMENT_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function lessonError(field: string): Error {
  return new Error(`community_lesson_${field}_invalid`);
}

function boundedInteger(raw: unknown, field: string, max: number): number {
  const value = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    throw lessonError(field);
  }
  return value;
}

function inlineText(raw: unknown, field: string, maxChars: number): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "string") throw lessonError(field);
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length > maxChars) throw lessonError(field);
  return text || undefined;
}

function gateValue(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const text = String(raw ?? "").trim().toLowerCase();
  if (text === "yes" || text === "true") return true;
  if (text === "no" || text === "false" || text === "") return false;
  throw lessonError("gate");
}

function videoUrl(raw: unknown): string | undefined {
  const text = inlineText(raw, "video_url", VIDEO_URL_MAX_CHARS);
  if (!text) return undefined;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw lessonError("video_url");
  }
  if (url.protocol !== "https:") throw lessonError("video_url");
  return url.toString();
}

/**
 * Validates builder input. Returns null when nothing is set, so callers can
 * clear the field. Unknown keys are refused rather than silently dropped.
 */
export function normalizeCommunityLessonFields(raw: unknown): CommunityLessonFields | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw lessonError("fields");
  const record = raw as Record<string, unknown>;
  const allowed = new Set(["kind", "stage", "stage_order", "order", "minutes", "video_url", "gate", "summary"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw lessonError(key);
  }
  const next: CommunityLessonFields = {};
  if (record.kind !== undefined && record.kind !== null) {
    const kind = String(record.kind).trim().toLowerCase();
    if (!(COMMUNITY_LESSON_KINDS as readonly string[]).includes(kind)) throw lessonError("kind");
    next.kind = kind as CommunityLessonKind;
  }
  const stage = inlineText(record.stage, "stage", STAGE_MAX_CHARS);
  if (stage) next.stage = stage;
  if (record.stage_order !== undefined && record.stage_order !== null) {
    next.stage_order = boundedInteger(record.stage_order, "stage_order", 999);
  }
  if (record.order !== undefined && record.order !== null) {
    next.order = boundedInteger(record.order, "order", 9_999);
  }
  if (record.minutes !== undefined && record.minutes !== null) {
    next.minutes = boundedInteger(record.minutes, "minutes", 600);
  }
  const video = videoUrl(record.video_url);
  if (video) next.video_url = video;
  if (record.gate !== undefined && record.gate !== null && gateValue(record.gate)) next.gate = true;
  const summary = inlineText(record.summary, "summary", SUMMARY_MAX_CHARS);
  if (summary) next.summary = summary;
  if (next.gate && !next.stage) throw lessonError("gate_without_stage");
  return Object.keys(next).length ? next : null;
}

const COMMENTABLE_KEYS = new Set(["stage_order", "order", "minutes", "gate"]);

const FRONT_MATTER_KEYS: Record<string, keyof CommunityLessonFields> = {
  type: "kind",
  kind: "kind",
  stage: "stage",
  stage_order: "stage_order",
  order: "order",
  minutes: "minutes",
  video: "video_url",
  video_url: "video_url",
  gate: "gate",
  summary: "summary",
};

/**
 * Splits a portal-style Markdown file ("---" front matter, then the body) into
 * a title, lesson fields and the body. Lets an importer or the builder's agent
 * hand over the same files the course portal uses.
 */
export function parseCommunityLessonMarkdown(source: string): {
  title: string | null;
  lesson: CommunityLessonFields | null;
  body_md: string;
} {
  const text = String(source ?? "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { title: null, lesson: null, body_md: text.trim() };
  let title: string | null = null;
  const raw: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const pair = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    // Only number and yes/no fields take a trailing "# comment"; text keeps
    // its "#" (a summary can say "post it in #wins").
    const text = COMMENTABLE_KEYS.has(key) ? pair[2].replace(/\s+#.*$/, "") : pair[2];
    const value = text.trim().replace(/^(["'])(.*)\1$/, "$2");
    if (key === "title") {
      title = value || null;
      continue;
    }
    const field = FRONT_MATTER_KEYS[key];
    if (field && value) raw[field] = value;
  }
  return {
    title,
    lesson: normalizeCommunityLessonFields(raw),
    body_md: text.slice(match[0].length).trim(),
  };
}

function variantKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "default";
}

const FENCE = /^(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)(?:[ \t]+(.*?))?\s*$/;

type FencedBlock = { language: string | null; info: string; body: string };

function fencedBlocks(markdown: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const open = FENCE.exec(lines[i]);
    if (!open) continue;
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith(open[1])) body.push(lines[j++]);
    blocks.push({ language: open[2] || null, info: open[3] ?? "", body: body.join("\n") });
    i = j;
  }
  return blocks;
}

function isElementBlock(block: FencedBlock): boolean {
  return (COMMUNITY_LESSON_ELEMENT_TYPES as readonly string[]).includes(block.language ?? "");
}

function extractCommands(markdown: string, variant: string | null, into: CommunityLessonCommand[]) {
  for (const block of fencedBlocks(markdown)) {
    if (into.length >= MAX_COMMANDS) break;
    if (isElementBlock(block)) continue;
    const text = block.body.trim();
    if (text) into.push({ variant, language: block.language, text: text.slice(0, COMMAND_MAX_CHARS) });
  }
}

function elementError(id: string, problem: string): Error {
  return new Error(`community_lesson_element_invalid:${id || "unnamed"}:${problem}`);
}

function choiceId(label: string, explicit: string | undefined): string {
  if (explicit) return explicit;
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "choice";
}

function parseChoices(id: string, lines: string[], withAnswers: boolean) {
  const choices: CommunityLessonChoice[] = [];
  const correct: string[] = [];
  for (const line of lines) {
    const item = withAnswers
      ? /^[-*]\s+\[( |x|X)\]\s+(.+?)(?:\s+\{#([a-z0-9][a-z0-9_-]{0,39})\})?\s*$/.exec(line)
      : /^[-*]\s+(?:\[[ xX]\]\s+)?(.+?)(?:\s+\{#([a-z0-9][a-z0-9_-]{0,39})\})?\s*$/.exec(line);
    if (!item) continue;
    const label = (withAnswers ? item[2] : item[1]).trim();
    if (label.length > CHOICE_MAX_CHARS) throw elementError(id, "choice_too_long");
    const choice = { id: choiceId(label, withAnswers ? item[3] : item[2]), label };
    if (choices.some((existing) => existing.id === choice.id)) throw elementError(id, "duplicate_choice");
    choices.push(choice);
    if (withAnswers && item[1].toLowerCase() === "x") correct.push(choice.id);
  }
  if (choices.length > MAX_CHOICES) throw elementError(id, "too_many_choices");
  return { choices, correct };
}

function parseElement(block: FencedBlock): CommunityLessonElementWithAnswers {
  const [rawId = "", ...flags] = block.info.trim().split(/\s+/).filter(Boolean);
  const id = rawId.toLowerCase();
  if (!ELEMENT_ID.test(id)) throw elementError(rawId, "id");
  const type = block.language as CommunityLessonElementType;
  let required = false;
  let action: CommunityLessonButtonAction | undefined;
  let formKey: string | undefined;
  for (const flag of flags) {
    const formFlag = /^form=([A-Za-z0-9_.:-]{1,80})$/.exec(flag);
    const actionFlag = /^action=([a-z_]+)(?::([A-Za-z0-9_.:-]{1,80}))?$/.exec(flag);
    if (flag === "required" && type !== "form") required = true;
    else if (formFlag && type === "form") formKey = formFlag[1];
    else if (actionFlag && type === "button" &&
        (COMMUNITY_LESSON_BUTTON_ACTIONS as readonly string[]).includes(actionFlag[1]) &&
        Boolean(actionFlag[2]) === (actionFlag[1] === "open_form")) {
      action = actionFlag[1] as CommunityLessonButtonAction;
      formKey = actionFlag[2];
    } else throw elementError(id, "flag");
  }
  const lines = block.body.split("\n").map((line) => line.trim());
  const isChoice = (line: string) => /^[-*]\s+/.test(line);
  const prompt = lines.filter((line) => line && !isChoice(line) && !line.startsWith(">")).join(" ");
  if (prompt.length > PROMPT_MAX_CHARS) throw elementError(id, "prompt_too_long");
  if (type === "button") {
    if (!prompt) throw elementError(id, "label");
    if (prompt.length > CHOICE_MAX_CHARS) throw elementError(id, "label");
    return { id, type, required, prompt: "", label: prompt, action: action ?? "confirm",
      ...(formKey ? { form_key: formKey } : null) };
  }
  if (type === "form") {
    // The form itself lives in Polynet Forms; a Workflow stage assigns it and
    // the member submits it there. The lesson only says where to show it.
    if (!formKey) throw elementError(id, "form");
    return { id, type, required: false, prompt, form_key: formKey };
  }
  const choiceLines = lines.filter(isChoice);
  if (type === "checklist") {
    const { choices } = parseChoices(id, choiceLines, false);
    if (!choices.length) throw elementError(id, "items");
    return { id, type, required, prompt, choices };
  }
  const { choices, correct } = parseChoices(id, choiceLines, true);
  if (!prompt) throw elementError(id, "prompt");
  if (choices.length < 2) throw elementError(id, "options");
  if (!correct.length) throw elementError(id, "answer");
  const explanation = lines.filter((line) => line.startsWith(">")).map((line) => line.replace(/^>\s?/, "")).join("\n").trim();
  return {
    id, type, required, prompt, choices, multiple: correct.length > 1, correct,
    ...(explanation ? { explanation_md: explanation } : null),
  };
}

/**
 * Follow-along elements are fenced blocks named button, checklist, quiz or
 * form, with an id and flags on the opening line:
 *
 *   ```quiz pick-tool required
 *   Which app runs on your own computer?
 *   - [ ] Claude in the browser
 *   - [x] Claude Code
 *   > Claude Code runs locally, so it can read your files.
 *   ```
 *
 * A checklist is a list of items; a button is one line of text and may take
 * action=mark_done, action=ask_agent or action=open_form:<form key>. A form
 * block (form=<form key>) shows a Polynet Form inside the lesson: its answers
 * go through Forms, not here. A choice can pin its id with a trailing {#id};
 * otherwise the id comes from its text. "required" works on everything but forms.
 * strict throws on the first bad block (used when an agent stages a body);
 * otherwise a bad block stays plain code.
 */
export function parseCommunityLessonElements(
  bodyMd: string | null | undefined,
  options: { strict?: boolean } = {},
): CommunityLessonElementWithAnswers[] {
  const elements: CommunityLessonElementWithAnswers[] = [];
  const text = String(bodyMd ?? "").replace(/\r\n?/g, "\n");
  for (const block of fencedBlocks(text)) {
    if (!isElementBlock(block)) continue;
    let element: CommunityLessonElementWithAnswers;
    try {
      element = parseElement(block);
    } catch (error) {
      if (options.strict) throw error;
      continue;
    }
    if (elements.some((existing) => existing.id === element.id)) {
      if (options.strict) throw elementError(element.id, "duplicate_id");
      continue;
    }
    if (elements.length >= MAX_ELEMENTS) {
      if (options.strict) throw elementError(element.id, "too_many_elements");
      break;
    }
    elements.push(element);
  }
  return elements;
}

/**
 * The body as members get it: quiz blocks keep their options but lose the
 * [x] marks and the "> explanation" lines, which come back only through an
 * answer. Owners edit the original through the builder surfaces.
 */
export function redactCommunityLessonAnswers(bodyMd: string): string {
  const lines = String(bodyMd ?? "").split("\n");
  const out: string[] = [];
  let quizFence: string | null = null;
  let otherFence: string | null = null;
  for (const line of lines) {
    if (quizFence) {
      if (line.startsWith(quizFence)) {
        quizFence = null;
        out.push(line);
      } else if (!/^\s*>/.test(line)) {
        out.push(line.replace(/^(\s*[-*]\s+)\[[xX]\]/, "$1[ ]"));
      }
      continue;
    }
    if (otherFence) {
      if (line.startsWith(otherFence)) otherFence = null;
      out.push(line);
      continue;
    }
    const open = FENCE.exec(line);
    if (open) {
      if (open[2] === "quiz") quizFence = open[1];
      else otherFence = open[1];
    }
    out.push(line);
  }
  return out.join("\n");
}

export function publicCommunityLessonElement(element: CommunityLessonElementWithAnswers): CommunityLessonElement {
  const { correct: _correct, explanation_md: _explanation, ...visible } = element;
  return visible;
}

/**
 * Checks a member's response against its element. A button takes true, a
 * checklist the ids of the ticked items, a quiz the chosen option ids (one
 * unless several answers are right). Quizzes are graded here, never in the page.
 */
export function gradeCommunityLessonResponse(
  element: CommunityLessonElementWithAnswers,
  value: unknown,
): { value: CommunityLessonResponseValue; correct: boolean | null; complete: boolean } {
  if (element.type === "form") throw new Error("community_lesson_response_invalid");
  if (element.type === "button") {
    if (value !== true) throw new Error("community_lesson_response_invalid");
    return { value: true, correct: null, complete: true };
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("community_lesson_response_invalid");
  }
  const ids = [...new Set(value as string[])];
  const known = new Set((element.choices ?? []).map((choice) => choice.id));
  if (ids.some((id) => !known.has(id))) throw new Error("community_lesson_response_invalid");
  if (element.type === "checklist") {
    return { value: ids, correct: null, complete: ids.length === known.size };
  }
  if (!ids.length || (!element.multiple && ids.length > 1)) throw new Error("community_lesson_response_invalid");
  const correctIds = new Set(element.correct ?? []);
  const correct = ids.length === correctIds.size && ids.every((id) => correctIds.has(id));
  return { value: ids, correct, complete: correct };
}

const SLIDE_IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

// Markdown's own fence rules, so the deck agrees with how the page renders:
// up to three spaces, then three or more backticks (with no backtick in the
// info, like ```c#) or tildes. It closes on the same mark, at least as long,
// with nothing after it.
function markdownFenceOpen(line: string): string | null {
  return /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/.exec(line)?.[1] ?? null;
}
function markdownFenceCloses(line: string, fence: string): boolean {
  const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
  return Boolean(close && close[0] === fence[0] && close.length >= fence.length);
}

// Where a body's "## Slides" section starts and ends, by line. Headings inside
// a code example are text, not sections.
function findSlidesSection(lines: string[]): { heading: number; end: number } | null {
  let fence: string | null = null;
  let heading = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fence) {
      if (markdownFenceCloses(line, fence)) fence = null;
      continue;
    }
    const open = markdownFenceOpen(line);
    if (open) fence = open;
    else if (heading < 0 && /^## Slides[ \t]*$/.test(line)) heading = i;
    else if (heading >= 0 && /^## (?!#)/.test(line)) return { heading, end: i };
  }
  return heading < 0 ? null : { heading, end: lines.length };
}

// The section's image lines, each with the text under it as its note. Text
// before the first image is kept apart, and images in code examples stay text.
function parseSlides(lines: string[]): { preamble: string; slides: CommunityLessonSlide[]; complete: boolean } {
  const slides: CommunityLessonSlide[] = [];
  const notes: string[][] = [];
  const preamble: string[] = [];
  let fence: string | null = null;
  let complete = true;
  for (const line of lines) {
    const into = notes[notes.length - 1] ?? preamble;
    if (fence) {
      if (markdownFenceCloses(line, fence)) fence = null;
      into.push(line);
      continue;
    }
    const open = markdownFenceOpen(line);
    const image = open ? null : SLIDE_IMAGE.exec(line.trim());
    if (open) fence = open;
    if (!image) {
      into.push(line);
      continue;
    }
    if (slides.length >= MAX_SLIDES) {
      complete = false;
      break;
    }
    slides.push({ image: image[2], alt: image[1], note_md: "" });
    notes.push([]);
  }
  return {
    preamble: preamble.join("\n").trim(),
    slides: slides.map((slide, index) => ({ ...slide, note_md: notes[index].join("\n").trim() })),
    complete,
  };
}

/**
 * Splits a body around its "## Slides" section so a reader can show the deck
 * one slide at a time between the text before and after it. Text between the
 * heading and the first image reads just before the deck. Null, so the body
 * reads as written, when there's no slides section, it holds no image lines,
 * or it holds more slides than a deck shows.
 */
export function splitCommunityLessonSlides(
  bodyMd: string | null | undefined,
): { before: string; slides: CommunityLessonSlide[]; after: string } | null {
  const lines = String(bodyMd ?? "").replace(/\r\n?/g, "\n").split("\n");
  const section = findSlidesSection(lines);
  if (!section) return null;
  const deck = parseSlides(lines.slice(section.heading + 1, section.end));
  if (!deck.slides.length || !deck.complete) return null;
  const before = [lines.slice(0, section.heading).join("\n").trim(), deck.preamble].filter(Boolean).join("\n\n");
  return { before, slides: deck.slides, after: lines.slice(section.end).join("\n").trim() };
}

/**
 * Derives the structured parts of a lesson body:
 * - "### In <Platform>" headings split it into platform variants;
 * - a "## Slides" section of image lines, each followed by its note, is a deck;
 * - fenced code blocks are commands, tagged with the variant they sit in;
 * - button, checklist and quiz blocks are follow-along elements, not commands.
 * Text before the first variant heading is the shared intro.
 */
export function projectCommunityLessonBody(bodyMd: string | null | undefined): CommunityLessonProjection {
  const original = String(bodyMd ?? "").replace(/\r\n?/g, "\n");
  const text = redactCommunityLessonAnswers(original);
  const lines = text.split("\n");
  const section = findSlidesSection(lines);
  const main = section ? lines.slice(0, section.heading).join("\n") : text;
  const headings = [...main.matchAll(/^### In (.+?)\s*$/gm)];
  const intro = (headings.length ? main.slice(0, headings[0].index) : main).trim();
  const commands: CommunityLessonCommand[] = [];
  extractCommands(intro, null, commands);
  const variants: CommunityLessonVariant[] = [];
  const seen = new Set<string>();
  headings.slice(0, MAX_VARIANTS).forEach((heading, index) => {
    const label = heading[1].trim();
    const key = variantKey(label);
    if (seen.has(key)) return;
    seen.add(key);
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? main.length;
    const body = main.slice(start, end).trim();
    variants.push({ key, label, body_md: body });
    extractCommands(body, key, commands);
  });
  return {
    intro_md: intro,
    variants,
    slides: section ? parseSlides(lines.slice(section.heading + 1, section.end)).slides : [],
    commands,
    elements: parseCommunityLessonElements(original).map(publicCommunityLessonElement),
  };
}

export type CommunityLessonProgressStatus = "not_started" | "in_progress" | "done";

export type CommunityLessonStage = {
  name: string;
  order: number;
  lesson_count: number;
  done_count: number;
  locked: boolean;
  // The first unfinished gate in an earlier stage that keeps this one locked.
  blocked_by: string | null;
};

/**
 * Board columns and locks for one member. A stage opens once every gate in the
 * stages before it is done. Lessons without a stage are library-only and never
 * locked. Computed on read so a changed rule never leaves a stale lock behind.
 */
export function computeCommunityLessonStages(args: {
  lessons: Array<{ ref: string; lesson?: CommunityLessonFields | null }>;
  doneRefs: ReadonlySet<string>;
}): { stages: CommunityLessonStage[]; lockedRefs: Set<string> } {
  const byStage = new Map<string, { order: number; refs: string[]; gates: string[] }>();
  for (const entry of args.lessons) {
    const stage = entry.lesson?.stage;
    if (!stage) continue;
    const group = byStage.get(stage) ?? { order: entry.lesson?.stage_order ?? Number.MAX_SAFE_INTEGER, refs: [], gates: [] };
    group.order = Math.min(group.order, entry.lesson?.stage_order ?? Number.MAX_SAFE_INTEGER);
    group.refs.push(entry.ref);
    if (entry.lesson?.gate) group.gates.push(entry.ref);
    byStage.set(stage, group);
  }
  const ordered = [...byStage.entries()].sort(
    ([leftName, left], [rightName, right]) => left.order - right.order || leftName.localeCompare(rightName),
  );
  const lockedRefs = new Set<string>();
  let blockedBy: string | null = null;
  const stages = ordered.map(([name, group]) => {
    const locked = blockedBy !== null;
    if (locked) group.refs.forEach((ref) => lockedRefs.add(ref));
    const stage: CommunityLessonStage = {
      name,
      order: group.order === Number.MAX_SAFE_INTEGER ? 0 : group.order,
      lesson_count: group.refs.length,
      done_count: group.refs.filter((ref) => args.doneRefs.has(ref)).length,
      locked,
      blocked_by: blockedBy,
    };
    blockedBy = blockedBy ?? group.gates.find((ref) => !args.doneRefs.has(ref)) ?? null;
    return stage;
  });
  return { stages, lockedRefs };
}
