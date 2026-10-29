import type { CommunityFormQuestion } from "./communityForms";
import { communityClientAnswerFormatIssue } from "./communityClients";
export type FormAnswers = Record<string, string | string[]>;
export function formQuestionAnswered(q: CommunityFormQuestion, answers: FormAnswers): boolean {
  const answer = answers[q.key];
  return Array.isArray(answer) ? answer.length > 0 : typeof answer === "string" && answer.trim().length > 0;
}
export function formAnswersIssue(questions: CommunityFormQuestion[], answers: FormAnswers, submitting = false): string | null {
  if (Object.keys(answers).some(key => !questions.some(q => q.key === key))) return "Unknown question.";
  for (const q of questions) {
    const a = answers[q.key];
    if (a !== undefined) {
      if (q.type === "multiple_choice") {
        if (!Array.isArray(a) || a.length > q.options.length || new Set(a).size !== a.length
          || a.some(v => !q.options.map((_, i) => String(i)).includes(v))) return "Invalid choices.";
      } else if (typeof a !== "string" || a.length > 10000) return "Invalid answer.";
      else if (q.type === "single_choice" && a !== "" && !q.options.map((_, i) => String(i)).includes(a)) return "Invalid choice.";
    }
    if (submitting && q.required && !formQuestionAnswered(q, answers)) return "Please answer all required questions.";
    if (submitting && q.answerFormat && typeof a === "string") {
      const issue = communityClientAnswerFormatIssue(q.answerFormat, a);
      if (issue) return `${q.title}: ${issue}`;
    }
  }
  return null;
}
