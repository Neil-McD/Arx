import { COMMUNITY_FORM_MAX_QUESTIONS, type CommunityFormContent, type CommunityFormQuestion } from "./communityForms";
import { communityClientPropertyAcceptsQuestion, communityClientUnmatchedOptions, type CommunityClientPropertyType } from "./communityClients";

// "Draft with The Builder": the agent writes a form from a short brief and maps
// each question to a member field it can fill. Its reply is untrusted text, so
// everything here is clamped to what a draft form may hold, and a mapping that
// the field can't take is dropped rather than saved broken.

export type AgentDraftProperty = { key: string; name: string; type: string; options: string[] };
const TYPES: CommunityFormQuestion["type"][] = ["short_text", "long_text", "single_choice", "multiple_choice"];
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export const COMMUNITY_FORM_AGENT_DRAFT_MAX_QUESTIONS = 12;

export function communityFormAgentDraftPrompt(): string {
  return [
    "You write short onboarding forms for an online community. The owner describes what the form is for.",
    "Reply with JSON only, no prose and no code fence, shaped like:",
    '{"name": "Form name", "questions": [{"title": "Question", "description": "", "type": "short_text", "required": true, "options": [], "fills": null}]}',
    `Rules: at most ${COMMUNITY_FORM_AGENT_DRAFT_MAX_QUESTIONS} questions, usually 3 to 6. type is one of short_text, long_text, single_choice, multiple_choice.`,
    "Choice questions need 2 to 12 short, distinct options. Write questions in plain, warm words a member answers in seconds.",
    "fills is the key of one of the member fields you are given, when the answer belongs in that field, otherwise null.",
    "A select field only takes single_choice with options from its list; multi_select only multiple_choice from its list; number, date and url only short_text; text takes any type.",
    "Never invent a field key.",
  ].join("\n");
}

function parseJson(reply: string): any {
  const start = reply.indexOf("{"), end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("form_draft_unreadable");
  try { return JSON.parse(reply.slice(start, end + 1)); } catch { throw new Error("form_draft_unreadable"); }
}

/** The agent's reply as a form the builder can open, with fresh question keys. */
export function normalizeCommunityFormAgentDraft(reply: string, properties: AgentDraftProperty[], newKey: () => string): CommunityFormContent {
  const raw = parseJson(reply);
  const questions: CommunityFormQuestion[] = [];
  for (const item of Array.isArray(raw?.questions) ? raw.questions : []) {
    if (questions.length >= Math.min(COMMUNITY_FORM_AGENT_DRAFT_MAX_QUESTIONS, COMMUNITY_FORM_MAX_QUESTIONS)) break;
    const title = text(item?.title, 500);
    if (!title) continue;
    let type: CommunityFormQuestion["type"] = TYPES.includes(item?.type) ? item.type : "short_text";
    const seen = new Set<string>();
    let options: string[] = type.endsWith("choice") ? (Array.isArray(item?.options) ? item.options : [])
      .map((option: unknown) => text(option, 200))
      .filter((option: string) => option && !seen.has(option.toLowerCase()) && Boolean(seen.add(option.toLowerCase())))
      .slice(0, 12) : [];
    if (type.endsWith("choice") && options.length < 2) { type = "short_text"; options = []; }
    const question: CommunityFormQuestion = { key: newKey(), title, description: text(item?.description, 2000), type, required: item?.required !== false, options };
    const property = properties.find(p => p.key === item?.fills);
    if (property && communityClientPropertyAcceptsQuestion(property.type as CommunityClientPropertyType, type)
      && !communityClientUnmatchedOptions(property as any, question).length) question.clientPropertyKey = property.key;
    questions.push(question);
  }
  if (!questions.length) throw new Error("form_draft_empty");
  return { name: text(raw?.name, 120) || "Untitled form", questions };
}
