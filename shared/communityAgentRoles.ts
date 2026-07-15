// The community agent's role registry. One agent entity, role prompts on the
// same harness (contract Amendment v1.1): sleep roles chained per heartbeat
// cycle, sharing a cycle ledger. Authority is expressed by tool-list absence —
// only the steward's list contains the atomic memory "write" tool, so no other
// role can retain directory memory.

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
      "For each digest item, judge: is it meaningful, novel, repeated, sensitive, or private?",
      "Append one ledger note per item worth the cycle's attention, referencing its work key.",
      `If nothing merits attention, append exactly one note starting with ${COMMUNITY_AGENT_NO_SIGNAL_MARKER} and finish.`,
      "You do not evaluate or retain learnings — later roles do.",
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
      "For each noted item: what could the community actually learn from this?",
      "State the strongest rejected alternative, why the learning is preferred, and what would falsify it.",
      "Surface contradictions with existing directory state and open questions worth retaining.",
      "Append your reflections as ledger notes, batching several items into one note where you can —",
      "your step budget is finite and the notes are the deliverable.",
      "You do not retain memory — the steward does.",
    ].join("\n"),
    skillKeys: ["envelope_quality", "repetition_is_not_evidence", "ledger_discipline"],
    toolNames: ["list", "read", "search", "note"],
    reasoningEffort: "high",
    maxToolSteps: 12,
  },
  steward: {
    roleKey: "steward",
    rolePrompt: [
      "Role: Steward. You judge the cycle's ledger and autonomously retain useful memory.",
      "Select at most three digest-derived learnings, only where the questioner's",
      "reflections show real future workflow value and no existing node covers the claim.",
      "Each write is atomic: the system validates evidence and retains resolved low-risk output",
      "as promising memory while incomplete or higher-risk output stays admin-visible and forming.",
      "Prefer no write over weak, private-looking, or duplicate memory.",
      "Finish with a ledger note summarizing what you retained as promising, kept forming, or skipped.",
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
