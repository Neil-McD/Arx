export type CommunityFormQuestion = {
  key: string;
  title: string;
  description: string;
  type: "short_text" | "long_text" | "single_choice" | "multiple_choice";
  required: boolean;
  options: string[];
};
export type CommunityFormContent = { name: string; questions: CommunityFormQuestion[] };
export type CommunityFormDraft = CommunityFormContent & {
  key: string; revision: number; publishedRevision: number | null;
};
export const COMMUNITY_FORM_MAX_QUESTIONS = 30;
export const COMMUNITY_FORM_MAX_FORMS = 30;

// Empty question text is valid in a draft, never in a published version.
export function communityFormIssue(form: CommunityFormContent, publishing = false): string | null {
  if (form.name.length > 120 || (publishing && !form.name.trim())) return "Give the form a name.";
  if (!form.questions.length || form.questions.length > COMMUNITY_FORM_MAX_QUESTIONS) return "Use between 1 and 30 questions.";
  const keys = new Set<string>();
  for (const q of form.questions) {
    if (!q.key || q.key.length > 80 || keys.has(q.key)) return "Question identifiers must be unique.";
    keys.add(q.key);
    if (q.title.length > 500 || q.description.length > 2000) return "Shorten the question or description.";
    if (publishing && !q.title.trim()) return "Give every question a title.";
    if (q.options.length > 12 || q.options.some(o => o.length > 200)) return "Use at most 12 options, each under 200 characters.";
    if (publishing && q.type.endsWith("choice") &&
      (q.options.length < 2 || q.options.some(o => !o.trim()) || new Set(q.options.map(o => o.trim().toLowerCase())).size !== q.options.length)) {
      return "Choice questions need at least two distinct, non-empty options.";
    }
  }
  return null;
}

export function blankCommunityFormQuestion(): CommunityFormQuestion {
  return { key: crypto.randomUUID(), title: "", description: "", type: "short_text", required: true, options: [] };
}
