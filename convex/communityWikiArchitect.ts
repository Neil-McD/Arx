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
import {
  upsertArchiveDocumentForResource,
} from "./communityArchiveDocuments";
import {
  buildCommunityResourceBuilderHealthReport,
} from "./communityResources";

const COMMUNITY_WIKI_ARCHITECT_MAX_CONTEXT_RESOURCES = 500;
const COMMUNITY_WIKI_ARCHITECT_MAX_OUTPUT_TOKENS = 3600;
const COMMUNITY_WIKI_ARCHITECT_MAX_VISIBLE_SOURCE_CARDS = 80;
const COMMUNITY_WIKI_ARCHITECT_SOURCE_WINDOW_BUDGET_CHARS = 40_000;
const COMMUNITY_WIKI_ARCHITECT_SOURCE_CARD_EXCERPT_CHARS = 600;
const COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_PAGES = 8;
const COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_OUTPUT_TOKENS = 4200;
const COMMUNITY_RESOURCE_CONTENT_WRITER_SOURCE_CHARS = 12_000;
const COMMUNITY_RESOURCE_CONTENT_WRITER_BODY_CHARS = 20_000;

const COMMUNITY_RESOURCE_CONTENT_WRITER_PROMPT = `You are the Resource Drafter for a PolyNet community.

Write ONE useful draft resource page from ONE ready source-inbox item.

Rules:
- Use only the provided source text and community context.
- Do not invent facts, steps, names, links, claims, or numbers.
- Write for a community member who needs to understand and act.
- Keep the page concise, structured, and review-ready.
- If the source is thin or unclear, say what is known and add a short "Needs review" section.
- Do not publish. This is a human-review draft.

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
}): Record<string, unknown> {
  const source = args.source;
  const externalUrl = String(source.sourceExternalUrl ?? "").trim();
  const url = String(source.url ?? "").trim() || externalUrl || null;
  const provider =
    String(source.sourceExternalProvider ?? "").trim() ||
    String(source.sourceIngestionKind ?? "").trim() ||
    null;

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
    length_chars: String(source.bodyMd ?? "").trim().length,
    excerpt: buildSourceExcerpt(source.bodyMd),
    assigned_pages: args.assignedPages,
    created_at: toIsoString(source.createdAt),
    updated_at: toIsoString(source.updatedAt),
  };
}

function buildArchitectSourceWindow(args: {
  readySources: CommunityResourceLike[];
  assignedPagesBySourceId: Map<string, string[]>;
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
    sourcesOmitted: Math.max(0, args.readySources.length - sourceCards.length),
    budgetChars: COMMUNITY_WIKI_ARCHITECT_SOURCE_WINDOW_BUDGET_CHARS,
    usedChars,
  };
}

type AppliedSourceBackedPage = {
  page: CommunityResourceLike;
  source: CommunityResourceLike;
};

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

function buildAppliedDraftScaffoldBody(args: {
  title: string;
  purpose: string;
  hasSource: boolean;
}): string {
  return [
    `# ${String(args.title ?? "").trim()}`,
    "",
    "> Draft scaffold. This page is not published yet.",
    "",
    `Purpose: ${String(args.purpose ?? "").trim()}`,
    "",
    args.hasSource
      ? "Source: linked source-inbox item. The page body still needs drafting from that source."
      : "Source: scaffold-only page. Add source material later if this page needs deeper detail.",
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

function normalizeOpenAiResponsesModelId(raw: string): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith("openai/")) {
    const stripped = value.slice("openai/".length).trim();
    return stripped || null;
  }
  if (value.includes("/")) return null;
  return value;
}

function resolveWikiArchitectModelId(): { ok: true; modelId: string } | {
  ok: false;
  code: string;
  message: string;
} {
  const explicit = readEnv("ARX_COMMUNITY_WIKI_ARCHITECT_MODEL");
  if (explicit) {
    const modelId = normalizeOpenAiResponsesModelId(explicit);
    if (modelId) return { ok: true, modelId };
    return {
      ok: false,
      code: "provider_inference_misconfigured",
      message: "ARX_COMMUNITY_WIKI_ARCHITECT_MODEL must be an OpenAI Responses model id.",
    };
  }

  const shared = readEnv("ARX_OPENAI_MODEL");
  if (shared) {
    const modelId = normalizeOpenAiResponsesModelId(shared);
    if (modelId) return { ok: true, modelId };
  }

  return {
    ok: false,
    code: "provider_inference_misconfigured",
    message: "Set ARX_COMMUNITY_WIKI_ARCHITECT_MODEL to an OpenAI Responses model id.",
  };
}

function resolveResourceContentWriterModelId(): { ok: true; modelId: string } | {
  ok: false;
  code: string;
  message: string;
} {
  const explicit = readEnv("ARX_COMMUNITY_RESOURCE_CONTENT_WRITER_MODEL");
  if (explicit) {
    const modelId = normalizeOpenAiResponsesModelId(explicit);
    if (modelId) return { ok: true, modelId };
    return {
      ok: false,
      code: "provider_inference_misconfigured",
      message: "ARX_COMMUNITY_RESOURCE_CONTENT_WRITER_MODEL must be an OpenAI Responses model id.",
    };
  }

  return resolveWikiArchitectModelId();
}

function normalizeBuilderIntent(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return value.slice(0, 2_000);
}

function extractResponseText(payload: Record<string, any>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const outputItems = Array.isArray(payload.output) ? payload.output : [];
  let text = "";
  for (const item of outputItems) {
    if (!item || typeof item !== "object" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "output_text" && typeof part.text === "string") text += part.text;
    }
  }
  return text.trim();
}

function parseTokenUsage(payload: Record<string, any>): {
  promptTokens: number | null;
  completionTokens: number | null;
} {
  const usage = payload?.usage && typeof payload.usage === "object" ? payload.usage : null;
  const promptTokens = Number(usage?.input_tokens ?? usage?.prompt_tokens);
  const completionTokens = Number(usage?.output_tokens ?? usage?.completion_tokens);
  return {
    promptTokens: Number.isFinite(promptTokens) ? Math.floor(promptTokens) : null,
    completionTokens: Number.isFinite(completionTokens) ? Math.floor(completionTokens) : null,
  };
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

async function runWikiArchitectModel(params: {
  input: Record<string, unknown>;
}): Promise<
  | {
      ok: true;
      outputText: string;
      modelId: string;
      resolvedModelId: string | null;
      promptTokens: number | null;
      completionTokens: number | null;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      outputPreview?: string;
    }
> {
  const apiKey = readEnv("OPENAI_API_KEY") || readEnv("ARX_OPENAI_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      code: "provider_inference_misconfigured",
      message: "OPENAI_API_KEY is not configured.",
    };
  }
  const modelResolution = resolveWikiArchitectModelId();
  if (!modelResolution.ok) {
    return {
      ok: false,
      status: 503,
      code: modelResolution.code,
      message: modelResolution.message,
    };
  }
  const { modelId } = modelResolution;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        store: false,
        instructions: COMMUNITY_WIKI_ARCHITECT_PROMPT,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(params.input, null, 2),
              },
            ],
          },
        ],
        max_output_tokens: COMMUNITY_WIKI_ARCHITECT_MAX_OUTPUT_TOKENS,
      }),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      code: "provider_inference_unavailable",
      message: "OpenAI inference is temporarily unavailable.",
    };
  }

  const raw = await response.text();
  let parsed: Record<string, any> | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, any>) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const message =
      (typeof parsed?.error?.message === "string" && parsed.error.message.trim()) ||
      `OpenAI error (${response.status})`;
    return {
      ok: false,
      status: response.status,
      code:
        response.status === 401 || response.status === 403
          ? "provider_inference_misconfigured"
          : response.status === 429
            ? "rate_limited"
            : "provider_inference_error",
      message,
      outputPreview: raw.slice(0, 1200),
    };
  }
  if (!parsed) {
    return {
      ok: false,
      status: 502,
      code: "provider_inference_error",
      message: "OpenAI returned invalid JSON.",
      outputPreview: raw.slice(0, 1200),
    };
  }
  const usage = parseTokenUsage(parsed);
  return {
    ok: true,
    outputText: extractResponseText(parsed),
    modelId,
    resolvedModelId:
      (typeof parsed.model === "string" && parsed.model.trim()) ||
      (typeof parsed.response?.model === "string" && parsed.response.model.trim()) ||
      null,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  };
}

async function runResourceContentWriterModel(params: {
  input: Record<string, unknown>;
}): Promise<
  | {
      ok: true;
      outputText: string;
      modelId: string;
      resolvedModelId: string | null;
      promptTokens: number | null;
      completionTokens: number | null;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      outputPreview?: string;
    }
> {
  const apiKey = readEnv("OPENAI_API_KEY") || readEnv("ARX_OPENAI_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      code: "provider_inference_misconfigured",
      message: "OPENAI_API_KEY is not configured.",
    };
  }
  const modelResolution = resolveResourceContentWriterModelId();
  if (!modelResolution.ok) {
    return {
      ok: false,
      status: 503,
      code: modelResolution.code,
      message: modelResolution.message,
    };
  }
  const { modelId } = modelResolution;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        store: false,
        instructions: COMMUNITY_RESOURCE_CONTENT_WRITER_PROMPT,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(params.input, null, 2),
              },
            ],
          },
        ],
        max_output_tokens: COMMUNITY_RESOURCE_CONTENT_WRITER_MAX_OUTPUT_TOKENS,
      }),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      code: "provider_inference_unavailable",
      message: "OpenAI inference is temporarily unavailable.",
    };
  }

  const raw = await response.text();
  let parsed: Record<string, any> | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, any>) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const message =
      (typeof parsed?.error?.message === "string" && parsed.error.message.trim()) ||
      `OpenAI error (${response.status})`;
    return {
      ok: false,
      status: response.status,
      code:
        response.status === 401 || response.status === 403
          ? "provider_inference_misconfigured"
          : response.status === 429
            ? "rate_limited"
            : "provider_inference_error",
      message,
      outputPreview: raw.slice(0, 1200),
    };
  }
  if (!parsed) {
    return {
      ok: false,
      status: 502,
      code: "provider_inference_error",
      message: "OpenAI returned invalid JSON.",
      outputPreview: raw.slice(0, 1200),
    };
  }
  const usage = parseTokenUsage(parsed);
  return {
    ok: true,
    outputText: extractResponseText(parsed),
    modelId,
    resolvedModelId:
      (typeof parsed.model === "string" && parsed.model.trim()) ||
      (typeof parsed.response?.model === "string" && parsed.response.model.trim()) ||
      null,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  };
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
    const readySources = allSources.filter(communityResourceSourceHasReadyText);
    const pages = allPages.slice(0, COMMUNITY_WIKI_ARCHITECT_MAX_CONTEXT_RESOURCES);
    const assignedPagesBySourceId = new Map<string, string[]>();
    for (const page of pages) {
      const sourceId = normalizeIdValue(page.sourceResourceId ?? "");
      if (!sourceId) continue;
      const rows = assignedPagesBySourceId.get(sourceId) ?? [];
      rows.push(normalizeIdValue(page._id));
      assignedPagesBySourceId.set(sourceId, rows);
    }
    const builderIntent = normalizeBuilderIntent(args.builderIntent);
    const sourceWindow = buildArchitectSourceWindow({
      readySources,
      assignedPagesBySourceId,
      builderIntent,
    });

    const communityRow = community as CommunityLike;
    return {
      ok: true,
      kind: "community_wiki_architect_run_context",
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
        ready_sources_total: readySources.length,
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
          body_chars: String(page.bodyMd ?? "").trim().length,
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
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const context: any = await ctx.runQuery(
      (internal as any).communityWikiArchitect.buildCommunityWikiArchitectRunContextInternal,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? null,
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

    const completion = await runWikiArchitectModel({
      input: context as Record<string, unknown>,
    });
    if (!completion.ok) {
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: completion.code,
        message: completion.message,
        output_preview: completion.outputPreview ?? null,
      };
    }

    let parsedProposal: unknown;
    try {
      parsedProposal = extractJsonObject(completion.outputText);
    } catch (error) {
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: "invalid_architect_output",
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

export const applyCommunityWikiArchitectProposal: any = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    proposal: v.any(),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });

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
      await upsertArchiveDocumentForResource(ctx, updatedSource);
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
        bodyMd: normalizeOptionalText(
          buildAppliedDraftScaffoldBody({
            title: draft.title,
            purpose: draft.purpose,
            hasSource: Boolean(source),
          }),
          20_000,
        ),
        pinned: false,
        sortOrder,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const createdPage = (await ctx.db.get(resourceId as any)) as CommunityResourceLike | null;
      if (!createdPage) throw new Error("community_wiki_architect_page_create_failed");
      await upsertArchiveDocumentForResource(ctx, createdPage);
      await patchSourceModuleIfNeeded(source, module._id);
      if (source && draft.source_resource_id) {
        sourceBackedPages.push({
          page: createdPage,
          source: sourceById.get(draft.source_resource_id) ?? source,
        });
      }
      pageKeys.add(pageKey);
      pagesCreated.push(`${module.name}/${createdPage.title}`);
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
      await upsertArchiveDocumentForResource(ctx, updatedPage);
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
    const readySourceById = new Map(
      resources
        .filter(communityResourceSourceHasReadyText)
        .map((source) => [normalizeIdValue(source._id), source]),
    );
    const pages = resources
      .filter((page) =>
        normalizeResourceRole(page.role) === "page" &&
        normalizeResourceStatus(page.status) === "draft" &&
        Boolean(normalizeIdValue(page.sourceResourceId ?? "")) &&
        isResourceDraftScaffoldBody(page.bodyMd),
      )
      .slice()
      .sort((left, right) => left.updatedAt - right.updatedAt || left.createdAt - right.createdAt);
    const candidates = pages
      .map((page) => {
        const sourceId = normalizeIdValue(page.sourceResourceId ?? "");
        const source = readySourceById.get(sourceId) ?? null;
        if (!source) return null;
        return {
          page_id: normalizeIdValue(page._id),
          page_title: String(page.title ?? ""),
          page_module: moduleNameById.get(normalizeIdValue(page.moduleId ?? "")) ?? null,
          expected_updated_at: Number(page.updatedAt),
          source_resource_id: sourceId,
          source_title: String(source.title ?? ""),
          source_url: String(source.url ?? (source as any).sourceExternalUrl ?? "").trim() || null,
          source_ingestion_status: normalizeResourceSourceIngestionStatus(source),
          source_body_md: truncateContentWriterSource(source.bodyMd),
        };
      })
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
    bodyMd: v.string(),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const [page, source] = await Promise.all([
      ctx.db.get(args.pageId as any) as Promise<CommunityResourceLike | null>,
      ctx.db.get(args.sourceResourceId as any) as Promise<CommunityResourceLike | null>,
    ]);
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
    const bodyMd = normalizeOptionalText(args.bodyMd, COMMUNITY_RESOURCE_CONTENT_WRITER_BODY_CHARS);
    if (!bodyMd || isResourceDraftScaffoldBody(bodyMd)) {
      throw new Error("community_resource_content_writer_body_invalid");
    }
    const nowMs = Date.now();
    await ctx.db.patch(page._id as any, {
      bodyMd,
      status: "review",
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(page._id as any)) as CommunityResourceLike | null;
    if (!updated) throw new Error("community_resource_content_writer_page_not_found");
    await upsertArchiveDocumentForResource(ctx, updated);
    return {
      id: normalizeIdValue(updated._id),
      title: String(updated.title ?? ""),
      status: normalizeResourceStatus(updated.status),
      source_resource_id: normalizeIdValue(updated.sourceResourceId ?? "") || null,
    };
  },
});

export const draftCommunityResourceContentFromSources: any = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const context: any = await ctx.runQuery(
      (internal as any).communityWikiArchitect.buildCommunityResourceContentWriterRunContextInternal,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? null,
        communityId: args.communityId,
        limit: args.limit,
      },
    );
    const candidates = Array.isArray(context?.candidates) ? context.candidates : [];
    const userId = context?.user_id;
    let drafted = 0;
    let failed = 0;
    const pages: Array<{ id: string; title: string; status: string; source_resource_id: string | null }> = [];
    const failures: Array<{ resource_id: string; title: string; message: string }> = [];
    let promptTokens = 0;
    let completionTokens = 0;

    for (const candidate of candidates) {
      const pageId = String(candidate.page_id ?? "").trim();
      const sourceId = String(candidate.source_resource_id ?? "").trim();
      const title = String(candidate.page_title ?? "").trim();
      try {
        if (!pageId || !sourceId || !userId) {
          throw new Error("community_resource_content_writer_candidate_invalid");
        }
        const completion = await runResourceContentWriterModel({
          input: {
            community: context.community,
            page: {
              id: pageId,
              title,
              module: candidate.page_module ?? null,
            },
            source: {
              id: sourceId,
              title: candidate.source_title,
              url: candidate.source_url ?? null,
              body_md: candidate.source_body_md,
            },
          },
        });
        if (!completion.ok) {
          throw new Error(completion.message);
        }
        if (typeof completion.promptTokens === "number") promptTokens += completion.promptTokens;
        if (typeof completion.completionTokens === "number") completionTokens += completion.completionTokens;
        const generatedBody = parseResourceContentWriterBody(completion.outputText);
        const bodyMd = buildReviewReadyResourceBody({
          pageTitle: title,
          generatedBody,
          source: {
            _id: sourceId,
            title: candidate.source_title,
            url: candidate.source_url ?? null,
          } as unknown as CommunityResourceLike,
        });
        const updated = await ctx.runMutation(
          (internal as any).communityWikiArchitect.patchCommunityResourceContentDraftInternal,
          {
            userId,
            communityId: args.communityId,
            pageId,
            sourceResourceId: sourceId,
            expectedUpdatedAt: Number(candidate.expected_updated_at),
            bodyMd,
          },
        ) as { id?: string; title?: string; status?: string; source_resource_id?: string | null };
        drafted += 1;
        pages.push({
          id: String(updated?.id ?? pageId),
          title: String(updated?.title ?? title),
          status: String(updated?.status ?? "review"),
          source_resource_id: String(updated?.source_resource_id ?? sourceId),
        });
      } catch (error) {
        failed += 1;
        failures.push({
          resource_id: pageId,
          title,
          message: error instanceof Error ? error.message : "community_resource_content_writer_failed",
        });
      }
    }

    const ok = failed === 0;
    return {
      ok,
      kind: "community_resource_content_writer",
      candidates: candidates.length,
      drafted,
      failed,
      pages,
      failures,
      usage: {
        prompt_tokens: promptTokens || null,
        completion_tokens: completionTokens || null,
      },
      code: ok ? null : "resource_content_writer_failed",
      message: ok
        ? drafted > 0
          ? "Resource drafts are ready for review."
          : "No source-linked draft pages needed content."
        : failures[0]?.message || "Could not draft resource content.",
    };
  },
});
