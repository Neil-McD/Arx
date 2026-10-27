import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  COMMUNITY_WIKI_ARCHITECT_PROMPT,
  type CommunityWikiArchitectProposal,
} from "../shared/communityWikiArchitectPrompt.ts";
import {
  validateCommunityWikiArchitectProposal,
  type CommunityWikiArchitectProposalValidationInput,
} from "../shared/communityWikiArchitectProposal.ts";
import {
  getCommunityResourceBuilderModulePageKey,
  normalizeCommunityResourceBuilderTitle,
} from "../shared/communityResourceBuilder.ts";
import {
  type CommunityAgentConfigLike,
  type CommunityLike,
  type CommunityResourceLike,
  type CommunityResourceModuleLike,
  communityResourceBodyChars,
  communityResourceSourceHasReadyText,
  normalizeIdValue,
  normalizeName,
  normalizeOptionalText,
  normalizeResourceRole,
  normalizeResourceSourceIngestionStatus,
  normalizeResourceStatus,
  requireCommunityManager,
  resolveCommunityEntryPolicy,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { syncCommunityResourceMemoryProjection } from "./communityResourceMemoryProjection";
import {
  buildCommunityResourceBuilderHealthReport,
} from "./communityResources";
import {
  hydrateCommunityResourceBody,
  writeCommunityResourceBodyContent,
} from "./communityResourceContent";
import { sha256HexText } from "./secretCrypto";
import {
  resolveCommunityInferenceFundingForAction,
} from "./founderInferenceRuntime";
import { startFundedInferenceRun } from "./fundedInferenceGateway";
import { FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED } from "./founderInferenceBudget";

const COMMUNITY_WIKI_ARCHITECT_MAX_CONTEXT_RESOURCES = 500;
const COMMUNITY_WIKI_ARCHITECT_MAX_OUTPUT_TOKENS = 3600;
const COMMUNITY_WIKI_ARCHITECT_MAX_VISIBLE_SOURCE_CARDS = 80;
const COMMUNITY_WIKI_ARCHITECT_MAX_SOURCE_HYDRATION_CANDIDATES = 240;
const COMMUNITY_WIKI_ARCHITECT_SOURCE_WINDOW_BUDGET_CHARS = 40_000;
const COMMUNITY_WIKI_ARCHITECT_SOURCE_CARD_EXCERPT_CHARS = 600;
const COMMUNITY_WIKI_ARCHITECT_MAX_VISIBLE_SOURCE_UNIT_CARDS = 120;
const COMMUNITY_WIKI_ARCHITECT_MAX_SOURCE_UNITS_PER_SOURCE_CARD = 8;
const COMMUNITY_WIKI_ARCHITECT_SOURCE_UNIT_EXCERPT_CHARS = 320;
const COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_PAGES = 8;
const COMMUNITY_RESOURCE_CONTENT_WRITER_PAGE_SCAN_LIMIT = 200;
const COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_OUTPUT_TOKENS = 4200;
const COMMUNITY_RESOURCE_CONTENT_WRITER_SOURCE_CHARS = 12_000;
const COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_SOURCE_UNITS = 12;
const COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_SEED_SOURCE_UNITS = 6;
const COMMUNITY_RESOURCE_CONTENT_WRITER_SOURCE_UNIT_CHARS = 2_500;
const COMMUNITY_RESOURCE_CONTENT_WRITER_BODY_CHARS = 20_000;

const COMMUNITY_RESOURCE_CONTENT_WRITER_PROMPT = `You are the Resource Drafter for a Polynet community.

Write ONE useful draft resource page from ONE ready source-inbox item.

Rules:
- Use only the provided source text and community context.
- Do not invent facts, steps, names, links, claims, or numbers.
- Write for a community member who needs to understand and act.
- Keep the page concise, structured, and review-ready.
- If the source is thin or unclear, say what is known and add a short "Needs review" section.
- Do not make modules live. This is a human-review draft.
- Do not reference the configured agent name, your own name, or headings like "Ask Atom", "Ask the agent", or "Ask [name]". Use neutral headings like "Copyable prompt" or "Try this prompt".
- If you include prompts, put every prompt in a fenced \`\`\`text code block so the Resources UI renders a copy control. Do not leave prompt text as ordinary paragraphs or unlabeled indented blocks.
- If the source includes YouTube, Vimeo, Loom, or Wistia URLs, preserve each important media URL on its own paragraph so the Resources UI can render it as an embed.

Return ONLY valid JSON:
{
  "body_md": "# Page title\\n\\nUseful markdown body..."
}`;

function resourceModuleIdentity(raw: unknown): string {
  const value = normalizeIdValue(raw ?? "");
  return value || "";
}

function buildModuleNameById(modules: CommunityResourceModuleLike[]): Map<string, string> {
  return new Map(modules.map((module) => [normalizeIdValue(module._id), String(module.name ?? "")]));
}

function buildSourceExcerpt(raw: unknown): string | null {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  return value.length <= COMMUNITY_WIKI_ARCHITECT_SOURCE_CARD_EXCERPT_CHARS
    ? value
    : `${value.slice(0, COMMUNITY_WIKI_ARCHITECT_SOURCE_CARD_EXCERPT_CHARS - 1).trimEnd()}…`;
}

function buildSourceUnitExcerpt(raw: unknown, maxChars = COMMUNITY_WIKI_ARCHITECT_SOURCE_UNIT_EXCERPT_CHARS): string | null {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  return value.length <= maxChars
    ? value
    : `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function buildBuilderIntentTerms(raw: unknown): string[] {
  const value = String(raw ?? "").toLowerCase();
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(/[^a-z0-9]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3)
        .slice(0, 80),
    ),
  );
}

function sourceIntentMatchScore(source: CommunityResourceLike, intentTerms: string[]): number {
  if (intentTerms.length === 0) return 0;
  const titleText = [
    source.title,
    source.sourceExternalName,
    source.sourceOriginalFilename,
  ].join(" ").toLowerCase();
  const bodyText = String(source.bodyMd ?? "").slice(0, 5_000).toLowerCase();
  let score = 0;
  for (const term of intentTerms) {
    if (titleText.includes(term)) score += 3;
    if (bodyText.includes(term)) score += 1;
  }
  return score;
}

function buildArchitectSourceCard(args: {
  source: CommunityResourceLike;
  assignedPages: string[];
  sourceUnits: ArchitectSourceUnitsForSource | null;
}): Record<string, unknown> {
  const source = args.source;
  const externalUrl = String(source.sourceExternalUrl ?? "").trim();
  const url = String(source.url ?? "").trim() || externalUrl || null;
  const provider =
    String(source.sourceExternalProvider ?? "").trim() ||
    String(source.sourceIngestionKind ?? "").trim() ||
    null;

  const sourceUnitCards = args.sourceUnits?.cards ?? [];
  const sourceUnitTotal = Math.max(0, Math.floor(Number(args.sourceUnits?.total) || 0));

  return {
    id: normalizeIdValue(source._id),
    title: String(source.title ?? ""),
    type: String(source.type ?? ""),
    provider,
    status: normalizeResourceStatus(source.status),
    source_ingestion_status: normalizeResourceSourceIngestionStatus(source),
    url,
    source_external_name: String(source.sourceExternalName ?? "").trim() || null,
    source_external_provider: String(source.sourceExternalProvider ?? "").trim() || null,
    source_external_url: externalUrl || null,
    length_chars: communityResourceBodyChars(source),
    excerpt: buildSourceExcerpt(source.bodyMd),
    source_unit_count: sourceUnitTotal,
    source_units_visible: sourceUnitCards.length,
    source_units_truncated: sourceUnitTotal > sourceUnitCards.length,
    source_units: sourceUnitCards,
    assigned_pages: args.assignedPages,
    created_at: toIsoString(source.createdAt),
    updated_at: toIsoString(source.updatedAt),
  };
}

function buildArchitectSourceWindow(args: {
  readySources: CommunityResourceLike[];
  readySourcesTotal?: number;
  assignedPagesBySourceId: Map<string, string[]>;
  sourceUnitsBySourceId: Map<string, ArchitectSourceUnitsForSource>;
  builderIntent: string | null;
}): {
  sourceCards: Record<string, unknown>[];
  visibleSourceIds: string[];
  sourcesOmitted: number;
  budgetChars: number;
  usedChars: number;
} {
  const intentTerms = buildBuilderIntentTerms(args.builderIntent);
  const rankedSources = args.readySources
    .slice()
    .sort((left, right) => {
      const leftId = normalizeIdValue(left._id);
      const rightId = normalizeIdValue(right._id);
      const leftAssigned = (args.assignedPagesBySourceId.get(leftId)?.length ?? 0) > 0 ? 1 : 0;
      const rightAssigned = (args.assignedPagesBySourceId.get(rightId)?.length ?? 0) > 0 ? 1 : 0;
      if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;

      const leftIntentScore = sourceIntentMatchScore(left, intentTerms);
      const rightIntentScore = sourceIntentMatchScore(right, intentTerms);
      if (leftIntentScore !== rightIntentScore) return rightIntentScore - leftIntentScore;

      const leftFreshness = Number(left.sourceIngestedAt ?? left.updatedAt ?? left.createdAt);
      const rightFreshness = Number(right.sourceIngestedAt ?? right.updatedAt ?? right.createdAt);
      if (leftFreshness !== rightFreshness) return rightFreshness - leftFreshness;

      return leftId.localeCompare(rightId);
    });

  const sourceCards: Record<string, unknown>[] = [];
  let usedChars = 0;
  for (const source of rankedSources) {
    if (sourceCards.length >= COMMUNITY_WIKI_ARCHITECT_MAX_VISIBLE_SOURCE_CARDS) break;
    const sourceId = normalizeIdValue(source._id);
    const card = buildArchitectSourceCard({
      source,
      assignedPages: args.assignedPagesBySourceId.get(sourceId) ?? [],
      sourceUnits: args.sourceUnitsBySourceId.get(sourceId) ?? null,
    });
    const cardChars = JSON.stringify(card).length + 2;
    if (
      sourceCards.length > 0 &&
      usedChars + cardChars > COMMUNITY_WIKI_ARCHITECT_SOURCE_WINDOW_BUDGET_CHARS
    ) {
      break;
    }
    sourceCards.push(card);
    usedChars += cardChars;
  }

  return {
    sourceCards,
    visibleSourceIds: sourceCards.map((card) => String(card.id ?? "")).filter(Boolean),
    sourcesOmitted: Math.max(0, (args.readySourcesTotal ?? args.readySources.length) - sourceCards.length),
    budgetChars: COMMUNITY_WIKI_ARCHITECT_SOURCE_WINDOW_BUDGET_CHARS,
    usedChars,
  };
}

function compareArchitectSourceCandidates(
  assignedPagesBySourceId: Map<string, string[]>,
): (left: CommunityResourceLike, right: CommunityResourceLike) => number {
  return (left, right) => {
    const leftAssigned = (assignedPagesBySourceId.get(normalizeIdValue(left._id))?.length ?? 0) > 0 ? 1 : 0;
    const rightAssigned = (assignedPagesBySourceId.get(normalizeIdValue(right._id))?.length ?? 0) > 0 ? 1 : 0;
    if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;
    const leftFreshness = Number(left.sourceIngestedAt ?? left.updatedAt ?? left.createdAt);
    const rightFreshness = Number(right.sourceIngestedAt ?? right.updatedAt ?? right.createdAt);
    if (leftFreshness !== rightFreshness) return rightFreshness - leftFreshness;
    return normalizeIdValue(left._id).localeCompare(normalizeIdValue(right._id));
  };
}

type AppliedSourceBackedPage = {
  page: CommunityResourceLike;
  source: CommunityResourceLike;
};

type CommunitySourceUnitLike = {
  _id?: unknown;
  sourceResourceId?: unknown;
  unitKind?: string;
  title?: string | null;
  sourceUrl?: string;
  path?: string | null;
  order?: number;
  depth?: number;
  status?: string;
  bodyChars?: number;
  bodyOriginalChars?: number;
  bodyHash?: string;
  bodyTruncated?: boolean;
  captureMethod?: string | null;
  error?: string | null;
  createdAt?: number;
  updatedAt?: number;
};

type CommunitySourceUnitContentLike = {
  _id?: unknown;
  sourceUnitId?: unknown;
  bodyMd?: string;
  bodyChars?: number;
  bodyHash?: string;
  createdAt?: number;
  updatedAt?: number;
};

type ArchitectSourceUnitCard = {
  id: string;
  kind: string;
  title: string | null;
  path: string | null;
  order: number;
  status: string;
  source_url: string | null;
  body_chars: number;
  body_original_chars: number;
  body_truncated: boolean;
  capture_method: string | null;
  excerpt: string | null;
};

type ArchitectSourceUnitsForSource = {
  total: number;
  cards: ArchitectSourceUnitCard[];
};

type CommunityWikiArchitectSourceRevision = {
  source_resource_id: string;
  revision_hash: string;
};

function compareSourceUnits(left: CommunitySourceUnitLike, right: CommunitySourceUnitLike): number {
  const leftOrder = Number(left.order) || 0;
  const rightOrder = Number(right.order) || 0;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const leftPath = String(left.path ?? "");
  const rightPath = String(right.path ?? "");
  if (leftPath !== rightPath) return leftPath.localeCompare(rightPath);
  return normalizeIdValue(left._id).localeCompare(normalizeIdValue(right._id));
}

function contentWriterUnitSearchTerms(...values: unknown[]): string[] {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "also",
    "and",
    "are",
    "but",
    "can",
    "for",
    "from",
    "how",
    "into",
    "not",
    "page",
    "purpose",
    "source",
    "that",
    "the",
    "this",
    "use",
    "what",
    "when",
    "with",
    "you",
  ]);
  return Array.from(new Set(
    values
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !stopWords.has(term))
      .slice(0, 80),
  ));
}

function normalizeContentWriterUnitMatchText(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSourceUnitForPage(args: {
  unit: CommunitySourceUnitLike;
  bodyMd: string;
  pageTitle: string;
  pageModule: string | null;
  pageBody: string;
  terms: string[];
}): number {
  const pageTitle = normalizeContentWriterUnitMatchText(args.pageTitle);
  const unitTitle = normalizeContentWriterUnitMatchText(args.unit.title);
  const unitPath = normalizeContentWriterUnitMatchText(args.unit.path);
  const metadata = [
    args.unit.title,
    args.unit.path,
    args.unit.sourceUrl,
    args.unit.captureMethod,
  ].join(" ").toLowerCase();
  const body = String(args.bodyMd ?? "").slice(0, 8_000).toLowerCase();
  let score = 0;

  if (pageTitle && unitTitle && unitTitle === pageTitle) score += 100;
  if (pageTitle && unitTitle && unitTitle.includes(pageTitle)) score += 60;
  if (pageTitle && unitTitle && pageTitle.includes(unitTitle)) score += 35;
  if (pageTitle && unitPath && unitPath.includes(pageTitle)) score += 45;

  for (const term of args.terms) {
    if (metadata.includes(term)) score += 12;
    if (body.includes(term)) score += 2;
  }

  const moduleTerms = contentWriterUnitSearchTerms(args.pageModule);
  for (const term of moduleTerms) {
    if (metadata.includes(term)) score += 4;
  }

  const purposeTerms = contentWriterUnitSearchTerms(args.pageBody).slice(0, 20);
  for (const term of purposeTerms) {
    if (metadata.includes(term)) score += 3;
  }

  return score;
}

async function loadReadySourceUnitsForSource(
  ctx: any,
  sourceId: string,
): Promise<CommunitySourceUnitLike[]> {
  return ((await ctx.db
    .query("communitySourceUnits" as any)
    .withIndex("by_source_resource", (q: any) => q.eq("sourceResourceId", sourceId as any))
    .collect()) as CommunitySourceUnitLike[])
    .filter((row) => String(row.status ?? "") === "ready")
    .sort(compareSourceUnits);
}

async function readSourceUnitContent(
  ctx: any,
  sourceUnitId: unknown,
): Promise<CommunitySourceUnitContentLike | null> {
  return (await ctx.db
    .query("communitySourceUnitContents" as any)
    .withIndex("by_source_unit", (q: any) => q.eq("sourceUnitId", sourceUnitId))
    .unique()) as CommunitySourceUnitContentLike | null;
}

async function loadSourceUnitCardsBySourceId(ctx: any, args: {
  sourceIds: string[];
  maxTotal: number;
  maxPerSource: number;
  excerptChars: number;
}): Promise<Map<string, ArchitectSourceUnitsForSource>> {
  const sourceUnitsBySourceId = new Map<string, ArchitectSourceUnitsForSource>();
  let remaining = Math.max(0, Math.floor(args.maxTotal));
  const maxPerSource = Math.max(0, Math.floor(args.maxPerSource));
  if (remaining <= 0 || maxPerSource <= 0) return sourceUnitsBySourceId;

  for (const sourceId of args.sourceIds) {
    if (remaining <= 0) break;
    const rows = await loadReadySourceUnitsForSource(ctx, sourceId);
    const picked = rows.slice(0, Math.min(maxPerSource, remaining));
    const cards: ArchitectSourceUnitCard[] = [];
    for (const unit of picked) {
      if (remaining <= 0) break;
      const unitId = normalizeIdValue(unit._id);
      if (!unitId) continue;
      const content = await readSourceUnitContent(ctx, unit._id);
      cards.push({
        id: unitId,
        kind: String(unit.unitKind ?? ""),
        title: String(unit.title ?? "").trim() || null,
        path: String(unit.path ?? "").trim() || null,
        order: Number(unit.order) || 0,
        status: String(unit.status ?? ""),
        source_url: String(unit.sourceUrl ?? "").trim() || null,
        body_chars: Math.max(0, Math.floor(Number(unit.bodyChars) || 0)),
        body_original_chars: Math.max(0, Math.floor(Number(unit.bodyOriginalChars ?? unit.bodyChars) || 0)),
        body_truncated: unit.bodyTruncated === true,
        capture_method: String(unit.captureMethod ?? "").trim() || null,
        excerpt: buildSourceUnitExcerpt(content?.bodyMd, args.excerptChars),
      });
      remaining -= 1;
    }
    if (rows.length > 0) {
      sourceUnitsBySourceId.set(sourceId, {
        total: rows.length,
        cards,
      });
    }
  }
  return sourceUnitsBySourceId;
}

async function buildCommunityWikiArchitectSourceRevision(
  ctx: any,
  source: CommunityResourceLike,
  assignedPages: string[] = [],
): Promise<CommunityWikiArchitectSourceRevision> {
  const sourceId = normalizeIdValue(source._id);
  const units = (await loadReadySourceUnitsForSource(ctx, sourceId))
    .slice(0, COMMUNITY_WIKI_ARCHITECT_MAX_SOURCE_UNITS_PER_SOURCE_CARD);
  const unitRevisions = await Promise.all(units.map(async (unit) => {
    const content = await readSourceUnitContent(ctx, unit._id);
    return {
      id: normalizeIdValue(unit._id),
      title: String(unit.title ?? "").trim() || null,
      path: String(unit.path ?? "").trim() || null,
      kind: String(unit.unitKind ?? ""),
      order: Number(unit.order) || 0,
      status: String(unit.status ?? ""),
      source_url: String(unit.sourceUrl ?? "").trim() || null,
      body_hash: String(content?.bodyHash ?? unit.bodyHash ?? ""),
      body_chars: Math.max(0, Math.floor(Number(unit.bodyChars) || 0)),
      body_original_chars: Math.max(
        0,
        Math.floor(Number(unit.bodyOriginalChars ?? unit.bodyChars) || 0),
      ),
      body_truncated: unit.bodyTruncated === true,
      capture_method: String(unit.captureMethod ?? "").trim() || null,
      updated_at: Number(unit.updatedAt) || 0,
    };
  }));
  const sourceBodyHash = await sha256HexText(String(source.bodyMd ?? ""));
  return {
    source_resource_id: sourceId,
    revision_hash: await sha256HexText(JSON.stringify({
      id: sourceId,
      title: String(source.title ?? ""),
      type: String(source.type ?? ""),
      status: normalizeResourceStatus(source.status),
      source_ingestion_status: normalizeResourceSourceIngestionStatus(source),
      provider: String(source.sourceExternalProvider ?? source.sourceIngestionKind ?? "").trim() || null,
      url: String(source.url ?? (source as any).sourceExternalUrl ?? "").trim() || null,
      source_external_name: String(source.sourceExternalName ?? "").trim() || null,
      body_hash: sourceBodyHash,
      units: unitRevisions,
      assigned_pages: assignedPages.slice().sort(),
      updated_at: Number(source.updatedAt) || 0,
    })),
  };
}

async function buildContentWriterSourceFromUnits(ctx: any, args: {
  sourceId: string;
  pageTitle: string;
  pageModule: string | null;
  pageBody: string;
}): Promise<{
  sourceUnits: Record<string, unknown>[];
  sourceBodyMd: string | null;
}> {
  const rows = await loadReadySourceUnitsForSource(ctx, args.sourceId);
  if (rows.length === 0) {
    return {
      sourceUnits: [],
      sourceBodyMd: null,
    };
  }
  const terms = contentWriterUnitSearchTerms(args.pageTitle, args.pageModule, args.pageBody);
  const contentByUnitId = new Map<string, CommunitySourceUnitContentLike | null>();
  const scored = await Promise.all(rows.map(async (unit, index) => {
    const unitId = normalizeIdValue(unit._id);
    if (!unitId) return null;
    const content = await readSourceUnitContent(ctx, unit._id);
    contentByUnitId.set(unitId, content);
    return {
      unit,
      index,
      unitId,
      bodyMd: String(content?.bodyMd ?? ""),
      score: scoreSourceUnitForPage({
        unit,
        bodyMd: String(content?.bodyMd ?? ""),
        pageTitle: args.pageTitle,
        pageModule: args.pageModule,
        pageBody: args.pageBody,
        terms,
      }),
    };
  }));
  const ranked = scored
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) =>
      right.score - left.score ||
      compareSourceUnits(left.unit, right.unit),
    );
  const maxUnits = COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_SOURCE_UNITS;
  const seedUnits = (ranked.some((row) => row.score > 0)
    ? ranked.filter((row) => row.score > 0)
    : ranked)
    .slice(0, Math.min(COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_SEED_SOURCE_UNITS, maxUnits));
  const selectedById = new Map<string, typeof seedUnits[number]>();
  const addSelected = (candidate: typeof seedUnits[number] | null | undefined) => {
    if (!candidate || selectedById.size >= maxUnits) return;
    selectedById.set(candidate.unitId, candidate);
  };
  for (const seed of seedUnits) {
    addSelected(seed);
    addSelected(scored.find((row) => row?.index === seed.index - 1) ?? null);
    addSelected(scored.find((row) => row?.index === seed.index + 1) ?? null);
  }
  for (const row of ranked) {
    if (selectedById.size >= maxUnits) break;
    addSelected(row);
  }
  const selected = Array.from(selectedById.values())
    .sort((left, right) => compareSourceUnits(left.unit, right.unit));
  const blocks: string[] = [];
  const sourceUnits: Record<string, unknown>[] = [];
  for (const selectedUnit of selected) {
    const unit = selectedUnit.unit;
    const unitId = selectedUnit.unitId;
    const body = String(contentByUnitId.get(unitId)?.bodyMd ?? selectedUnit.bodyMd ?? "").trim();
    sourceUnits.push({
      id: unitId,
      kind: String(unit.unitKind ?? ""),
      title: String(unit.title ?? "").trim() || null,
      path: String(unit.path ?? "").trim() || null,
      order: Number(unit.order) || 0,
      status: String(unit.status ?? ""),
      source_url: String(unit.sourceUrl ?? "").trim() || null,
      body_chars: Math.max(0, Math.floor(Number(unit.bodyChars) || 0)),
      body_original_chars: Math.max(0, Math.floor(Number(unit.bodyOriginalChars ?? unit.bodyChars) || 0)),
      body_truncated: unit.bodyTruncated === true,
      capture_method: String(unit.captureMethod ?? "").trim() || null,
      relevance_score: selectedUnit.score,
    });
    if (!body) continue;
    blocks.push([
      `## ${String(unit.title ?? "").trim() || String(unit.path ?? "").trim() || "Source unit"}`,
      `Source unit: ${String(unit.path ?? "").trim() || unitId}`,
      body.slice(0, COMMUNITY_RESOURCE_CONTENT_WRITER_SOURCE_UNIT_CHARS),
    ].join("\n\n"));
  }
  return {
    sourceUnits,
    sourceBodyMd: blocks.join("\n\n---\n\n").slice(0, COMMUNITY_RESOURCE_CONTENT_WRITER_SOURCE_CHARS) || null,
  };
}

function isUnsortedResourceModule(
  rawModuleId: unknown,
  moduleNameById: Map<string, string>,
): boolean {
  const moduleId = resourceModuleIdentity(rawModuleId);
  if (!moduleId) return true;
  return normalizeCommunityResourceBuilderTitle(moduleNameById.get(moduleId) ?? "") === "unsorted";
}

function buildCommunityWikiArchitectureQuality(args: {
  sourceBackedPages: AppliedSourceBackedPage[];
  readySourcesTotal: number;
  moduleNameById: Map<string, string>;
}): Record<string, unknown> {
  const moduleDistribution = new Map<string, number>();
  const sourceKinds = new Set<string>();
  let sourceBackedPagesMissingModule = 0;
  let unsortedSourceBackedPages = 0;
  let usedSourcesInUnsorted = 0;
  let sourceModuleMismatches = 0;

  for (const row of args.sourceBackedPages) {
    const pageModuleId = resourceModuleIdentity(row.page.moduleId);
    const sourceModuleId = resourceModuleIdentity(row.source.moduleId);
    const pageModuleName = pageModuleId
      ? args.moduleNameById.get(pageModuleId) || "Unknown"
      : "Unsorted";
    moduleDistribution.set(pageModuleName, (moduleDistribution.get(pageModuleName) ?? 0) + 1);

    const sourceKind = String(
      row.source.sourceExternalProvider ||
        row.source.sourceIngestionKind ||
        row.source.type ||
        "",
    ).trim();
    if (sourceKind) sourceKinds.add(sourceKind);

    if (!pageModuleId) sourceBackedPagesMissingModule += 1;
    if (isUnsortedResourceModule(row.page.moduleId, args.moduleNameById)) {
      unsortedSourceBackedPages += 1;
    }
    if (isUnsortedResourceModule(row.source.moduleId, args.moduleNameById)) {
      usedSourcesInUnsorted += 1;
    }
    if (!sourceModuleId || (pageModuleId && sourceModuleId !== pageModuleId)) {
      sourceModuleMismatches += 1;
    }
  }

  const warnings: string[] = [];
  if (args.readySourcesTotal > 0 && args.sourceBackedPages.length === 0) {
    warnings.push("Ready sources exist, but no source-backed pages were created.");
  }
  if (unsortedSourceBackedPages > 0) {
    warnings.push("Some source-backed pages are still in Unsorted.");
  }
  if (usedSourcesInUnsorted > 0) {
    warnings.push("Some used source rows are still in Unsorted.");
  }
  if (sourceModuleMismatches > 0) {
    warnings.push("Some used source rows do not match their page module.");
  }
  if (sourceBackedPagesMissingModule > 0) {
    warnings.push("Some source-backed pages have no module.");
  }
  if (
    args.sourceBackedPages.length >= 3 &&
    sourceKinds.size >= 3 &&
    moduleDistribution.size === 1
  ) {
    warnings.push("Many distinct source types landed in one module.");
  }

  return {
    ok: sourceModuleMismatches === 0 && sourceBackedPagesMissingModule === 0,
    warnings,
    source_backed_pages: args.sourceBackedPages.length,
    unsorted_source_backed_pages: unsortedSourceBackedPages,
    source_backed_pages_missing_module: sourceBackedPagesMissingModule,
    used_sources: args.sourceBackedPages.length,
    used_sources_in_unsorted: usedSourcesInUnsorted,
    source_module_mismatches: sourceModuleMismatches,
    module_distribution: Array.from(moduleDistribution.entries()).map(([module, pages]) => ({
      module,
      pages,
    })),
  };
}

function truncateContentWriterSource(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return value.length <= COMMUNITY_RESOURCE_CONTENT_WRITER_SOURCE_CHARS
    ? value
    : `${value.slice(0, COMMUNITY_RESOURCE_CONTENT_WRITER_SOURCE_CHARS - 1).trimEnd()}…`;
}

type CommunityResourceContentWriterSourceInput = {
  id: string;
  title: string;
  url: string | null;
  body_md: string;
};

function buildCommunityResourceContentWriterSourceInput(args: {
  source: CommunityResourceLike;
  bodyMd: unknown;
}): CommunityResourceContentWriterSourceInput {
  return {
    id: normalizeIdValue(args.source._id),
    title: String(args.source.title ?? ""),
    url: String(args.source.url ?? (args.source as any).sourceExternalUrl ?? "").trim() || null,
    body_md: String(args.bodyMd ?? ""),
  };
}

async function hashCommunityResourceContentWriterSourceRevision(
  source: CommunityResourceLike,
  sourceInput: CommunityResourceContentWriterSourceInput,
): Promise<string> {
  const sourceBodyHash = await sha256HexText(String(source.bodyMd ?? ""));
  return await sha256HexText(JSON.stringify({ source_body_hash: sourceBodyHash, input: sourceInput }));
}

function isResourceDraftScaffoldBody(raw: unknown): boolean {
  const value = String(raw ?? "").trim();
  if (!value) return true;
  const normalized = value.toLowerCase();
  return (
    normalized.includes("draft scaffold") ||
    normalized.includes("the page body still needs drafting from that source")
  );
}

function markdownLinkLabel(raw: unknown): string {
  return String(raw ?? "Source").trim().replace(/[\[\]]/g, "") || "Source";
}

function buildSourceAttributionLine(source: CommunityResourceLike): string {
  const title = markdownLinkLabel(source.title);
  const url = String(source.url ?? (source as any).sourceExternalUrl ?? "").trim();
  return url ? `Source: [${title}](${url})` : `Source: ${title}`;
}

function buildReviewReadyResourceBody(args: {
  pageTitle: string;
  generatedBody: string;
  source: CommunityResourceLike;
}): string {
  const body = String(args.generatedBody ?? "").trim();
  const attribution = buildSourceAttributionLine(args.source);
  const withHeading = /^#\s+/m.test(body)
    ? body
    : [`# ${String(args.pageTitle ?? "").trim()}`, "", body].join("\n");
  return normalizeOptionalText(
    [withHeading, "", "---", attribution, "Status: AI draft for human review."].join("\n"),
    COMMUNITY_RESOURCE_CONTENT_WRITER_BODY_CHARS,
  ) ?? "";
}

function buildWikiArchitectValidationInput(args: {
  proposal: unknown;
  modules: CommunityResourceModuleLike[];
  pages: CommunityResourceLike[];
  sources: CommunityResourceLike[];
  moduleNameById: Map<string, string>;
}): CommunityWikiArchitectProposalValidationInput {
  return {
    proposal: args.proposal,
    existingModules: args.modules.map((module) => ({
      id: normalizeIdValue(module._id),
      name: String(module.name ?? ""),
    })),
    existingPages: args.pages.map((page) => ({
      id: normalizeIdValue(page._id),
      title: String(page.title ?? ""),
      moduleName: args.moduleNameById.get(normalizeIdValue(page.moduleId ?? "")) ?? null,
      status: normalizeResourceStatus(page.status),
      updatedAt: Number(page.updatedAt),
      bodyMd: page.bodyMd ?? null,
      sourceResourceId: normalizeIdValue(page.sourceResourceId ?? "") || null,
    })),
    sourceInbox: args.sources.map((source) => ({
      id: normalizeIdValue(source._id),
      title: String(source.title ?? ""),
      status: normalizeResourceStatus(source.status),
    })),
  };
}

function buildAppliedDraftPlaceholderBody(args: {
  title: string;
  purpose: string;
}): string {
  return [
    `# ${String(args.title ?? "").trim()}`,
    "",
    "> Draft page. This page is not in a live category yet.",
    "",
    `Purpose: ${String(args.purpose ?? "").trim()}`,
    "",
    "Source: linked source-inbox item. The page body still needs drafting from that source.",
  ].join("\n");
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function normalizeBuilderIntent(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return value.slice(0, 2_000);
}

function extractJsonObject(raw: string): unknown {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error("empty_model_output");
  try {
    return JSON.parse(text);
  } catch {
    // Continue to fenced / embedded JSON extraction.
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue to object span extraction.
    }
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error("model_output_not_json");
  return JSON.parse(text.slice(firstBrace, lastBrace + 1));
}

function parseResourceContentWriterBody(raw: string): string {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("content_writer_output_not_object");
  }
  const record = parsed as Record<string, unknown>;
  const body = normalizeOptionalText(
    record.body_md ?? record.bodyMd,
    COMMUNITY_RESOURCE_CONTENT_WRITER_BODY_CHARS,
  );
  if (!body || body.length < 40) throw new Error("content_writer_body_too_short");
  if (isResourceDraftScaffoldBody(body)) throw new Error("content_writer_returned_scaffold");
  return body;
}

export const buildCommunityWikiArchitectRunContextInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    builderIntent: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const [agentConfigs, modules, resources] = await Promise.all([
      ctx.db
        .query("communityAgentConfigs" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityAgentConfigLike[]>,
      ctx.db
        .query("communityResourceModules" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceModuleLike[]>,
      ctx.db
        .query("communityResources" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceLike[]>,
    ]);

    const selectedAgentConfig =
      agentConfigs
        .slice()
        .sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt)[0] ?? null;
    const moduleNameById = new Map(
      modules.map((module) => [normalizeIdValue(module._id), String(module.name ?? "")]),
    );
    const allPages = resources
      .filter((row) => normalizeResourceRole(row.role) === "page")
      .slice()
      .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.createdAt - right.createdAt);
    const allSources = resources
      .filter((row) => normalizeResourceRole(row.role) === "source")
      .slice()
      .sort((left, right) => right.createdAt - left.createdAt);
    const pages = await Promise.all(
      allPages
        .slice(0, COMMUNITY_WIKI_ARCHITECT_MAX_CONTEXT_RESOURCES)
        .map((page) => hydrateCommunityResourceBody(ctx, page).then((hydrated) => hydrated ?? page)),
    );
    const assignedPagesBySourceId = new Map<string, string[]>();
    for (const page of pages) {
      const sourceId = normalizeIdValue(page.sourceResourceId ?? "");
      if (!sourceId) continue;
      const rows = assignedPagesBySourceId.get(sourceId) ?? [];
      rows.push(normalizeIdValue(page._id));
      assignedPagesBySourceId.set(sourceId, rows);
    }
    const readySourceRows = allSources.filter(communityResourceSourceHasReadyText);
    const readySourceCandidates = readySourceRows
      .slice()
      .sort(compareArchitectSourceCandidates(assignedPagesBySourceId))
      .slice(0, COMMUNITY_WIKI_ARCHITECT_MAX_SOURCE_HYDRATION_CANDIDATES);
    const readySources = await Promise.all(
      readySourceCandidates
        .map((source) => hydrateCommunityResourceBody(ctx, source).then((hydrated) => hydrated ?? source)),
    );
    const sourceUnitsBySourceId = await loadSourceUnitCardsBySourceId(ctx, {
      sourceIds: readySources.map((source) => normalizeIdValue(source._id)).filter(Boolean),
      maxTotal: COMMUNITY_WIKI_ARCHITECT_MAX_VISIBLE_SOURCE_UNIT_CARDS,
      maxPerSource: COMMUNITY_WIKI_ARCHITECT_MAX_SOURCE_UNITS_PER_SOURCE_CARD,
      excerptChars: COMMUNITY_WIKI_ARCHITECT_SOURCE_UNIT_EXCERPT_CHARS,
    });
    const builderIntent = normalizeBuilderIntent(args.builderIntent);
    const sourceWindow = buildArchitectSourceWindow({
      readySources,
      readySourcesTotal: readySourceRows.length,
      assignedPagesBySourceId,
      sourceUnitsBySourceId,
      builderIntent,
    });
    const readySourceById = new Map(
      readySources.map((source) => [normalizeIdValue(source._id), source]),
    );
    const visibleSourceRevisions = await Promise.all(
      sourceWindow.visibleSourceIds.map(async (sourceId) => {
        const source = readySourceById.get(sourceId);
        return source
          ? await buildCommunityWikiArchitectSourceRevision(
              ctx,
              source,
              assignedPagesBySourceId.get(sourceId) ?? [],
            )
          : null;
      }),
    );

    const communityRow = community as CommunityLike;
    return {
      ok: true,
      kind: "community_wiki_architect_run_context",
      user_id: normalizeIdValue(userId),
      builder_intent: builderIntent,
      community: {
        id: normalizeIdValue(communityRow._id),
        slug: String(communityRow.slug ?? ""),
        name: String(communityRow.name ?? ""),
        description: String(communityRow.oneLiner ?? "").trim() || null,
        about: String(communityRow.about ?? "").trim() || null,
        agent_instructions: selectedAgentConfig?.systemPrompt ?? null,
        visibility: communityRow.visibility,
        entry_policy: resolveCommunityEntryPolicy(communityRow),
      },
      current_resource_state: {
        pages_total: allPages.length,
        pages_visible: pages.length,
        pages_truncated: allPages.length > pages.length,
        sources_total: allSources.length,
        ready_sources_total: readySourceRows.length,
        sources_pending_ingestion: allSources.filter((source) => {
          const status = normalizeResourceSourceIngestionStatus(source);
          return status === "queued" || status === "processing";
        }).length,
        sources_failed_ingestion: allSources.filter((source) => normalizeResourceSourceIngestionStatus(source) === "failed").length,
        sources_visible: sourceWindow.sourceCards.length,
        sources_omitted: sourceWindow.sourcesOmitted,
        sources_truncated: sourceWindow.sourcesOmitted > 0,
        source_context_budget_chars: sourceWindow.budgetChars,
        source_context_used_chars: sourceWindow.usedChars,
        visible_source_ids: sourceWindow.visibleSourceIds,
        visible_source_revisions: visibleSourceRevisions.filter(Boolean),
        modules: modules
          .slice()
          .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt)
          .map((module) => ({
            id: normalizeIdValue(module._id),
            name: String(module.name ?? ""),
            description_md: String(module.descriptionMd ?? "").trim() || null,
            updated_at: toIsoString(module.updatedAt),
          })),
        pages: pages.map((page) => ({
          id: normalizeIdValue(page._id),
          title: String(page.title ?? ""),
          module_id: normalizeIdValue(page.moduleId ?? "") || null,
          module: moduleNameById.get(normalizeIdValue(page.moduleId ?? "")) ?? null,
          status: normalizeResourceStatus(page.status),
          updated_at: toIsoString(page.updatedAt),
          updated_at_ms: page.updatedAt,
          source_resource_id: normalizeIdValue(page.sourceResourceId ?? "") || null,
          body_chars: communityResourceBodyChars(page),
        })),
        source_inbox: sourceWindow.sourceCards,
      },
    };
  },
});

export const runCommunityWikiArchitectProposal: any = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    builderIntent: v.optional(v.union(v.string(), v.null())),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const context: any = await ctx.runQuery(
      (internal as any).communityWikiArchitect.buildCommunityWikiArchitectRunContextInternal,
      {
        userId: args.userId,
        authSubject: args.authSubject,
        communityId: args.communityId,
        builderIntent: args.builderIntent ?? null,
      },
    );
    const state = (context as any)?.current_resource_state ?? {};
    if (Number(state.sources_total ?? 0) > 0 && Number(state.ready_sources_total ?? 0) <= 0) {
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: "no_ready_sources",
        message: "Source material must be ingested before the Wiki Architect can draft resources.",
      };
    }

    const actorUserId = String(context?.user_id ?? "").trim();
    if (!actorUserId) throw new Error("community_wiki_architect_actor_required");
    const requestId = String(args.requestId ?? "").trim().slice(0, 160) || crypto.randomUUID();
    const funding = await resolveCommunityInferenceFundingForAction(ctx, args.communityId);
    const fundedRun = await startFundedInferenceRun({
      ctx,
      communityId: args.communityId,
      actorUserId,
      surface: "community_setup_generation",
      receiptKey: `community_setup_generation:wiki_architect:${requestId}`,
      sourceRunId: `community-wiki-architect:${requestId}`,
      admission: funding,
    });
    let response: Awaited<ReturnType<typeof fundedRun.request>>;
    try {
      response = await fundedRun.request({
        messages: [
          { role: "system", content: COMMUNITY_WIKI_ARCHITECT_PROMPT },
          { role: "user", content: JSON.stringify(context, null, 2) },
        ],
        maxTokens: COMMUNITY_WIKI_ARCHITECT_MAX_OUTPUT_TOKENS,
        tools: [],
        apiKeyOverride: readEnv("OPENAI_API_KEY") || readEnv("ARX_OPENAI_API_KEY") || undefined,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "community_wiki_architect_provider_failed";
      await fundedRun.fail(code);
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code,
        message: "Wiki Architect inference could not complete.",
      };
    }
    if (!response.ok) {
      await fundedRun.fail(response.code);
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: response.code,
        message: response.message,
      };
    }
    const settled = await fundedRun.settle(response.type === "assistant"
      ? "provider_completed" : "invalid_model_output");
    if (!settled) {
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: "provider_token_usage_missing",
        message: "Wiki Architect usage could not be settled safely.",
      };
    }
    if (response.type !== "assistant") {
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: "invalid_model_output",
        message: "Wiki Architect returned an unexpected tool call.",
      };
    }
    const completion = {
      outputText: response.assistantText,
      modelId: fundedRun.modelId,
      resolvedModelId: response.resolvedModelId,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
    };

    let parsedProposal: unknown;
    try {
      parsedProposal = extractJsonObject(completion.outputText);
    } catch (error) {
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: "invalid_architect_output",
        failure_reason: "json_parse_failed",
        message: error instanceof Error ? error.message : "Wiki Architect returned invalid JSON.",
        output_preview: completion.outputText.slice(0, 1600),
      };
    }

    const validation = validateCommunityWikiArchitectProposal({
      proposal: parsedProposal,
      existingModules: Array.isArray(state.modules) ? state.modules : [],
      existingPages: Array.isArray(state.pages)
        ? state.pages.map((page: any) => ({
            id: String(page.id ?? ""),
            title: String(page.title ?? ""),
            moduleName: typeof page.module === "string" ? page.module : null,
            status: String(page.status ?? ""),
            updatedAt: Number(page.updated_at_ms),
            sourceResourceId: typeof page.source_resource_id === "string" ? page.source_resource_id : null,
          }))
        : [],
      sourceInbox: Array.isArray(state.source_inbox) ? state.source_inbox : [],
    });
    if (!validation.ok) {
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: "invalid_architect_output",
        failure_reason: "proposal_validation_failed",
        message: "Wiki Architect proposal failed validation.",
        errors: validation.errors,
        output_preview: completion.outputText.slice(0, 1600),
        model_id: completion.resolvedModelId ?? completion.modelId,
        usage: {
          prompt_tokens: completion.promptTokens,
          completion_tokens: completion.completionTokens,
        },
      };
    }
    const hasDraftWrites =
      validation.value.drafts_created.length > 0 || validation.value.drafts_updated.length > 0;
    const visibleSourceIds = new Set(
      (Array.isArray(state.visible_source_ids) ? state.visible_source_ids : [])
        .map((id: unknown) => String(id ?? "").trim())
        .filter(Boolean),
    );
    const proposedVisibleSourceErrors = [
      ...validation.value.drafts_created.map((draft, index) => ({
        path: `$.drafts_created[${index}].source_resource_id`,
        sourceId: draft.source_resource_id,
      })),
      ...validation.value.drafts_updated.map((draft, index) => ({
        path: `$.drafts_updated[${index}].source_resource_id`,
        sourceId: draft.source_resource_id,
      })),
    ].filter((row) => row.sourceId !== null && !visibleSourceIds.has(String(row.sourceId ?? "")));

    if (proposedVisibleSourceErrors.length > 0) {
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: "invalid_architect_output",
        failure_reason: "source_lineage_invalid",
        message: "Wiki Architect proposed source lineage outside the visible source window.",
        errors: proposedVisibleSourceErrors.map((row) => ({
          path: row.path,
          message: "source_resource_id must be one of current_resource_state.visible_source_ids.",
        })),
        output_preview: completion.outputText.slice(0, 1600),
        model_id: completion.resolvedModelId ?? completion.modelId,
        usage: {
          prompt_tokens: completion.promptTokens,
          completion_tokens: completion.completionTokens,
        },
      };
    }

    if (Boolean(state.pages_truncated) && hasDraftWrites) {
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: "invalid_architect_output",
        failure_reason: "page_window_truncated",
        message: "Wiki Architect cannot propose draft writes from a truncated page window.",
        errors: [
          {
            path: "$.drafts_created",
            message: "Narrow builder intent before proposing draft writes from visible pages.",
          },
        ],
        output_preview: completion.outputText.slice(0, 1600),
        model_id: completion.resolvedModelId ?? completion.modelId,
        usage: {
          prompt_tokens: completion.promptTokens,
          completion_tokens: completion.completionTokens,
        },
      };
    }

    return {
      ok: true,
      kind: "community_wiki_architect_proposal",
      proposal: validation.value,
      source_revisions: Array.isArray(state.visible_source_revisions)
        ? state.visible_source_revisions
        : [],
      model_id: completion.resolvedModelId ?? completion.modelId,
      usage: {
        prompt_tokens: completion.promptTokens,
        completion_tokens: completion.completionTokens,
      },
      context_summary: {
        modules: Array.isArray(state.modules) ? state.modules.length : 0,
        pages: Array.isArray(state.pages) ? state.pages.length : 0,
        sources: Array.isArray(state.source_inbox) ? state.source_inbox.length : 0,
        pages_total: Number(state.pages_total ?? 0),
        sources_total: Number(state.sources_total ?? 0),
        ready_sources_total: Number(state.ready_sources_total ?? 0),
        sources_omitted: Number(state.sources_omitted ?? 0),
        source_context_budget_chars: Number(state.source_context_budget_chars ?? 0),
        source_context_used_chars: Number(state.source_context_used_chars ?? 0),
        pages_truncated: Boolean(state.pages_truncated),
        sources_truncated: Boolean(state.sources_truncated),
      },
    };
  },
});

export async function applyCommunityWikiArchitectProposalCore(ctx: any, args: {
  userId: any;
  communityId: any;
  proposal: unknown;
  expectedSourceRevisions?: CommunityWikiArchitectSourceRevision[];
}): Promise<Record<string, unknown>> {
    const userId = args.userId;
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });

    const nowMs = Date.now();
    const [modules, resources] = await Promise.all([
      ctx.db
        .query("communityResourceModules" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceModuleLike[]>,
      ctx.db
        .query("communityResources" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceLike[]>,
    ]);
    const pages = resources.filter((row) => normalizeResourceRole(row.role) === "page");
    const sources = resources.filter((row) => communityResourceSourceHasReadyText(row));
    const moduleNameById = buildModuleNameById(modules);
    const validation = validateCommunityWikiArchitectProposal(
      buildWikiArchitectValidationInput({
        proposal: args.proposal,
        modules,
        pages,
        sources,
        moduleNameById,
      }),
    );
    if (!validation.ok) {
      return {
        ok: false,
        kind: "community_wiki_architect_apply",
        code: "invalid_architect_proposal",
        message: "Wiki Architect proposal failed current-state validation.",
        errors: validation.errors,
      };
    }

    const proposal = validation.value as CommunityWikiArchitectProposal;
    const moduleByName = new Map(
      modules.map((module) => [normalizeCommunityResourceBuilderTitle(module.name), module]),
    );
    const sourceById = new Map(sources.map((source) => [normalizeIdValue(source._id), source]));
    const pageById = new Map(pages.map((page) => [normalizeIdValue(page._id), page]));
    const assignedPagesBySourceId = new Map<string, string[]>();
    for (const page of pages) {
      const sourceId = normalizeIdValue(page.sourceResourceId ?? "");
      if (!sourceId) continue;
      const assignedPages = assignedPagesBySourceId.get(sourceId) ?? [];
      assignedPages.push(normalizeIdValue(page._id));
      assignedPagesBySourceId.set(sourceId, assignedPages);
    }
    const pageKeys = new Set(
      pages.map((page) =>
        getCommunityResourceBuilderModulePageKey({
          moduleName: moduleNameById.get(normalizeIdValue(page.moduleId ?? "")) ?? "",
          title: page.title,
        }),
      ),
    );

    const modulesCreated: string[] = [];
    const pagesCreated: string[] = [];
    const pagesUpdated: string[] = [];
    const sourceModulesUpdated: string[] = [];
    const sourceBackedPages: AppliedSourceBackedPage[] = [];
    if (args.expectedSourceRevisions) {
      const expectedRevisionBySourceId = new Map(
        args.expectedSourceRevisions.map((revision) => [
          String(revision.source_resource_id),
          String(revision.revision_hash),
        ]),
      );
      const usedSourceIds = new Set([
        ...proposal.drafts_created.map((draft) => draft.source_resource_id),
        ...proposal.drafts_updated.map((draft) => draft.source_resource_id),
      ].filter((sourceId): sourceId is string => Boolean(sourceId)));
      for (const sourceId of usedSourceIds) {
        const sourceRow = sourceById.get(sourceId);
        const source = await hydrateCommunityResourceBody(ctx, sourceRow) ?? sourceRow;
        const expectedRevision = expectedRevisionBySourceId.get(sourceId);
        if (!source || !expectedRevision) {
          throw new Error("community_wiki_architect_source_changed");
        }
        const currentRevision = await buildCommunityWikiArchitectSourceRevision(
          ctx,
          source,
          assignedPagesBySourceId.get(sourceId) ?? [],
        );
        if (currentRevision.revision_hash !== expectedRevision) {
          throw new Error("community_wiki_architect_source_changed");
        }
        sourceById.set(sourceId, source);
      }
    }
    let nextModuleSortOrder =
      modules.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000;
    const nextPageSortOrderByModule = new Map<string, number>();
    for (const page of pages) {
      const moduleIdentity = resourceModuleIdentity(page.moduleId);
      const nextSortOrder = Math.max(
        nextPageSortOrderByModule.get(moduleIdentity) ?? 0,
        Number(page.sortOrder) || 0,
      );
      nextPageSortOrderByModule.set(moduleIdentity, nextSortOrder);
    }
    const patchSourceModuleIfNeeded = async (
      source: CommunityResourceLike | null,
      moduleId: any | null | undefined,
    ): Promise<void> => {
      if (!source || !moduleId) return;
      if (resourceModuleIdentity(source.moduleId) === resourceModuleIdentity(moduleId)) return;
      await ctx.db.patch(source._id as any, {
        moduleId,
        updatedAt: nowMs,
      });
      const updatedSource = (await ctx.db.get(source._id as any)) as CommunityResourceLike | null;
      if (!updatedSource) throw new Error("community_wiki_architect_source_not_found");
      sourceById.set(normalizeIdValue(updatedSource._id), updatedSource);
      await syncCommunityResourceMemoryProjection(ctx, updatedSource, nowMs);
      sourceModulesUpdated.push(updatedSource.title);
    };

    for (const moduleProposal of proposal.modules_created) {
      const normalizedName = normalizeCommunityResourceBuilderTitle(moduleProposal.name);
      if (moduleByName.has(normalizedName)) {
        throw new Error("community_wiki_architect_module_conflict");
      }
      const moduleId = await ctx.db.insert("communityResourceModules" as any, {
        communityId: args.communityId,
        createdByUserId: userId,
        status: "draft",
        name: normalizeName(moduleProposal.name),
        descriptionMd: normalizeOptionalText(moduleProposal.purpose, 1200),
        sortOrder: nextModuleSortOrder,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      nextModuleSortOrder += 1000;
      const createdModule = (await ctx.db.get(moduleId as any)) as CommunityResourceModuleLike | null;
      if (!createdModule) throw new Error("community_wiki_architect_module_create_failed");
      moduleByName.set(normalizedName, createdModule);
      moduleNameById.set(normalizeIdValue(createdModule._id), String(createdModule.name ?? ""));
      modulesCreated.push(createdModule.name);
    }

    for (const draft of proposal.drafts_created) {
      const normalizedModuleName = normalizeCommunityResourceBuilderTitle(draft.module);
      const module = moduleByName.get(normalizedModuleName);
      if (!module) throw new Error("community_wiki_architect_module_missing");
      const pageKey = getCommunityResourceBuilderModulePageKey({
        moduleName: module.name,
        title: draft.title,
      });
      if (pageKeys.has(pageKey)) {
        throw new Error("community_wiki_architect_page_conflict");
      }
      const source = draft.source_resource_id ? sourceById.get(draft.source_resource_id) ?? null : null;
      if (draft.source_resource_id && !source) throw new Error("community_wiki_architect_source_missing");
      const moduleIdentity = resourceModuleIdentity(module._id);
      const sortOrder = (nextPageSortOrderByModule.get(moduleIdentity) ?? 0) + 1000;
      nextPageSortOrderByModule.set(moduleIdentity, sortOrder);
      const resourceId = await ctx.db.insert("communityResources" as any, {
        communityId: args.communityId,
        moduleId: module._id,
        createdByUserId: userId,
        type: "post",
        role: "page",
        status: "draft",
        ...(source ? { sourceResourceId: source._id } : {}),
        title: normalizeName(draft.title),
        pinned: false,
        sortOrder,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const createdPage = (await ctx.db.get(resourceId as any)) as CommunityResourceLike | null;
      if (!createdPage) throw new Error("community_wiki_architect_page_create_failed");
      await writeCommunityResourceBodyContent(ctx, {
        communityId: args.communityId,
        resourceId: createdPage._id,
        bodyMd: buildAppliedDraftPlaceholderBody({
          title: draft.title,
          purpose: draft.purpose,
        }),
        nowMs,
        maxChars: 20_000,
      });
      const hydratedCreatedPage = await hydrateCommunityResourceBody(ctx, createdPage) ?? createdPage;
      await syncCommunityResourceMemoryProjection(ctx, hydratedCreatedPage, nowMs);
      await patchSourceModuleIfNeeded(source, module._id);
      if (source && draft.source_resource_id) {
        sourceBackedPages.push({
          page: hydratedCreatedPage,
          source: sourceById.get(draft.source_resource_id) ?? source,
        });
      }
      pageKeys.add(pageKey);
      pagesCreated.push(`${module.name}/${hydratedCreatedPage.title}`);
    }

    for (const update of proposal.drafts_updated) {
      const page = pageById.get(update.resource_id);
      const source = sourceById.get(update.source_resource_id);
      if (!page || !source) throw new Error("community_wiki_architect_update_target_missing");
      if (Number(page.updatedAt) !== update.expected_updated_at) {
        throw new Error("community_wiki_architect_update_conflict");
      }
      if (normalizeResourceStatus(page.status) !== "draft") {
        throw new Error("community_wiki_architect_update_requires_draft");
      }
      if (normalizeIdValue(page.sourceResourceId ?? "")) {
        throw new Error("community_wiki_architect_update_source_exists");
      }
      await ctx.db.patch(page._id as any, {
        sourceResourceId: source._id,
        updatedAt: nowMs,
      });
      const updatedPage = (await ctx.db.get(page._id as any)) as CommunityResourceLike | null;
      if (!updatedPage) throw new Error("community_wiki_architect_page_not_found");
      await syncCommunityResourceMemoryProjection(ctx, updatedPage, nowMs);
      await patchSourceModuleIfNeeded(source, updatedPage.moduleId ?? null);
      sourceBackedPages.push({
        page: updatedPage,
        source: sourceById.get(update.source_resource_id) ?? source,
      });
      pagesUpdated.push(updatedPage.title);
    }

    const architectureQuality = buildCommunityWikiArchitectureQuality({
      sourceBackedPages,
      readySourcesTotal: sources.length,
      moduleNameById,
    });
    if (architectureQuality.ok === false) {
      throw new Error("community_wiki_architect_architecture_quality_failed");
    }

    return {
      ok: true,
      kind: "community_wiki_architect_apply",
      summary: {
        modules_created: modulesCreated,
        pages_created: pagesCreated,
        pages_updated: pagesUpdated,
        source_modules_updated: sourceModulesUpdated,
      },
      architecture_quality: architectureQuality,
      health: await buildCommunityResourceBuilderHealthReport({
        ctx,
        communityId: args.communityId,
        nowMs: Date.now(),
      }),
    };
}

export const applyCommunityWikiArchitectProposal: any = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    proposal: v.any(),
    expectedSourceRevisions: v.optional(v.array(v.object({
      source_resource_id: v.string(),
      revision_hash: v.string(),
    }))),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await applyCommunityWikiArchitectProposalCore(ctx, {
      userId,
      communityId: args.communityId,
      proposal: args.proposal,
      expectedSourceRevisions: args.expectedSourceRevisions,
    });
  },
});

export const buildCommunityResourceContentWriterRunContextInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = Math.max(
      1,
      Math.min(
        COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_PAGES,
        Math.floor(args.limit ?? COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_PAGES),
      ),
    );
    const [modules, resources] = await Promise.all([
      ctx.db
        .query("communityResourceModules" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceModuleLike[]>,
      ctx.db
        .query("communityResources" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceLike[]>,
    ]);
    const moduleNameById = buildModuleNameById(modules);
    const pageCandidates = await Promise.all(
      resources
        .filter((page) =>
          normalizeResourceRole(page.role) === "page" &&
          normalizeResourceStatus(page.status) === "draft" &&
          Boolean(normalizeIdValue(page.sourceResourceId ?? "")),
        )
        .slice()
        .sort((left, right) => left.updatedAt - right.updatedAt || left.createdAt - right.createdAt)
        .slice(0, COMMUNITY_RESOURCE_CONTENT_WRITER_PAGE_SCAN_LIMIT)
        .map((page) => hydrateCommunityResourceBody(ctx, page).then((hydrated) => hydrated ?? page)),
    );
    const pages = pageCandidates
      .filter((page) =>
        isResourceDraftScaffoldBody(page.bodyMd),
      )
      .slice()
      .sort((left, right) => left.updatedAt - right.updatedAt || left.createdAt - right.createdAt);
    const neededSourceIds = new Set(
      pages
        .slice(0, limit)
        .map((page) => normalizeIdValue(page.sourceResourceId ?? ""))
        .filter(Boolean),
    );
    const readySources = await Promise.all(
      resources
        .filter((source) =>
          neededSourceIds.has(normalizeIdValue(source._id)) &&
          communityResourceSourceHasReadyText(source),
        )
        .map((source) => hydrateCommunityResourceBody(ctx, source).then((hydrated) => hydrated ?? source)),
    );
    const readySourceById = new Map(
      readySources.map((source) => [normalizeIdValue(source._id), source]),
    );
    const candidates = (await Promise.all(
      pages.slice(0, limit).map(async (page) => {
        const sourceId = normalizeIdValue(page.sourceResourceId ?? "");
        const source = readySourceById.get(sourceId) ?? null;
        if (!source) return null;
        const pageModule = moduleNameById.get(normalizeIdValue(page.moduleId ?? "")) ?? null;
        const unitContext = await buildContentWriterSourceFromUnits(ctx, {
          sourceId,
          pageTitle: String(page.title ?? ""),
          pageModule,
          pageBody: String(page.bodyMd ?? ""),
        });
        const sourceInput = buildCommunityResourceContentWriterSourceInput({
          source,
          bodyMd: unitContext.sourceBodyMd ?? truncateContentWriterSource(source.bodyMd),
        });
        return {
          page_id: normalizeIdValue(page._id),
          page_title: String(page.title ?? ""),
          page_module: pageModule,
          expected_updated_at: Number(page.updatedAt),
          source_resource_id: sourceId,
          source_title: String(source.title ?? ""),
          source_url: String(source.url ?? (source as any).sourceExternalUrl ?? "").trim() || null,
          source_ingestion_status: normalizeResourceSourceIngestionStatus(source),
          source_units: unitContext.sourceUnits,
          source_body_md: sourceInput.body_md,
          expected_source_revision_hash:
            await hashCommunityResourceContentWriterSourceRevision(source, sourceInput),
        };
      }),
    ))
      .filter(Boolean)
      .slice(0, limit);

    const communityRow = community as CommunityLike;
    return {
      ok: true,
      kind: "community_resource_content_writer_context",
      user_id: normalizeIdValue(userId),
      community: {
        id: normalizeIdValue(communityRow._id),
        slug: String(communityRow.slug ?? ""),
        name: String(communityRow.name ?? ""),
        description: String(communityRow.oneLiner ?? "").trim() || null,
        about: String(communityRow.about ?? "").trim() || null,
      },
      candidates,
    };
  },
});

export const patchCommunityResourceContentDraftInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    pageId: v.id("communityResources"),
    sourceResourceId: v.id("communityResources"),
    expectedUpdatedAt: v.number(),
    expectedSourceRevisionHash: v.string(),
    bodyMd: v.string(),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const [pageRow, sourceRow] = await Promise.all([
      ctx.db.get(args.pageId as any) as Promise<CommunityResourceLike | null>,
      ctx.db.get(args.sourceResourceId as any) as Promise<CommunityResourceLike | null>,
    ]);
    const page = await hydrateCommunityResourceBody(ctx, pageRow) ?? pageRow;
    const source = await hydrateCommunityResourceBody(ctx, sourceRow) ?? sourceRow;
    if (!page || normalizeIdValue(page.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_resource_content_writer_page_missing");
    }
    if (!source || normalizeIdValue(source.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_resource_content_writer_source_missing");
    }
    if (normalizeResourceRole(page.role) !== "page") {
      throw new Error("community_resource_content_writer_page_required");
    }
    if (normalizeResourceStatus(page.status) !== "draft") {
      throw new Error("community_resource_content_writer_requires_draft");
    }
    if (normalizeIdValue(page.sourceResourceId ?? "") !== normalizeIdValue(args.sourceResourceId)) {
      throw new Error("community_resource_content_writer_source_conflict");
    }
    if (Number(page.updatedAt) !== Math.floor(args.expectedUpdatedAt)) {
      throw new Error("community_resource_content_writer_update_conflict");
    }
    if (!isResourceDraftScaffoldBody(page.bodyMd)) {
      throw new Error("community_resource_content_writer_refuses_overwrite");
    }
    if (!communityResourceSourceHasReadyText(source)) {
      throw new Error("community_resource_content_writer_source_not_ready");
    }
    const pageModuleRow = page.moduleId
      ? await ctx.db.get(page.moduleId as any) as CommunityResourceModuleLike | null
      : null;
    const pageModule = pageModuleRow &&
      normalizeIdValue(pageModuleRow.communityId) === normalizeIdValue(args.communityId)
      ? String(pageModuleRow.name ?? "")
      : null;
    const currentUnitContext = await buildContentWriterSourceFromUnits(ctx, {
      sourceId: normalizeIdValue(source._id),
      pageTitle: String(page.title ?? ""),
      pageModule,
      pageBody: String(page.bodyMd ?? ""),
    });
    const currentSourceInput = buildCommunityResourceContentWriterSourceInput({
      source,
      bodyMd: currentUnitContext.sourceBodyMd ?? truncateContentWriterSource(source.bodyMd),
    });
    const currentSourceRevisionHash =
      await hashCommunityResourceContentWriterSourceRevision(source, currentSourceInput);
    if (currentSourceRevisionHash !== String(args.expectedSourceRevisionHash ?? "")) {
      throw new Error("community_resource_content_writer_source_changed");
    }
    const bodyMd = normalizeOptionalText(args.bodyMd, COMMUNITY_RESOURCE_CONTENT_WRITER_BODY_CHARS);
    if (!bodyMd || isResourceDraftScaffoldBody(bodyMd)) {
      throw new Error("community_resource_content_writer_body_invalid");
    }
    const nowMs = Date.now();
    await ctx.db.patch(page._id as any, {
      status: "review",
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(page._id as any)) as CommunityResourceLike | null;
    if (!updated) throw new Error("community_resource_content_writer_page_not_found");
    await writeCommunityResourceBodyContent(ctx, {
      communityId: args.communityId,
      resourceId: updated._id,
      bodyMd,
      nowMs,
      maxChars: COMMUNITY_RESOURCE_CONTENT_WRITER_BODY_CHARS,
    });
    const hydrated = await hydrateCommunityResourceBody(ctx, updated) ?? updated;
    await syncCommunityResourceMemoryProjection(ctx, hydrated, nowMs);
    return {
      id: normalizeIdValue(hydrated._id),
      title: String(hydrated.title ?? ""),
      status: normalizeResourceStatus(hydrated.status),
      source_resource_id: normalizeIdValue(hydrated.sourceResourceId ?? "") || null,
    };
  },
});

export const draftCommunityResourceContentFromSources: any = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const context: any = await ctx.runQuery(
      (internal as any).communityWikiArchitect.buildCommunityResourceContentWriterRunContextInternal,
      {
        userId: args.userId,
        authSubject: args.authSubject,
        communityId: args.communityId,
        limit: args.limit,
      },
    );
    const candidates = Array.isArray(context?.candidates) ? context.candidates : [];
    const userId = context?.user_id;
    if (candidates.length <= 0) {
      return {
        ok: true,
        kind: "community_resource_content_writer",
        candidates: 0,
        drafted: 0,
        failed: 0,
        pages: [],
        failures: [],
        usage: { prompt_tokens: null, completion_tokens: null },
        code: null,
        message: "No source-linked draft pages needed content.",
      };
    }
    if (!userId) throw new Error("community_resource_content_writer_actor_required");
    const requestId = String(args.requestId ?? "").trim().slice(0, 160) || crypto.randomUUID();
    const funding = await resolveCommunityInferenceFundingForAction(ctx, args.communityId);
    const fundedRun = await startFundedInferenceRun({
      ctx,
      communityId: args.communityId,
      actorUserId: userId,
      surface: "community_setup_generation",
      receiptKey: `community_setup_generation:resource_writer:${requestId}`,
      sourceRunId: `community-resource-content-writer:${requestId}`,
      admission: funding,
    });
    let drafted = 0;
    let failed = 0;
    const pages: Array<{ id: string; title: string; status: string; source_resource_id: string | null }> = [];
    const failures: Array<{ resource_id: string; title: string; message: string }> = [];
    const pendingDrafts: Array<{
      pageId: string;
      sourceId: string;
      title: string;
      expectedUpdatedAt: number;
      expectedSourceRevisionHash: string;
      bodyMd: string;
    }> = [];
    let providerCompleted = false;
    let providerFailureCode = "community_resource_content_writer_candidate_invalid";

    for (const candidate of candidates) {
      const pageId = String(candidate.page_id ?? "").trim();
      const sourceId = String(candidate.source_resource_id ?? "").trim();
      const title = String(candidate.page_title ?? "").trim();
      try {
        if (!pageId || !sourceId || !userId) {
          throw new Error("community_resource_content_writer_candidate_invalid");
        }
        const sourceInput: CommunityResourceContentWriterSourceInput = {
          id: sourceId,
          title: String(candidate.source_title ?? ""),
          url: candidate.source_url ?? null,
          body_md: String(candidate.source_body_md ?? ""),
        };
        const completion = await fundedRun.request({
          messages: [
            { role: "system", content: COMMUNITY_RESOURCE_CONTENT_WRITER_PROMPT },
            { role: "user", content: JSON.stringify({
              community: context.community,
              page: { id: pageId, title, module: candidate.page_module ?? null },
              source: sourceInput,
            }, null, 2) },
          ],
          maxTokens: COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_OUTPUT_TOKENS,
          tools: [],
          apiKeyOverride: readEnv("OPENAI_API_KEY") || readEnv("ARX_OPENAI_API_KEY") || undefined,
        });
        if (!completion.ok) {
          providerFailureCode = completion.code;
          throw new Error(completion.message);
        }
        providerCompleted = true;
        if (completion.type !== "assistant") throw new Error("content_writer_unexpected_tool_call");
        if (!fundedRun.usage().complete) throw new Error("provider_token_usage_missing");
        const generatedBody = parseResourceContentWriterBody(completion.assistantText);
        const bodyMd = buildReviewReadyResourceBody({
          pageTitle: title,
          generatedBody,
          source: {
            _id: sourceId,
            title: candidate.source_title,
            url: candidate.source_url ?? null,
          } as unknown as CommunityResourceLike,
        });
        pendingDrafts.push({
          pageId,
          sourceId,
          title,
          expectedUpdatedAt: Number(candidate.expected_updated_at),
          expectedSourceRevisionHash: String(candidate.expected_source_revision_hash ?? ""),
          bodyMd,
        });
      } catch (error) {
        failed += 1;
        failures.push({
          resource_id: pageId,
          title,
          message: error instanceof Error ? error.message : "community_resource_content_writer_failed",
        });
        if (!fundedRun.usage().complete ||
            (error instanceof Error && error.message === FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED)) break;
      }
    }

    let fundingSettlementError: string | null = null;
    let settled = false;
    if (!fundedRun.usage().complete || providerCompleted) {
      settled = await fundedRun.settle(failed === 0
        ? "provider_completed" : "resource_content_writer_partial_failure");
      if (!settled) fundingSettlementError = "provider_token_usage_missing";
    } else {
      await fundedRun.fail(providerFailureCode);
    }

    // Never apply generated content until all provider calls have known,
    // settled usage. The mutation still guards the current source revision.
    if (settled) {
      for (const draft of pendingDrafts) {
        try {
          const updated = await ctx.runMutation(
            (internal as any).communityWikiArchitect.patchCommunityResourceContentDraftInternal,
            {
              userId,
              communityId: args.communityId,
              pageId: draft.pageId,
              sourceResourceId: draft.sourceId,
              expectedUpdatedAt: draft.expectedUpdatedAt,
              expectedSourceRevisionHash: draft.expectedSourceRevisionHash,
              bodyMd: draft.bodyMd,
            },
          ) as { id?: string; title?: string; status?: string; source_resource_id?: string | null };
          drafted += 1;
          pages.push({
            id: String(updated?.id ?? draft.pageId),
            title: String(updated?.title ?? draft.title),
            status: String(updated?.status ?? "review"),
            source_resource_id: String(updated?.source_resource_id ?? draft.sourceId),
          });
        } catch (error) {
          failed += 1;
          failures.push({
            resource_id: draft.pageId,
            title: draft.title,
            message: error instanceof Error ? error.message : "community_resource_content_writer_failed",
          });
        }
      }
    }

    const usage = fundedRun.usage();
    const ok = failed === 0 && !fundingSettlementError;
    return {
      ok,
      kind: "community_resource_content_writer",
      candidates: candidates.length,
      drafted,
      failed,
      pages,
      failures,
      usage: {
        prompt_tokens: usage.promptTokens || null,
        completion_tokens: usage.completionTokens || null,
      },
      code: fundingSettlementError ?? (ok ? null : "resource_content_writer_failed"),
      message: ok
        ? drafted > 0
          ? "Resource drafts are ready for review."
          : "No source-linked draft pages needed content."
        : fundingSettlementError === "provider_token_usage_missing"
          ? "Resource generation usage could not be settled safely."
          : failures[0]?.message || "Could not draft resource content.",
    };
  },
});
