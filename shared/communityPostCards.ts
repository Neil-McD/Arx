// A post can carry one card: a quick poll members vote on, or one of the
// community's published Forms for members to fill in. The card lives beside
// the post (convex/communityPostCards.ts); the post's own text is a plain
// fallback for surfaces that don't draw cards (digests, notifications, agents
// reading text).

export const POLL_QUESTION_MAX_CHARS = 300;
export const POLL_OPTION_MAX_CHARS = 120;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 10;
export const POST_FORM_NOTE_MAX_CHARS = 1_000;
// Faces shown per poll option and per form; counts stay exact.
export const POST_CARD_FACES = 24;

export type PostCardPerson = { user_id: string; name: string; avatar_url: string | null };

export type PostPollCard = {
  kind: "poll";
  id: string;
  question: string;
  multiple: boolean;
  closed: boolean;
  total_voters: number;
  options: Array<{ key: string; label: string; count: number; voters: PostCardPerson[] }>;
  viewer_choices: string[];
  can_close: boolean;
};

export type PostFormCard = {
  kind: "form";
  id: string;
  form_name: string;
  note: string;
  question_count: number;
  // "everyone": every member sees each answer; "builders": members see who answered.
  answers_visible_to: "everyone" | "builders";
  response_count: number;
  responders: PostCardPerson[];
  viewer_status: "none" | "draft" | "submitted";
  can_view_answers: boolean;
};

export type PostCard = PostPollCard | PostFormCard;

export type PostFormResponseRow = {
  person: PostCardPerson;
  submitted_at: string;
  answers: Array<{ question: string; answer: string }> | null;
};

export function normalizePollInput(input: { question: unknown; options: unknown; multiple?: unknown }):
  { question: string; options: string[]; multiple: boolean } | { issue: string } {
  const question = String(input.question ?? "").replace(/\s+/g, " ").trim();
  if (!question) return { issue: "poll_question_required" };
  if (question.length > POLL_QUESTION_MAX_CHARS) return { issue: "poll_question_too_long" };
  const raw = Array.isArray(input.options) ? input.options : [];
  const options = raw.map((option) => String(option ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) return { issue: "poll_options_count" };
  if (options.some((option) => option.length > POLL_OPTION_MAX_CHARS)) return { issue: "poll_option_too_long" };
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) return { issue: "poll_options_duplicate" };
  return { question, options, multiple: input.multiple === true };
}

export function pollFallbackText(question: string, options: string[]): string {
  return [`📊 Poll: ${question}`, ...options.map((option) => `• ${option}`)].join("\n");
}

export function formFallbackText(formName: string, note: string): string {
  return [`📝 Form: ${formName}`, note].filter(Boolean).join("\n\n");
}

const POST_CARD_ISSUES: Record<string, string> = {
  poll_question_required: "Write the question.",
  poll_question_too_long: `Keep the question under ${POLL_QUESTION_MAX_CHARS} characters.`,
  poll_options_count: `Give ${POLL_MIN_OPTIONS} to ${POLL_MAX_OPTIONS} options.`,
  poll_option_too_long: `Keep each option under ${POLL_OPTION_MAX_CHARS} characters.`,
  poll_options_duplicate: "Each option needs to be different.",
  poll_closed: "This poll is closed.",
  poll_choice_invalid: "Pick one of the poll's options.",
  post_form_unpublished: "Publish the form before sharing it.",
  post_form_not_found: "That form isn't available any more.",
  form_already_submitted: "You already sent your answers.",
};

export function postCardIssueText(error: unknown, fallback: string): string {
  const text = String((error as { message?: unknown })?.message ?? error ?? "");
  const code = Object.keys(POST_CARD_ISSUES).find((key) => text.includes(key));
  return code ? POST_CARD_ISSUES[code]! : fallback;
}
