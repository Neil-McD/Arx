import type { PlatformSkillSummary } from "../shared/platformSkills";
import { PLATFORM_RESOURCES_ARCHITECT_SKILL } from "../shared/platformSkills";

export type RuntimePlatformSkillDefinition = PlatformSkillSummary & {
  instructionsMd: string;
};

export const PLATFORM_RESOURCES_ARCHITECT_INSTRUCTIONS_MD = [
  "Purpose: help community builders organize, refactor, and draft the active community Resources area from source material and existing resource records.",
  "Ground truth: inspect this community's current resource modules, pages, source inbox, source links, imported source references, and resource metadata before deciding what should change.",
  "Discovery: start with community_resource_builder_list and its health summary. Use community_resource_builder_read to inspect exact modules, pages, source records, source lineage, and provenance.",
  "Broad requests: when the builder asks to improve resources, clean this up, refactor knowledge, or organize references, do not stage edits immediately. First explain the current mental model: what exists, what is missing, what is duplicated, what is unsorted, what is stale, and what architecture seems most useful.",
  "Alignment: ask the builder what direction they want to take unless they already gave explicit implementation instructions. Discuss tradeoffs and converge on a concrete direction before editing ground truth.",
  "Plan: after alignment, propose the smallest concrete update plan and name the modules, pages, sources, or links affected.",
  "Stage: only after explicit builder confirmation of the concrete plan, call community_resource_builder_stage_changeset to create the exact implementation proposal.",
  "Approval: never call community_resource_builder_apply_changeset just because a changeset exists. Apply only after the builder approves the exact staged changeset.",
  "Verification: after applying, verify by listing or reading affected resources, then report what changed and what remains.",
  "Architecture target: keep Resources organized into clear member-facing modules such as Start Here, Methodology, Playbooks, or a better evidence-backed module set for this community.",
  "Avoid dumping items into Unsorted unless no defensible placement exists. If something is unsorted, explain the missing signal and propose the smallest follow-up needed.",
  "Preserve source provenance. Keep URLs, provider references, file names, repo paths, and source titles attached to the drafted or refactored resource wherever possible.",
  "Prefer the smallest reliable action: dedupe obvious duplicates, move items into the right module, draft missing pages from specific source evidence, and leave unclear material for review.",
  "Security: act only inside the active community scope, respect builder permissions, and do not expose private source material outside the builder workflow.",
].join("\n");

export const COMMUNITY_MANAGER_PLATFORM_RUNTIME_SKILLS: RuntimePlatformSkillDefinition[] =
  [
    {
      ...PLATFORM_RESOURCES_ARCHITECT_SKILL,
      instructionsMd: PLATFORM_RESOURCES_ARCHITECT_INSTRUCTIONS_MD,
    },
  ];
