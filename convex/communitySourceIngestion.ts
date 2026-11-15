// Running source ingestion; removing the source units old crawls left.
import { internal } from "./_generated/api";
import {
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS,
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
