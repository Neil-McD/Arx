import type { CreateSkillPackageInput } from "./skillPackageTypes";
import {
  buildSkillMentionToken,
  formatSkillMentionToken,
} from "./skillMentionToken.ts";
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
    id: "hyperframes",
    kind: "curated",
    catalogSkillId: "hyperframes",
    name: "HyperFrames",
    tagline: "Create HTML-first video compositions",
    description:
      "Reusable production behavior for turning a video brief into scene structure, HyperFrames composition files, verification steps, and artifact-aware render plans.",
    surface: "Personal or community",
    category: "Media production",
    icon: "workflow",
    heroNote:
      "A media-production skill for shaping HyperFrames videos without confusing reusable instructions with live rendering permission.",
    detailBullets: [
      "Reduces a video request into scenes, assets, timing, and output format.",
      "Drafts HyperFrames-friendly HTML, CSS, and JavaScript composition structure.",
      "Uses CLI or sandbox tools only when they are actually available and verified.",
    ],
    installInput: {
      catalog_skill_id: "hyperframes",
      name: "HyperFrames",
      description:
        "Plan, draft, and verify HTML-first HyperFrames video compositions.",
      instructions_md: `Use this skill when the user wants to plan, draft, inspect, or render a HyperFrames HTML video composition.\n\nOperating rules:\n1. Start by reducing the brief into scenes, duration, aspect ratio, assets, motion, captions, and target output.\n2. Treat HyperFrames as an artifact workflow: project files, preview links, frame snapshots, and rendered video paths are the useful outputs.\n3. Encode HyperFrames-specific structure explicitly: composition roots need data-composition-id, dimensions, timed clip attributes, and registered paused timelines when animation is used.\n4. If CLI, workspace, or sandbox tools are available, use the smallest verified loop: doctor when environment is unknown, init when no project exists, lint/inspect before preview or render, and report the exact artifact path or preview URL that tool output proves.\n5. If execution tools are not available, produce the composition plan and code/file structure, but do not claim a preview or render completed.\n6. Keep binary media out of chat context. Summarize outputs and link or reference artifacts instead.\n7. Before finalizing, call out missing assets, unsafe assumptions, render blockers, and the smallest next verification step.`,
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

export function deriveDiscoverSkillMentionToken(
  skill: DiscoverSkillCatalogEntry,
): string | null {
  if (!skill.installInput?.name) return null;
  return buildSkillMentionToken(skill.installInput.name, "");
}

export function formatDiscoverSkillInvocation(
  skill: DiscoverSkillCatalogEntry,
): string {
  return formatSkillMentionToken(skill.installInput?.name ?? "") ?? "Name-derived token";
}

export function findRelatedDiscoverSkillForApp(
  app: { relatedSkillCatalogId?: string | null },
  skills: DiscoverSkillCatalogEntry[],
): DiscoverSkillCatalogEntry | null {
  const relatedId = String(app.relatedSkillCatalogId ?? "").trim().toLowerCase();
  if (!relatedId) return null;
  return (
    skills.find((skill) => {
      const catalogSkillId = String(skill.catalogSkillId ?? "")
        .trim()
        .toLowerCase();
      return Boolean(catalogSkillId && catalogSkillId === relatedId);
    }) ?? null
  );
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
  const token = deriveDiscoverSkillMentionToken(skill);
  if (!token) return null;
  return (
    installs.find(
      (install) =>
        String(install.skill.mentionToken ?? "").trim().toLowerCase() === token,
    ) ?? null
  );
}
