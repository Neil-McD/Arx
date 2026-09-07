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
export type CommunityFormValidationIssue = { message: string; questionIndex?: number; field?: "name" | "title" | "description" | "options" };
export function communityFormValidationIssue(form: CommunityFormContent, publishing = false): CommunityFormValidationIssue | null {
  if (form.name.length > 120 || (publishing && !form.name.trim())) return { message: "Give the form a name.", field: "name" };
  if (!form.questions.length || form.questions.length > COMMUNITY_FORM_MAX_QUESTIONS) return { message: "Use between 1 and 30 questions." };
  const keys = new Set<string>();
  for (const [questionIndex, q] of form.questions.entries()) {
    if (!q.key || q.key.length > 80 || keys.has(q.key)) return { message: "Question identifiers must be unique.", questionIndex };
    keys.add(q.key);
    if (q.title.length > 500 || q.description.length > 2000) return { message: "Shorten the question or description.", questionIndex, field: q.title.length > 500 ? "title" : "description" };
    if (publishing && !q.title.trim()) return { message: "Give every question a title.", questionIndex, field: "title" };
    if (q.options.length > 12 || q.options.some(o => o.length > 200)) return { message: "Use at most 12 options, each under 200 characters.", questionIndex, field: "options" };
    if (publishing && q.type.endsWith("choice") &&
      (q.options.length < 2 || q.options.some(o => !o.trim()) || new Set(q.options.map(o => o.trim().toLowerCase())).size !== q.options.length)) {
      return { message: "Choice questions need at least two distinct, non-empty options.", questionIndex, field: "options" };
    }
  }
  return null;
}

// Preserve the backend's string error contract; editor targeting shares its rules.
export function communityFormIssue(form: CommunityFormContent, publishing = false): string | null {
  return communityFormValidationIssue(form, publishing)?.message ?? null;
}

export function blankCommunityFormQuestion(): CommunityFormQuestion {
  return { key: crypto.randomUUID(), title: "", description: "", type: "short_text", required: true, options: [] };
}
