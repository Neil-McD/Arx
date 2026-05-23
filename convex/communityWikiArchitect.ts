import { action, internalQuery, mutation } from "./_generated/server";
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
  normalizeIdValue,
  normalizeName,
  normalizeOptionalText,
  normalizeResourceRole,
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

function resourceModuleIdentity(raw: unknown): string {
  const value = normalizeIdValue(raw ?? "");
  return value || "";
}

function buildModuleNameById(modules: CommunityResourceModuleLike[]): Map<string, string> {
  return new Map(modules.map((module) => [normalizeIdValue(module._id), String(module.name ?? "")]));
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
    const pages = allPages.slice(0, COMMUNITY_WIKI_ARCHITECT_MAX_CONTEXT_RESOURCES);
    const sources = allSources.slice(0, COMMUNITY_WIKI_ARCHITECT_MAX_CONTEXT_RESOURCES);
    const assignedPagesBySourceId = new Map<string, string[]>();
    for (const page of pages) {
      const sourceId = normalizeIdValue(page.sourceResourceId ?? "");
      if (!sourceId) continue;
      const rows = assignedPagesBySourceId.get(sourceId) ?? [];
      rows.push(normalizeIdValue(page._id));
      assignedPagesBySourceId.set(sourceId, rows);
    }

    const communityRow = community as CommunityLike;
    return {
      ok: true,
      kind: "community_wiki_architect_run_context",
      builder_intent: normalizeBuilderIntent(args.builderIntent),
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
        sources_visible: sources.length,
        sources_truncated: allSources.length > sources.length,
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
        source_inbox: sources.map((source) => ({
          id: normalizeIdValue(source._id),
          title: String(source.title ?? ""),
          type: String(source.type ?? ""),
          status: normalizeResourceStatus(source.status),
          url: String(source.url ?? "").trim() || null,
          length_chars: String(source.bodyMd ?? "").trim().length,
          assigned_pages: assignedPagesBySourceId.get(normalizeIdValue(source._id)) ?? [],
          created_at: toIsoString(source.createdAt),
          updated_at: toIsoString(source.updatedAt),
        })),
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

    const state = (context as any)?.current_resource_state ?? {};
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
    if (
      (Boolean(state.pages_truncated) || Boolean(state.sources_truncated)) &&
      (validation.value.drafts_created.length > 0 || validation.value.drafts_updated.length > 0)
    ) {
      return {
        ok: false,
        kind: "community_wiki_architect_proposal",
        code: "invalid_architect_output",
        message: "Wiki Architect cannot propose draft writes from a truncated resource window.",
        errors: [
          {
            path: "$.drafts_created",
            message: "Narrow builder intent before proposing draft writes.",
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
    const sources = resources.filter((row) => normalizeResourceRole(row.role) === "source");
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

    for (const moduleProposal of proposal.modules_created) {
      const normalizedName = normalizeCommunityResourceBuilderTitle(moduleProposal.name);
      if (moduleByName.has(normalizedName)) {
        throw new Error("community_wiki_architect_module_conflict");
      }
      const moduleId = await ctx.db.insert("communityResourceModules" as any, {
        communityId: args.communityId,
        createdByUserId: userId,
        name: normalizeName(moduleProposal.name),
        descriptionMd: normalizeOptionalText(moduleProposal.purpose, 1200) ?? null,
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
      pagesUpdated.push(updatedPage.title);
    }

    return {
      ok: true,
      kind: "community_wiki_architect_apply",
      summary: {
        modules_created: modulesCreated,
        pages_created: pagesCreated,
        pages_updated: pagesUpdated,
      },
      health: await buildCommunityResourceBuilderHealthReport({
        ctx,
        communityId: args.communityId,
        nowMs: Date.now(),
      }),
    };
  },
});
