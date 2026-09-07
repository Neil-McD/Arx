import type { FormAnswers } from "../../../../shared/communityFormAnswers";

export type FormSaveIntent = "autosave" | "continue" | "close" | "submit";
type Attempt = { intent: FormSaveIntent; answers: FormAnswers; revision: number };
type Receipt = { revision: number; submitted: boolean };

// One request at a time. A retry preserves the exact payload, including submit,
// so a lost response can use the server's existing idempotency contract.
export function createMemberFormSave(initial: { answers: FormAnswers; revision: number },
  write: (attempt: Attempt) => Promise<Receipt>) {
  let revision = initial.revision;
  let saved = JSON.stringify(initial.answers);
  let failed: Attempt | null = null;
  let active = false;
  return {
    dirty: (answers: FormAnswers) => JSON.stringify(answers) !== saved,
    async run(intent: FormSaveIntent, answers: FormAnswers, retry = false) {
      if (active) return null;
      if (failed && !retry) throw new Error("form_retry_required");
      const attempt = retry && failed ? failed : {
        intent, answers: structuredClone(answers), revision,
      };
      active = true;
      try {
        const receipt = attempt.intent !== "submit" && JSON.stringify(attempt.answers) === saved
          ? { revision, submitted: false }
          : await write(attempt);
        revision = receipt.revision;
        saved = JSON.stringify(attempt.answers);
        failed = null;
        return { ...receipt, intent: attempt.intent };
      } catch (error) {
        failed = attempt;
        throw error;
      } finally { active = false; }
    },
  };
}
