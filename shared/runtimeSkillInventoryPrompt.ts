export const DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS = 8_000;

export type RuntimeSkillInventoryPromptItem = {
  name: string;
  mentionToken: string;
  description: string | null;
  shortDescription?: string | null;
};

export type BoundedSkillInventoryPromptReport = {
  totalCount: number;
  includedCount: number;
  omittedCount: number;
  truncatedDescriptionCount: number;
  truncatedDescriptionChars: number;
  budgetChars: number;
  usedChars: number;
};

export type BoundedSkillInventoryPromptResult = {
  text: string;
  report: BoundedSkillInventoryPromptReport;
};

type NormalizedSkillInventoryPromptItem = {
  name: string;
  tokenLabel: string;
  description: string;
};

const DESCRIPTION_TRUNCATED_NOTE =
  "Some available skill descriptions were shortened to fit the skills context budget.";
const SKILLS_OMITTED_NOTE =
  "Some available skills were omitted from this bounded skills list.";

function promptCharLength(value: string): number {
  return Array.from(value).length;
}

function normalizePromptText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeBudgetChars(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : DEFAULT_RUNTIME_SKILL_INVENTORY_PROMPT_BUDGET_CHARS;
}

function emptyReport(params: {
  totalCount: number;
  budgetChars: number;
  usedChars?: number;
}): BoundedSkillInventoryPromptReport {
  return {
    totalCount: params.totalCount,
    includedCount: 0,
    omittedCount: params.totalCount,
    truncatedDescriptionCount: 0,
    truncatedDescriptionChars: 0,
    budgetChars: params.budgetChars,
    usedChars: params.usedChars ?? 0,
  };
}

function normalizeSkill(
  skill: RuntimeSkillInventoryPromptItem,
): NormalizedSkillInventoryPromptItem | null {
  const name = normalizePromptText(skill.name);
  const mentionToken = normalizePromptText(skill.mentionToken);
  if (!name || !mentionToken) return null;
  const description =
    normalizePromptText(skill.shortDescription) ||
    normalizePromptText(skill.description);
  return {
    name,
    tokenLabel: `$${mentionToken}`,
    description,
  };
}

function joinPromptLines(lines: string[]): string {
  return lines.join("\n");
}

function renderFullSkillLine(
  skill: NormalizedSkillInventoryPromptItem,
): string {
  return `- ${skill.tokenLabel}: ${skill.description || skill.name}`;
}

function renderMinimumSkillLine(
  skill: NormalizedSkillInventoryPromptItem,
): string {
  return `- ${skill.tokenLabel}: ${skill.name}`;
}

function renderTruncatedSkillLine(
  skill: NormalizedSkillInventoryPromptItem,
  descriptionChars: number,
): string {
  if (descriptionChars <= 0 || !skill.description) {
    return renderMinimumSkillLine(skill);
  }
  const descriptionPrefix = Array.from(skill.description)
    .slice(0, descriptionChars)
    .join("");
  return `- ${skill.tokenLabel}: ${skill.name} - ${descriptionPrefix}`;
}

function buildPromptText(headerLines: string[], skillLines: string[]): string {
  return joinPromptLines([...headerLines, ...skillLines]);
}

function buildReport(params: {
  totalCount: number;
  includedCount: number;
  omittedCount: number;
  truncatedDescriptionCount: number;
  truncatedDescriptionChars: number;
  budgetChars: number;
  usedChars: number;
}): BoundedSkillInventoryPromptReport {
  return {
    totalCount: params.totalCount,
    includedCount: params.includedCount,
    omittedCount: params.omittedCount,
    truncatedDescriptionCount: params.truncatedDescriptionCount,
    truncatedDescriptionChars: params.truncatedDescriptionChars,
    budgetChars: params.budgetChars,
    usedChars: params.usedChars,
  };
}

function distributeDescriptionBudget(params: {
  headerLines: string[];
  skills: NormalizedSkillInventoryPromptItem[];
  budgetChars: number;
}): BoundedSkillInventoryPromptResult | null {
  const minimumLines = params.skills.map(renderMinimumSkillLine);
  const minimumText = buildPromptText(params.headerLines, minimumLines);
  const minimumChars = promptCharLength(minimumText);
  if (minimumChars > params.budgetChars) return null;

  const descriptionChars = params.skills.map(
    (skill) => Array.from(skill.description).length,
  );
  const allocations = params.skills.map(() => 0);
  const lines = [...minimumLines];
  let remaining = params.budgetChars - minimumChars;

  while (remaining > 0) {
    let changed = false;
    for (let index = 0; index < params.skills.length; index += 1) {
      if (allocations[index] >= descriptionChars[index]) continue;
      const nextLine = renderTruncatedSkillLine(
        params.skills[index],
        allocations[index] + 1,
      );
      const delta = promptCharLength(nextLine) - promptCharLength(lines[index]);
      if (delta > remaining) continue;
      allocations[index] += 1;
      lines[index] = nextLine;
      remaining -= delta;
      changed = true;
      if (remaining <= 0) break;
    }
    if (!changed) break;
  }

  const truncatedDescriptionChars = descriptionChars.reduce(
    (sum, count, index) => sum + Math.max(0, count - allocations[index]),
    0,
  );
  const truncatedDescriptionCount = descriptionChars.filter(
    (count, index) => count > allocations[index],
  ).length;
  const text = buildPromptText(params.headerLines, lines);
  return {
    text,
    report: buildReport({
      totalCount: params.skills.length,
      includedCount: params.skills.length,
      omittedCount: 0,
      truncatedDescriptionCount,
      truncatedDescriptionChars,
      budgetChars: params.budgetChars,
      usedChars: promptCharLength(text),
    }),
  };
}

function renderMinimumLinesUntilBudget(params: {
  headerLines: string[];
  skills: NormalizedSkillInventoryPromptItem[];
  budgetChars: number;
}): BoundedSkillInventoryPromptResult {
  const lines: string[] = [];
  for (const skill of params.skills) {
    const nextLines = [...lines, renderMinimumSkillLine(skill)];
    const nextText = buildPromptText(params.headerLines, nextLines);
    if (promptCharLength(nextText) > params.budgetChars) break;
    lines.push(renderMinimumSkillLine(skill));
  }
  const text = buildPromptText(params.headerLines, lines);
  const includedCount = lines.length;
  const includedSkills = params.skills.slice(0, includedCount);
  const truncatedDescriptionChars = includedSkills.reduce(
    (sum, skill) => sum + promptCharLength(skill.description),
    0,
  );
  return {
    text,
    report: buildReport({
      totalCount: params.skills.length,
      includedCount,
      omittedCount: params.skills.length - includedCount,
      truncatedDescriptionCount: includedSkills.filter(
        (skill) => skill.description,
      ).length,
      truncatedDescriptionChars,
      budgetChars: params.budgetChars,
      usedChars: promptCharLength(text),
    }),
  };
}

export function buildBoundedSkillInventoryPrompt(params: {
  heading: string;
  introLines: string[];
  skills: RuntimeSkillInventoryPromptItem[];
  budgetChars?: number;
}): BoundedSkillInventoryPromptResult {
  const budgetChars = normalizeBudgetChars(params.budgetChars);
  const normalizedSkills = params.skills
    .map(normalizeSkill)
    .filter((skill): skill is NormalizedSkillInventoryPromptItem =>
      Boolean(skill),
    );
  if (normalizedSkills.length === 0) {
    return {
      text: "",
      report: emptyReport({
        totalCount: 0,
        budgetChars,
      }),
    };
  }

  const heading = normalizePromptText(params.heading);
  const introLines = params.introLines.map(normalizePromptText).filter(Boolean);
  const headerLines = ["", heading, ...introLines].filter(
    (line, index) => index === 0 || Boolean(line),
  );
  const fullText = buildPromptText(
    headerLines,
    normalizedSkills.map(renderFullSkillLine),
  );
  const fullChars = promptCharLength(fullText);
  if (fullChars <= budgetChars) {
    return {
      text: fullText,
      report: buildReport({
        totalCount: normalizedSkills.length,
        includedCount: normalizedSkills.length,
        omittedCount: 0,
        truncatedDescriptionCount: 0,
        truncatedDescriptionChars: 0,
        budgetChars,
        usedChars: fullChars,
      }),
    };
  }

  const truncated = distributeDescriptionBudget({
    headerLines: [...headerLines, DESCRIPTION_TRUNCATED_NOTE],
    skills: normalizedSkills,
    budgetChars,
  });
  if (truncated) return truncated;

  const omittedHeaderLines = [...headerLines, SKILLS_OMITTED_NOTE];
  const omittedHeaderText = joinPromptLines(omittedHeaderLines);
  if (promptCharLength(omittedHeaderText) > budgetChars) {
    return {
      text: "",
      report: emptyReport({
        totalCount: normalizedSkills.length,
        budgetChars,
      }),
    };
  }
  return renderMinimumLinesUntilBudget({
    headerLines: omittedHeaderLines,
    skills: normalizedSkills,
    budgetChars,
  });
}

export function buildBoundedSkillInventoryPromptBlock(params: {
  heading: string;
  introLines: string[];
  skills: RuntimeSkillInventoryPromptItem[];
  budgetChars?: number;
}): string {
  return buildBoundedSkillInventoryPrompt(params).text;
}
