// The community agent's role registry. One agent entity, role prompts on the
// same harness (contract Amendment v1.1): sleep roles chained per heartbeat
// cycle, sharing a cycle ledger. Authority is expressed by tool-list absence —
// only the steward's list contains the airlock "write" tool, so no other role
// can even attempt a directory proposal.

import type { CommunityAgentSkillKey } from "./communityAgentSkills";
import type { CommunityAgentToolName } from "./communityAgentToolProtocol";

export type CommunityAgentRoleKey = "observer" | "questioner" | "steward";

export const COMMUNITY_AGENT_CYCLE_ROLES: readonly CommunityAgentRoleKey[] = [
  "observer",
  "questioner",
  "steward",
];

// Deterministic short-circuit convention: when the observer finds nothing worth
// the rest of the cycle, its single ledger note starts with this marker.
export const COMMUNITY_AGENT_NO_SIGNAL_MARKER = "NO_SIGNAL";

export type CommunityAgentRoleDefinition = {
  roleKey: CommunityAgentRoleKey;
  rolePrompt: string;
  skillKeys: readonly CommunityAgentSkillKey[];
  toolNames: readonly CommunityAgentToolName[];
  reasoningEffort: "low" | "medium" | "high";
  maxToolSteps: number;
};

const ROLE_DEFINITIONS: Record<CommunityAgentRoleKey, CommunityAgentRoleDefinition> = {
  observer: {
    roleKey: "observer",
    rolePrompt: [
      "Role: Observer. You triage the compiler window for this cycle.",
      "The injected digest gives each inspectable learning item an evidencePath. Read only those exact paths;",
      "do not list filesystem directories or construct paths for items whose evidencePath is null.",
      "Judge the evidence: is it meaningful, novel, repeated, sensitive, or private?",
      "Append one concise batched ledger note covering every item worth attention, with each item index and evidencePath.",
      `If nothing merits attention, append exactly one note starting with ${COMMUNITY_AGENT_NO_SIGNAL_MARKER} and finish.`,
      "You do not evaluate learnings and you do not propose candidates — later roles do.",
    ].join("\n"),
    skillKeys: ["ledger_discipline"],
    toolNames: ["list", "read", "search", "note"],
    reasoningEffort: "low",
    maxToolSteps: 8,
  },
  questioner: {
    roleKey: "questioner",
    rolePrompt: [
      "Role: Questioner. You are the reflection pass over the observer's ledger notes.",
      "Start from the ledger. Do not inventory compiler or directory roots. Read only evidence paths cited by the observer",
      "when the ledger lacks enough concrete evidence; search the directory only for a specific prospective claim.",
      "For each noted item: what could the community actually learn from this?",
      "Produce all seven learning-envelope fields: learningQuestion, candidateClaim, rejectedAlternative,",
      "preferenceReason, evidenceSummary, uncertainty, and falsificationCriteria.",
      "Synthetic fixtures, smoke tests, and platform diagnostics are not community learning; mark them non-viable.",
      "Surface contradictions with existing directory state and open questions worth retaining.",
      "Use at most two directory search calls total for each prospective claim.",
      "Append one concise batched ledger note containing the complete envelope for each viable item.",
      "You do not propose candidates — the steward does.",
    ].join("\n"),
    skillKeys: ["envelope_quality", "repetition_is_not_evidence", "ledger_discipline"],
    toolNames: ["list", "read", "search", "note"],
    reasoningEffort: "high",
    maxToolSteps: 12,
  },
  steward: {
    roleKey: "steward",
    rolePrompt: [
      "Role: Steward. You judge the cycle's ledger and act through the airlock.",
      "Start from the ledger and injected digest coordinates; do not inventory filesystem roots or generic change requests.",
      "Use /compiler/candidates only for actionable compiler candidates. Accept/reject only compiler-derived candidates",
      "that were not proposed by this same runtime run; apply accepted candidates when they are",
      "ready to become promising directory memory.",
      "Then propose at most three new digest-derived candidates, only where the questioner's",
      "reflections show real future workflow value and no existing node covers the claim.",
      "Before proposing, verify the referenced compiler evidence and pass the complete learning envelope",
      "through the existing propose_directory_candidate_from_digest_item write operation.",
      "Never propose synthetic fixtures, smoke tests, or platform diagnostics as community memory.",
      "Use at most two directory search calls total for each prospective claim.",
      "Prefer no write over a weak, private-looking, duplicate, or same-run self-review write.",
      "Finish with a ledger note summarizing what you accepted, rejected, applied, proposed, or held back.",
    ].join("\n"),
    skillKeys: ["duplicate_discipline", "envelope_quality"],
    toolNames: ["list", "read", "search", "note", "write"],
    reasoningEffort: "high",
    maxToolSteps: 10,
  },
};

export function getCommunityAgentRoleDefinition(
  roleKey: CommunityAgentRoleKey,
): CommunityAgentRoleDefinition {
  return ROLE_DEFINITIONS[roleKey];
}

export function isCommunityAgentRoleKey(value: unknown): value is CommunityAgentRoleKey {
  return value === "observer" || value === "questioner" || value === "steward";
}
