import type { CreateSkillPackageInput } from "./skillPackageTypes";
import type { UserPlatformInstalledSkill } from "./userPlatformSkillTypes";

export type DiscoverSkillCatalogIcon =
  | "research"
  | "summary"
  | "workflow"
  | "custom";

export type DiscoverSkillCatalogEntry = {
  id: string;
  kind: "curated" | "custom";
  catalogSkillId: string | null;
  name: string;
  tagline: string;
  description: string;
  invocation: string;
  surface: string;
  category: string;
  icon: DiscoverSkillCatalogIcon;
  heroNote: string;
  detailBullets: string[];
  installInput: CreateSkillPackageInput | null;
};

export const DISCOVER_SKILL_CATALOG: DiscoverSkillCatalogEntry[] = [
  {
    id: "weekly-research",
    kind: "curated",
    catalogSkillId: "weekly-research",
    name: "Weekly Research",
    tagline: "Scan, synthesize, and surface signal",
    description:
      "Reusable research behavior for scouting trends, extracting signal, and organizing follow-up questions.",
    invocation: "$weekly-research",
    surface: "Community first",
    category: "Curated",
    icon: "research",
    heroNote:
      "A reusable operator for surveying a topic quickly, extracting signal, and leaving you with a structured next-step brief.",
    detailBullets: [
      "Scans a topic from multiple angles before forming conclusions.",
      "Turns noisy input into a compact signal summary and follow-up list.",
      "Works best when you want fast synthesis instead of open-ended brainstorming.",
    ],
    installInput: {
      catalog_skill_id: "weekly-research",
      name: "Weekly Research",
      description:
        "Scan, synthesize, and surface signal from a topic before deciding what matters next.",
      instructions_md: `Use this skill when the user wants a fast research pass on a topic, market, company, trend, or decision.\n\nOperating rules:\n1. Start by reducing the topic into the fewest important dimensions.\n2. Separate facts, signals, risks, and open questions.\n3. Prefer synthesis over raw dump.\n4. End with a concise summary and clear next steps.\n5. Stay practical and decision-useful.`,
    },
  },
  {
    id: "board-summary",
    kind: "curated",
    catalogSkillId: "board-summary",
    name: "Board Summary",
    tagline: "Executive compression for updates",
    description:
      "Turns long discussions into concise executive bullets with decisions, risks, and next actions.",
    invocation: "$board-summary",
    surface: "Community first",
    category: "Curated",
    icon: "summary",
    heroNote:
      "A compression skill for turning long threads, notes, or updates into a concise executive readout with clear decisions and risks.",
    detailBullets: [
      "Compresses long discussions into high-signal board-level bullets.",
      "Surfaces decisions, risks, blockers, and next actions explicitly.",
      "Useful when you need leadership-ready summaries instead of full transcripts.",
    ],
    installInput: {
      catalog_skill_id: "board-summary",
      name: "Board Summary",
      description:
        "Turn long discussions into concise executive bullets with decisions, risks, and next actions.",
      instructions_md: `Use this skill when the user wants an executive-level summary of a long discussion, status update, or planning thread.\n\nOperating rules:\n1. Compress aggressively without losing decisions.\n2. Separate decisions, risks, blockers, and next actions.\n3. Prefer bullet clarity over prose.\n4. Keep the output brief, concrete, and leadership-ready.\n5. Do not pad or restate obvious context.`,
    },
  },
  {
    id: "workflow-builder",
    kind: "curated",
    catalogSkillId: "workflow-builder",
    name: "Workflow Builder",
    tagline: "Compose repeatable operating patterns",
    description:
      "A reusable skill package for turning goals into step-based execution workflows.",
    invocation: "$workflow-builder",
    surface: "Personal or community",
    category: "Curated",
    icon: "workflow",
    heroNote:
      "A reusable planning skill for converting a goal into a tight sequence of steps, checks, and handoff points.",
    detailBullets: [
      "Breaks goals down into clean operational steps.",
      "Makes dependencies, risks, and stop-rules explicit.",
      "Useful when a task is vague and needs a pragmatic execution plan.",
    ],
    installInput: {
      catalog_skill_id: "workflow-builder",
      name: "Workflow Builder",
      description:
        "Compose repeatable operating patterns and step-based execution workflows.",
      instructions_md: `Use this skill when the user wants to turn a broad goal into a practical workflow.\n\nOperating rules:\n1. Reduce the problem to the fewest real moving parts.\n2. Turn the work into a concrete execution sequence.\n3. Call out blockers, assumptions, and proof steps.\n4. Prefer the smallest viable workflow over exhaustive planning.\n5. End with a crisp recommended path forward.`,
    },
  },
  {
    id: "custom-skill",
    kind: "custom",
    catalogSkillId: null,
    name: "Custom Skill",
    tagline: "Author your own reusable behavior package",
    description:
      "Fallback path for creating and attaching your own skills when the curated set does not fit the workflow.",
    invocation: "Name-derived",
    surface: "Advanced",
    category: "Manual",
    icon: "custom",
    heroNote:
      "The manual path for when the curated set is close but not quite right and you need a skill package tailored to your own operating style.",
    detailBullets: [
      "Create your own named personal skill package.",
      "Define the exact reusable instructions you want available at runtime.",
      "Best when a curated skill is close but you need a custom behavior contract.",
    ],
    installInput: null,
  },
];

function readSkillInvocationToken(invocation: string): string | null {
  const trimmed = invocation.trim();
  if (!trimmed.startsWith("$")) return null;
  const token = trimmed.slice(1).trim().toLowerCase();
  return token || null;
}

export function findMatchingDiscoverSkillInstall(
  skill: DiscoverSkillCatalogEntry,
  installs: UserPlatformInstalledSkill[],
): UserPlatformInstalledSkill | null {
  if (skill.catalogSkillId) {
    const catalogMatch =
      installs.find(
        (install) => install.skill.catalogSkillId === skill.catalogSkillId,
      ) ?? null;
    if (catalogMatch) return catalogMatch;
  }
  const token = readSkillInvocationToken(skill.invocation);
  if (!token) return null;
  return (
    installs.find(
      (install) =>
        String(install.skill.mentionToken ?? "").trim().toLowerCase() === token,
    ) ?? null
  );
}
