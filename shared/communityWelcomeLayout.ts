// The welcome page as one long page the owner writes, split into screens by
// "Next" breaks. Words and media are markdown text blocks (a link alone on a
// line plays as a video or shows as an image). A form or a lesson is a step:
// the member finishes it before going on, so each screen holds at most one.
// A choice shows cards (say, the app they use); picking one shows only its words.

/** icon: an https image link, or a small inline image (data:image/…), shown on the card. */
export type WelcomeChoiceOption = { label: string; hint: string; markdown: string; icon?: string };

export type WelcomeBlock =
  | { type: "text"; markdown: string }
  /** agent: shows the community's agent (its photo and name) above the cards as the plugin that connects to the picked app. */
  | { type: "choice"; prompt: string; options: WelcomeChoiceOption[]; agent?: boolean }
  | { type: "form"; formKey: string }
  | { type: "lesson"; resourceId: string }
  | { type: "next" };

export type WelcomeStep = { type: "form"; formKey: string } | { type: "lesson"; resourceId: string };
export type WelcomeScreen = { blocks: WelcomeBlock[]; step: WelcomeStep | null };

export const WELCOME_BLOCKS_MAX = 40;
export const WELCOME_TEXT_MAX = 4_000;
export const WELCOME_TEXT_TOTAL_MAX = 12_000;
export const WELCOME_FORMS_MAX = 5;
export const WELCOME_LESSONS_MAX = 5;
export const WELCOME_CHOICES_MAX = 3;
export const WELCOME_CHOICE_OPTIONS_MAX = 4;
export const WELCOME_CHOICE_PROMPT_MAX = 120;
export const WELCOME_CHOICE_LABEL_MAX = 40;
export const WELCOME_CHOICE_HINT_MAX = 160;
/** One option's words: room for a setup prompt someone pastes into their AI. */
export const WELCOME_CHOICE_TEXT_MAX = 8_000;
export const WELCOME_CHOICE_TEXT_TOTAL_MAX = 30_000;
export const WELCOME_CHOICE_ICON_MAX = 8_000;

/** A card icon must be an https image link or a small inline image; anything else is refused. */
export function isWelcomeChoiceIcon(value: string): boolean {
  return value.length <= WELCOME_CHOICE_ICON_MAX
    && (/^https:\/\/\S+$/i.test(value) || /^data:image\/(?:svg\+xml|png|jpeg|webp|gif)(?:;base64)?,[^\s"'<>]+$/i.test(value));
}

const isStepBlock = (block: WelcomeBlock): block is WelcomeStep => block.type === "form" || block.type === "lesson";

/** Screens in order. Empty screens (two breaks in a row, or a break at either end) are dropped. */
export function welcomeScreens(layout: WelcomeBlock[]): WelcomeScreen[] {
  const screens: WelcomeScreen[] = [];
  let current: WelcomeScreen = { blocks: [], step: null };
  const close = () => { if (current.blocks.length) screens.push(current); current = { blocks: [], step: null }; };
  for (const block of layout) {
    if (block.type === "next") { close(); continue; }
    if (block.type === "text" && !block.markdown.trim()) continue;
    if (isStepBlock(block)) {
      // A second step on one screen starts a screen of its own.
      if (current.step) close();
      current.step = block;
    }
    current.blocks.push(block);
  }
  close();
  return screens;
}

/** The page a welcome flow saved before blocks existed: the words and media first, then each step on its own screen. */
export function legacyWelcomeLayout(page: { message?: string | null; mediaUrl?: string | null; formKeys: string[]; lessonIds: string[] }): WelcomeBlock[] {
  const intro = [page.message?.trim(), page.mediaUrl?.trim()].filter(Boolean).join("\n\n");
  const steps: WelcomeBlock[] = [
    ...page.formKeys.map((formKey) => ({ type: "form" as const, formKey })),
    ...page.lessonIds.map((resourceId) => ({ type: "lesson" as const, resourceId })),
  ];
  return [
    ...(intro ? [{ type: "text" as const, markdown: intro }] : []),
    ...steps.flatMap((step, index) => (index ? [{ type: "next" as const }, step] : [step])),
  ];
}

/** The saved layout, with the join forms it doesn't place yet added as screens at the end, so none is hidden. */
export function welcomeLayoutWithForms(layout: WelcomeBlock[], formKeys: string[]): WelcomeBlock[] {
  const placed = new Set(layout.flatMap((block) => (block.type === "form" ? [block.formKey] : [])));
  const missing = formKeys.filter((key) => !placed.has(key));
  return [...layout, ...missing.flatMap((formKey) => [{ type: "next" as const }, { type: "form" as const, formKey }])];
}

export function welcomeLayoutSteps(layout: WelcomeBlock[]) {
  return {
    formKeys: layout.flatMap((block) => (block.type === "form" ? [block.formKey] : [])),
    lessonIds: layout.flatMap((block) => (block.type === "lesson" ? [block.resourceId] : [])),
  };
}

/** Tidies what the editor sends: trims text, drops empty text and breaks that start, end or repeat. */
export function normalizeWelcomeLayout(layout: WelcomeBlock[]): WelcomeBlock[] {
  const out: WelcomeBlock[] = [];
  for (const block of layout) {
    if (block.type === "text") {
      const markdown = block.markdown.replace(/\r\n?/g, "\n").trim();
      if (markdown) out.push({ type: "text", markdown });
    } else if (block.type === "next") {
      if (out.length && out[out.length - 1].type !== "next") out.push({ type: "next" });
    } else if (block.type === "choice") {
      const options = block.options.map((option) => ({
        label: option.label.replace(/\s+/g, " ").trim(),
        hint: option.hint.replace(/\s+/g, " ").trim(),
        markdown: option.markdown.replace(/\r\n?/g, "\n").trim(),
        ...(option.icon?.trim() ? { icon: option.icon.trim() } : {}),
      })).filter((option) => option.label || option.markdown);
      if (options.length) out.push({ type: "choice", prompt: block.prompt.replace(/\s+/g, " ").trim(), options, ...(block.agent ? { agent: true } : {}) });
    } else if (block.type === "form") out.push({ type: "form", formKey: block.formKey.trim() });
    else out.push({ type: "lesson", resourceId: block.resourceId.trim() });
  }
  while (out.length && out[out.length - 1].type === "next") out.pop();
  return out;
}

export type WelcomeLayoutIssue =
  | "welcome_layout_too_long" | "welcome_text_too_long" | "welcome_forms_too_many" | "welcome_lessons_too_many"
  | "welcome_step_duplicate" | "welcome_step_invalid"
  | "welcome_choices_too_many" | "welcome_choice_invalid" | "welcome_choice_too_long";

/** Why a normalized layout can't be saved, or null. */
export function welcomeLayoutIssue(layout: WelcomeBlock[]): WelcomeLayoutIssue | null {
  if (layout.length > WELCOME_BLOCKS_MAX) return "welcome_layout_too_long";
  let total = 0;
  for (const block of layout) {
    if (block.type !== "text") continue;
    if (block.markdown.length > WELCOME_TEXT_MAX) return "welcome_text_too_long";
    total += block.markdown.length;
  }
  if (total > WELCOME_TEXT_TOTAL_MAX) return "welcome_text_too_long";
  const choices = layout.flatMap((block) => (block.type === "choice" ? [block] : []));
  if (choices.length > WELCOME_CHOICES_MAX) return "welcome_choices_too_many";
  let choiceTotal = 0;
  for (const choice of choices) {
    if (choice.prompt.length > WELCOME_CHOICE_PROMPT_MAX || choice.options.length > WELCOME_CHOICE_OPTIONS_MAX) return "welcome_choice_invalid";
    for (const option of choice.options) {
      if (!option.label || option.label.length > WELCOME_CHOICE_LABEL_MAX || option.hint.length > WELCOME_CHOICE_HINT_MAX) return "welcome_choice_invalid";
      if (option.icon !== undefined && !isWelcomeChoiceIcon(option.icon)) return "welcome_choice_invalid";
      if (option.markdown.length > WELCOME_CHOICE_TEXT_MAX) return "welcome_choice_too_long";
      choiceTotal += option.markdown.length;
    }
  }
  if (choiceTotal > WELCOME_CHOICE_TEXT_TOTAL_MAX) return "welcome_choice_too_long";
  const { formKeys, lessonIds } = welcomeLayoutSteps(layout);
  if (formKeys.some((key) => !key) || lessonIds.some((id) => !id)) return "welcome_step_invalid";
  if (formKeys.length > WELCOME_FORMS_MAX) return "welcome_forms_too_many";
  if (lessonIds.length > WELCOME_LESSONS_MAX) return "welcome_lessons_too_many";
  if (new Set(formKeys).size !== formKeys.length || new Set(lessonIds).size !== lessonIds.length) return "welcome_step_duplicate";
  return null;
}
