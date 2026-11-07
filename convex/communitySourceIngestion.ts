// Running source ingestion and saving crawled pages as source units.
import { internal } from "./_generated/api";
import {
  sha256HexText,
} from "./secretCrypto";
import {
  normalizeOptionalText,
} from "./communityCore";
import type {
  CommunitySourcePageResult,
  CommunitySourceUnitKind,
  CommunitySourceUnitResult,
} from "../shared/communitySourceCrawler";
import {
  buildCommunitySourceCrawlerUnitKey,
  communitySourceCrawlerUrlInRootScope,
  normalizeCommunitySourceUnitPath,
} from "../shared/communitySourceCrawler";
import {
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS,
  COMMUNITY_SOURCE_UNIT_MAX_BODY_CHARS,
  COMMUNITY_SOURCE_UNIT_MAX_PER_PAGE,
} from "./communityResourceConstants";
import {
  type CommunitySourceUnitLike,
  resolveAuthenticatedActionUserId,
} from "./communityResourceShared";
import {
  buildIngestedFileSourceBody,
  buildIngestedSourceBody,
  extractSourceTextFromFile,
  extractSourceTextFromUrl,
  maybeSafeSourceCrawlerUrl,
  normalizeCommunitySourceIngestionAttempt,
} from "./communitySourceFetch";

export async function runCommunitySourceIngestion(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
  limit?: number;
  retryFailed?: boolean;
}): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    const actingUserId = args.userId ?? await resolveAuthenticatedActionUserId(args.ctx, args.authSubject ?? null);
    const limit = Math.max(
      1,
      Math.min(
        COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS +
          COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES,
        Math.floor(
          args.limit ??
            COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS +
              COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES,
        ),
      ),
    );
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let lostClaims = 0;
    const claimedResourceIds: any[] = [];
    const failures: Array<{ resource_id: string; title: string; url: string | null; message: string }> = [];

    for (let iteration = 0; iteration < limit; iteration += 1) {
      const claimed = (await args.ctx.runMutation(
        (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
        {
          userId: actingUserId,
          authSubject: args.authSubject ?? undefined,
          communityId: args.communityId,
          retryFailed: args.retryFailed === true,
          excludeResourceIds: claimedResourceIds,
        },
      )) as any;
      const candidate = claimed?.claim;
      if (!candidate) break;
      processed += 1;
      claimedResourceIds.push(candidate.resourceId);
      const resourceId = String(candidate.resourceId ?? "").trim();
      const leaseId = String(candidate.leaseId ?? "").trim();
      const attempt = normalizeCommunitySourceIngestionAttempt(candidate.attempt);
      const url = String(candidate.url ?? "").trim();
      const fileKey = String(candidate.fileKey ?? "").trim();
      const title = String(candidate.title ?? "").trim();
      const ingestionKind = String(candidate.sourceIngestionKind ?? "").trim();
      const kind = ingestionKind === "file" || (!url && fileKey) ? "file" : "url";
      const invalidMessage =
        !resourceId
          ? "community_source_resource_not_found"
          : kind === "url" && !url
            ? "community_source_url_required"
            : kind === "file" && !fileKey
              ? "community_source_file_required"
              : null;
      const finalizeClaim = async (payload: Record<string, unknown>) => {
        return await args.ctx.runMutation(
          (internal as any).communityResources.finalizeCommunitySourceIngestionInternal,
          {
            resourceId,
            leaseId,
            attempt,
            kind,
            ...payload,
          },
        ) as any;
      };
      if (invalidMessage) {
        const finalized = resourceId
          ? await finalizeClaim({
              status: "failed",
              error: invalidMessage,
            })
          : null;
        if (finalized?.ok) {
          failed += 1;
          failures.push({
            resource_id: resourceId,
            title,
            url: url || null,
            message: invalidMessage,
          });
        } else {
          lostClaims += 1;
        }
        continue;
      }
      try {
        let finalized: any;
        if (kind === "file") {
          const extracted = await extractSourceTextFromFile({
            ctx: args.ctx,
            fileKey,
            filename: title,
          });
          const bodyMd = buildIngestedFileSourceBody({
            title: extracted.title,
            filename: title,
            contentType: extracted.contentType,
            text: extracted.text,
          });
          if (!bodyMd.trim()) throw new Error("community_source_file_no_readable_content");
          finalized = await finalizeClaim({
            status: "ready",
            bodyMd,
            error: null,
            sourceOriginalFilename: title || null,
            sourceOriginalMimeType: extracted.contentType || null,
            sourceOriginalBytes: extracted.bytes,
          });
        } else {
          const extracted = await extractSourceTextFromUrl(url);
          const bodyMd = buildIngestedSourceBody({
            title: extracted.title,
            url: extracted.finalUrl,
            text: extracted.text,
          });
          if (!bodyMd.trim()) throw new Error("community_source_url_no_readable_content");
          finalized = await finalizeClaim({
            status: "ready",
            bodyMd,
            url: extracted.finalUrl,
            error: null,
          });
        }
        if (finalized?.ok) {
          succeeded += 1;
        } else {
          lostClaims += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "community_source_ingestion_failed";
        const finalized = await finalizeClaim({
          status: "failed",
          error: message,
        });
        if (finalized?.ok) {
          failed += 1;
          failures.push({
            resource_id: resourceId,
            title,
            url: url || null,
            message,
          });
        } else {
          lostClaims += 1;
        }
      }
    }

    const after = (await args.ctx.runQuery(
      (internal as any).communityResources.getCommunitySourceIngestionStateInternal,
      {
        userId: actingUserId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
      },
    )) as any;
    const readySources = Number(after?.ready_sources ?? 0);
    const totalSources = Number(after?.total_sources ?? 0);
    const failedSources = Number(after?.failed_sources ?? 0);
    const remainingPendingSources = Number(after?.pending_sources ?? 0);
    const ok = readySources > 0 && failedSources === 0 && remainingPendingSources === 0;
    const code = ok
      ? null
      : failedSources > 0
        ? "source_ingestion_partial_failure"
        : remainingPendingSources > 0
          ? "source_ingestion_incomplete"
          : totalSources > 0
            ? "no_ready_sources"
            : "source_material_required";
    return {
      ok,
      kind: "community_source_ingestion",
      processed,
      succeeded,
      failed,
      failed_sources: failedSources,
      lost_claims: lostClaims,
      ready_sources: readySources,
      total_sources: totalSources,
      pending_url_sources: Number(after?.pending_url_sources ?? 0),
      pending_file_sources: Number(after?.pending_file_sources ?? 0),
      pending_sources: remainingPendingSources,
      failures,
      duration_ms: Date.now() - startedAt,
      code,
      message: ok
        ? "Source material is ready."
        : code === "source_ingestion_partial_failure"
          ? "Some source material could not be read. Review the failed sources and try again."
          : code === "source_ingestion_incomplete"
            ? "Source material is still being prepared. Try again after the remaining sources finish."
            : totalSources > 0
              ? "Source material could not be read yet. Check the source and try again."
              : "Add at least one source before curating resources.",
    };
}

function sourceUnitsForCrawlerPage(page: CommunitySourcePageResult): CommunitySourceUnitResult[] {
  const explicitUnits = Array.isArray(page.source_units)
    ? page.source_units.slice(0, COMMUNITY_SOURCE_UNIT_MAX_PER_PAGE)
    : [];
  if (explicitUnits.length > 0) return explicitUnits;
  return [{
    unit_key: null,
    unit_kind: "page",
    title: page.title,
    source_url: page.final_url,
    root_url: page.root_url,
    parent_url: page.parent_url,
    path: normalizeCommunitySourceUnitPath(page.title ?? page.final_url),
    order: Math.max(0, Math.floor(Number(page.depth) || 0)),
    depth: page.depth,
    markdown: page.markdown,
    status: page.status === "ready" ? "ready" : "failed",
    error: page.error,
    capture_method: "crawler_page",
  }];
}

export async function writeCommunitySourceUnitContent(ctx: any, args: {
  communityId: any;
  sourceUnitId: any;
  bodyMd: string;
  bodyChars: number;
  bodyHash: string;
  nowMs: number;
}): Promise<void> {
  const existing = (await ctx.db
    .query("communitySourceUnitContents" as any)
    .withIndex("by_source_unit", (q: any) => q.eq("sourceUnitId", args.sourceUnitId))
    .unique()) as { _id?: unknown } | null;
  if (existing?._id) {
    await ctx.db.patch(existing._id as any, {
      bodyMd: args.bodyMd,
      bodyChars: args.bodyChars,
      bodyHash: args.bodyHash,
      updatedAt: args.nowMs,
    });
    return;
  }
  await ctx.db.insert("communitySourceUnitContents" as any, {
    communityId: args.communityId,
    sourceUnitId: args.sourceUnitId,
    bodyMd: args.bodyMd,
    bodyChars: args.bodyChars,
    bodyHash: args.bodyHash,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

export async function saveCommunitySourceUnitsForPage(ctx: any, args: {
  crawlJobId: string;
  communityId: any;
  sourceResourceId: string;
  rootUrl: string;
  page: CommunitySourcePageResult;
  nowMs: number;
}): Promise<{ saved: number; skipped: number; failed: number }> {
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  for (const rawUnit of sourceUnitsForCrawlerPage(args.page)) {
    const rootUrl = maybeSafeSourceCrawlerUrl(rawUnit.root_url) ?? maybeSafeSourceCrawlerUrl(args.rootUrl);
    const sourceUrl = maybeSafeSourceCrawlerUrl(rawUnit.source_url) ?? maybeSafeSourceCrawlerUrl(args.page.final_url);
    if (!rootUrl || !sourceUrl) {
      failed += 1;
      continue;
    }
    if (!communitySourceCrawlerUrlInRootScope({
      rootUrl: args.rootUrl,
      candidateUrl: sourceUrl,
      normalizeUrl: maybeSafeSourceCrawlerUrl,
    })) {
      failed += 1;
      continue;
    }
    const bodyRaw = normalizeOptionalText(rawUnit.markdown, COMMUNITY_SOURCE_UNIT_MAX_BODY_CHARS + 1) ?? "";
    if (!bodyRaw.trim() || rawUnit.status === "failed") {
      failed += 1;
      continue;
    }
    if (rawUnit.status === "skipped") {
      skipped += 1;
      continue;
    }
    const bodyOriginalChars = bodyRaw.length;
    const bodyTruncated = bodyOriginalChars > COMMUNITY_SOURCE_UNIT_MAX_BODY_CHARS;
    const bodyMd = bodyRaw.slice(0, COMMUNITY_SOURCE_UNIT_MAX_BODY_CHARS);
    const bodyChars = bodyMd.length;
    const bodyHash = await sha256HexText(bodyMd);
    const unitKind: CommunitySourceUnitKind = rawUnit.unit_kind === "virtual_section" ? "virtual_section" : "page";
    const title = normalizeOptionalText(rawUnit.title, 240) ?? null;
    const path = normalizeOptionalText(rawUnit.path, 160) ?? normalizeCommunitySourceUnitPath(title);
    const rawOrder = Number(rawUnit.order);
    const order = Number.isFinite(rawOrder) ? Math.max(0, Math.floor(rawOrder)) : 0;
    const unitKey = normalizeOptionalText(rawUnit.unit_key, 700) ?? buildCommunitySourceCrawlerUnitKey({
      rootUrl,
      unitKind,
      sourceUrl,
      path,
      title,
      order,
      normalizeUrl: maybeSafeSourceCrawlerUrl,
    });
    if (!unitKey) {
      failed += 1;
      continue;
    }
    const existing = (await ctx.db
      .query("communitySourceUnits" as any)
      .withIndex("by_community_unit_key", (q: any) =>
        q.eq("communityId", args.communityId).eq("unitKey", unitKey),
      )
      .unique()) as CommunitySourceUnitLike | null;
    const status = rawUnit.status;
    const parentUrl = maybeSafeSourceCrawlerUrl(rawUnit.parent_url);
    const depthValue = Number(rawUnit.depth);
    const depth = Number.isFinite(depthValue) ? Math.max(0, Math.floor(depthValue)) : 0;
    const captureMethod = normalizeOptionalText(rawUnit.capture_method, 80) ?? undefined;
    const error = normalizeOptionalText(rawUnit.error, 500) ?? undefined;
    if (existing?._id) {
      await ctx.db.patch(existing._id as any, {
        crawlJobId: args.crawlJobId as any,
        sourceResourceId: args.sourceResourceId as any,
        rootUrl,
        unitKind,
        title: title ?? undefined,
        sourceUrl,
        parentUrl: parentUrl ?? undefined,
        path: path ?? undefined,
        order,
        depth,
        status,
        bodyChars,
        bodyOriginalChars,
        bodyHash,
        bodyTruncated,
        captureMethod,
        error,
        seenCount: Math.max(0, Math.floor(Number(existing.seenCount) || 0)) + 1,
        lastSeenAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      if (existing.bodyHash !== bodyHash) {
        await writeCommunitySourceUnitContent(ctx, {
          communityId: args.communityId,
          sourceUnitId: existing._id,
          bodyMd,
          bodyChars,
          bodyHash,
          nowMs: args.nowMs,
        });
        saved += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    const id = await ctx.db.insert("communitySourceUnits" as any, {
      communityId: args.communityId,
      crawlJobId: args.crawlJobId as any,
      sourceResourceId: args.sourceResourceId as any,
      rootUrl,
      unitKey,
      unitKind,
      title: title ?? undefined,
      sourceUrl,
      parentUrl: parentUrl ?? undefined,
      path: path ?? undefined,
      order,
      depth,
      status,
      bodyChars,
      bodyOriginalChars,
      bodyHash,
      bodyTruncated,
      captureMethod,
      error,
      seenCount: 1,
      lastSeenAt: args.nowMs,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    await writeCommunitySourceUnitContent(ctx, {
      communityId: args.communityId,
      sourceUnitId: id,
      bodyMd,
      bodyChars,
      bodyHash,
      nowMs: args.nowMs,
    });
    saved += 1;
  }
  return { saved, skipped, failed };
}

async function deleteCommunitySourceUnitContent(ctx: any, sourceUnitId: unknown): Promise<void> {
  const content = (await ctx.db
    .query("communitySourceUnitContents" as any)
    .withIndex("by_source_unit", (q: any) => q.eq("sourceUnitId", sourceUnitId))
    .unique()) as { _id?: unknown } | null;
  if (content?._id) await ctx.db.delete(content._id as any);
}

export async function deleteCommunitySourceUnitsForSourceResource(ctx: any, sourceResourceId: unknown): Promise<void> {
  const rows = (await ctx.db
    .query("communitySourceUnits" as any)
    .withIndex("by_source_resource", (q: any) => q.eq("sourceResourceId", sourceResourceId))
    .collect()) as CommunitySourceUnitLike[];
  for (const row of rows) {
    await deleteCommunitySourceUnitContent(ctx, row._id);
    if (row._id) await ctx.db.delete(row._id as any);
  }
}
