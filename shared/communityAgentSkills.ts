// Skill fragments for the community agent's role prompts. Each skill is a
// reusable discipline injected into a role's instruction stack as a tagged
// block (Codex pattern: skills are delimited fragments, not permanent prompt
// weight). Keep each one short, imperative, and role-agnostic.

export type CommunityAgentSkillKey =
  | "duplicate_discipline"
  | "envelope_quality"
  | "repetition_is_not_evidence"
  | "ledger_discipline";

const SKILLS: Record<CommunityAgentSkillKey, string> = {
  duplicate_discipline: [
    "Before proposing any candidate, check the recent node titles in <directory_state>",
    "and search the directory for close matches. If an existing node covers the same",
    "claim, do not propose a duplicate — note the overlap in the ledger instead.",
  ].join(" "),
  envelope_quality: [
    "A learning envelope is only useful if its rejected alternative is a real position",
    "someone could hold, not a strawman, and its falsification criteria are concrete",
    "and testable from future traces or outcomes. If you cannot state a genuine rejected",
    "alternative and a testable falsification condition, the item is not ready to propose.",
  ].join(" "),
  repetition_is_not_evidence: [
    "Frequency is not validation. A claim repeated often with no outcome evidence is",
    "still anecdotal. Weight items by outcome linkage and evidence strength, not by how",
    "many times the pattern appears in chat or feed activity.",
  ].join(" "),
  ledger_discipline: [
    "Ledger notes must be self-contained: reference the digest item index they concern,",
    "state a clear verdict or question, and give the reason in one or two sentences.",
    "The next role sees only the ledger and the directory state — write for that reader.",
  ].join(" "),
};

export function renderCommunityAgentSkills(keys: readonly CommunityAgentSkillKey[]): string {
  return keys
    .map((key) => `<skill name="${key}">\n${SKILLS[key]}\n</skill>`)
    .join("\n");
}
