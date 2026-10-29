import {
  COMMUNITY_LESSON_BUTTON_ACTIONS,
  parseCommunityLessonElements,
  type CommunityLessonButtonAction,
  type CommunityLessonElementWithAnswers,
} from "../../../../../shared/communityLessonContract";
import { COMMUNITY_EMBED_LANGUAGE, parseCommunityEmbedBlock } from "../../../../../shared/communityEmbed";
import { fencedBlockMarkdown } from "./lessonMarkdown";

// The cards' form fields <-> the fenced block text, in the lesson contract's
// own syntax (shared/communityLessonContract.ts). Ids never change once a
// block exists: members' answers are stored against them.

export type LessonBlockAttrs = { language: string; info: string; body: string };

export type LessonChoiceDraft = { id: string | null; label: string; correct: boolean };

export type LessonElementDraft = {
  type: "button" | "checklist" | "quiz" | "form";
  id: string;
  required: boolean;
  prompt: string;
  label: string;
  action: CommunityLessonButtonAction;
  formKey: string;
  choices: LessonChoiceDraft[];
  explanation: string;
};

export type LessonEmbedDraft = { src: string; title: string; height: string; fallback: string };

const CHOICE_LINE = /^[-*]\s+(?:\[( |x|X)\]\s+)?(.+?)(?:\s+\{#([a-z0-9][a-z0-9_-]{0,39})\})?\s*$/;

export function choiceIdFor(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "choice";
}

export function readElementDraft(attrs: LessonBlockAttrs): LessonElementDraft {
  const [id = "", ...flags] = attrs.info.trim().split(/\s+/).filter(Boolean);
  let action: CommunityLessonButtonAction = "confirm";
  let formKey = "";
  let required = false;
  for (const flag of flags) {
    if (flag === "required") required = true;
    const formFlag = /^form=(.+)$/.exec(flag);
    if (formFlag) formKey = formFlag[1];
    const actionFlag = /^action=([a-z_]+)(?::(.+))?$/.exec(flag);
    if (actionFlag && (COMMUNITY_LESSON_BUTTON_ACTIONS as readonly string[]).includes(actionFlag[1])) {
      action = actionFlag[1] as CommunityLessonButtonAction;
      if (actionFlag[2]) formKey = actionFlag[2];
    }
  }
  const lines = attrs.body.split("\n").map((line) => line.trim());
  const choices: LessonChoiceDraft[] = [];
  const prompt: string[] = [];
  const explanation: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith(">")) {
      explanation.push(line.replace(/^>\s?/, ""));
      continue;
    }
    const choice = /^[-*]\s+/.test(line) ? CHOICE_LINE.exec(line) : null;
    if (choice) {
      choices.push({ id: choice[3] ?? null, label: choice[2].trim(), correct: (choice[1] ?? "").toLowerCase() === "x" });
      continue;
    }
    prompt.push(line);
  }
  const type = attrs.language as LessonElementDraft["type"];
  return {
    type,
    id: id.toLowerCase(),
    required,
    prompt: type === "button" ? "" : prompt.join(" "),
    label: type === "button" ? prompt.join(" ") : "",
    action,
    formKey,
    choices,
    explanation: explanation.join("\n"),
  };
}

export function writeElementDraft(draft: LessonElementDraft): LessonBlockAttrs {
  const flags: string[] = [draft.id];
  if (draft.required && draft.type !== "form") flags.push("required");
  if (draft.type === "form") flags.push(`form=${draft.formKey.trim()}`);
  if (draft.type === "button" && draft.action !== "confirm") {
    flags.push(draft.action === "open_form" ? `action=open_form:${draft.formKey.trim()}` : `action=${draft.action}`);
  }
  const lines: string[] = [];
  if (draft.type === "button") lines.push(draft.label.trim());
  else if (draft.prompt.trim()) lines.push(draft.prompt.trim());
  if (draft.type === "checklist" || draft.type === "quiz") {
    for (const choice of draft.choices) {
      const label = choice.label.replace(/\s+/g, " ").trim();
      if (!label) continue;
      // A choice keeps the id it had when its text changes, so answers stay attached.
      const pin = choice.id && choice.id !== choiceIdFor(label) ? ` {#${choice.id}}` : "";
      const box = draft.type === "quiz" ? (choice.correct ? "[x] " : "[ ] ") : "";
      lines.push(`- ${box}${label}${pin}`);
    }
  }
  if (draft.type === "quiz" && draft.explanation.trim()) {
    for (const line of draft.explanation.trim().split("\n")) lines.push(`> ${line}`);
  }
  return { language: draft.type, info: flags.join(" "), body: lines.join("\n") };
}

/** When a choice's text changes, the id it was saved under. */
export function settleChoiceId(choice: LessonChoiceDraft): string {
  return choice.id ?? choiceIdFor(choice.label);
}

export function readEmbedDraft(body: string): LessonEmbedDraft {
  const fields = new Map<string, string>();
  for (const line of body.split("\n")) {
    const separator = line.indexOf(":");
    if (separator > 0) fields.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }
  return {
    src: fields.get("src") ?? "",
    title: fields.get("title") ?? "",
    height: fields.get("height") ?? "",
    fallback: fields.get("fallback") ?? "",
  };
}

export function writeEmbedDraft(draft: LessonEmbedDraft): LessonBlockAttrs {
  const lines = [`src: ${draft.src.trim()}`];
  if (draft.title.trim()) lines.push(`title: ${draft.title.trim()}`);
  if (draft.height.trim()) lines.push(`height: ${draft.height.trim()}`);
  if (draft.fallback.trim()) lines.push(`fallback: ${draft.fallback.trim()}`);
  return { language: COMMUNITY_EMBED_LANGUAGE, info: "", body: lines.join("\n") };
}

const PROBLEM_TEXT: Record<string, string> = {
  id: "Its id must be lowercase letters, numbers, - or _.",
  flag: "One of its settings isn't one Polynet knows.",
  label: "A button needs its text (up to 300 characters).",
  form: "Pick the Polynet Form to show.",
  items: "Add at least one item.",
  prompt: "Write the question.",
  options: "A quiz needs at least two options.",
  answer: "Mark at least one option as the right answer.",
  duplicate_choice: "Two options have the same text.",
  choice_too_long: "An option is longer than 300 characters.",
  too_many_choices: "Use 20 options or fewer.",
  prompt_too_long: "The question is longer than 1,000 characters.",
  duplicate_id: "Another block in this lesson already uses this id.",
};

/** What the server would say about this block, in words; null when it's valid. */
export function lessonBlockProblem(attrs: LessonBlockAttrs): string | null {
  const markdown = fencedBlockMarkdown(attrs.language, attrs.info, attrs.body);
  if (attrs.language === COMMUNITY_EMBED_LANGUAGE) {
    const result = parseCommunityEmbedBlock(attrs.body);
    return result.ok ? null : result.message;
  }
  try {
    parseCommunityLessonElements(markdown, { strict: true });
    return null;
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":").pop() ?? "" : "";
    return PROBLEM_TEXT[code] ?? "Polynet can't read this block yet.";
  }
}

/** The element as the server parses it, answers included (the editor is owner-only). */
export function lessonBlockElement(attrs: LessonBlockAttrs): CommunityLessonElementWithAnswers | null {
  try {
    return parseCommunityLessonElements(fencedBlockMarkdown(attrs.language, attrs.info, attrs.body), { strict: true })[0] ?? null;
  } catch {
    return null;
  }
}

const STARTERS: Record<string, (id: string) => LessonBlockAttrs> = {
  button: (id) => ({ language: "button", info: `${id} action=mark_done`, body: "Mark this lesson done" }),
  checklist: (id) => ({ language: "checklist", info: id, body: "Before you move on:\n- First thing to do\n- Second thing to do" }),
  quiz: (id) => ({ language: "quiz", info: id, body: "Your question\n- [x] The right answer\n- [ ] Another option" }),
  form: (id) => ({ language: "form", info: `${id} form=`, body: "" }),
  [COMMUNITY_EMBED_LANGUAGE]: () => ({ language: COMMUNITY_EMBED_LANGUAGE, info: "", body: "src: embeds/widget.html\ntitle: Interactive" }),
};

/** A new block of a kind, with an id no other block in the lesson uses. */
export function starterLessonBlock(language: string, takenIds: ReadonlySet<string>): LessonBlockAttrs {
  let n = 1;
  while (takenIds.has(`${language}-${n}`)) n += 1;
  return STARTERS[language](`${language}-${n}`);
}

export function lessonBlockId(attrs: LessonBlockAttrs): string | null {
  if (attrs.language === COMMUNITY_EMBED_LANGUAGE) return null;
  return attrs.info.trim().split(/\s+/)[0]?.toLowerCase() || null;
}
