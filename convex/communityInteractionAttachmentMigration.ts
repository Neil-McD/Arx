import { paginationOptsValidator } from "convex/server";

import { internalQuery } from "./_generated/server";
import {
  MAX_LEGACY_INTERACTION_ATTACHMENTS,
  normalizeInteractionAttachmentInputs,
  readLegacyInteractionAttachmentPayloads,
} from "./communityInteractionAttachmentBridge";
import { normalizeIdValue, type CommunityChatMessageLike } from "./communityCore";

const MAX_AUDIT_PAGE_SIZE = 50;
const MAX_AUDIT_SAMPLES_PER_PAGE = 20;

export type LegacyAttachmentAuditClassification =
  | "missing_legacy_message"
  | "invalid_target_link"
  | "missing_canonical_target"
  | "community_mismatch"
  | "no_migratable_legacy_attachments"
  | "canonical_attachment_overflow"
  | "canonical_owned"
  | "blocked_by_non_uploaded_canonical_rows"
  | "pending_backfill";

export function classifyLegacyAttachmentAuditRow(args: {
  messageExists: boolean;
  hasValidTargetId: boolean;
  targetExists: boolean;
  targetCommunityMatches: boolean;
  migratableLegacyAttachmentCount: number;
  canonicalAttachmentCount: number;
  uploadedCanonicalAttachmentCount: number;
}): LegacyAttachmentAuditClassification {
  if (!args.messageExists) return "missing_legacy_message";
  if (!args.hasValidTargetId) return "invalid_target_link";
  if (!args.targetExists) return "missing_canonical_target";
  if (!args.targetCommunityMatches) return "community_mismatch";
  if (args.migratableLegacyAttachmentCount === 0) {
    return "no_migratable_legacy_attachments";
  }
  if (args.canonicalAttachmentCount > MAX_LEGACY_INTERACTION_ATTACHMENTS) {
    return "canonical_attachment_overflow";
  }
  if (args.uploadedCanonicalAttachmentCount > 0) return "canonical_owned";
  if (args.canonicalAttachmentCount > 0) {
    return "blocked_by_non_uploaded_canonical_rows";
  }
  return "pending_backfill";
}

function boundedPaginationOpts(args: { cursor: string | null; numItems: number }) {
  const numItems = Math.max(1, Math.min(MAX_AUDIT_PAGE_SIZE, Math.floor(args.numItems)));
  return {
    cursor: args.cursor,
    numItems,
    maximumRowsRead: numItems,
  };
}

function emptyStatusCounts(): Record<LegacyAttachmentAuditClassification, number> {
  return {
    missing_legacy_message: 0,
    invalid_target_link: 0,
    missing_canonical_target: 0,
    community_mismatch: 0,
    no_migratable_legacy_attachments: 0,
    canonical_attachment_overflow: 0,
    canonical_owned: 0,
    blocked_by_non_uploaded_canonical_rows: 0,
    pending_backfill: 0,
  };
}

export const inspectLegacyAttachmentStatePageInternal = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("communityInteractionLegacyChatLinks")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    const statusCounts = emptyStatusCounts();
    const samples: Array<{
      classification: LegacyAttachmentAuditClassification;
      link_id: string;
      message_id: string;
      target_type: "root" | "reply";
      target_id: string | null;
      legacy_payload_count: number;
      migratable_legacy_attachment_count: number;
      canonical_attachment_count: number;
      uploaded_canonical_attachment_count: number;
    }> = [];
    let linksWithLegacyPayloads = 0;
    let linksWithMigratableLegacyAttachments = 0;
    let legacyAttachmentOverflowTargets = 0;
    let rejectedLegacyPayloadItems = 0;

    for (const link of page.page) {
      const message = (await ctx.db.get(link.messageId)) as CommunityChatMessageLike | null;
      const rawLegacyAttachments = message
        ? readLegacyInteractionAttachmentPayloads(message)
        : [];
      const migratableLegacyAttachments = normalizeInteractionAttachmentInputs(rawLegacyAttachments);
      if (rawLegacyAttachments.length > 0) linksWithLegacyPayloads += 1;
      if (migratableLegacyAttachments.length > 0) {
        linksWithMigratableLegacyAttachments += 1;
      }
      if (rawLegacyAttachments.length > MAX_LEGACY_INTERACTION_ATTACHMENTS) {
        legacyAttachmentOverflowTargets += 1;
      }
      rejectedLegacyPayloadItems += Math.max(
        0,
        Math.min(rawLegacyAttachments.length, MAX_LEGACY_INTERACTION_ATTACHMENTS)
          - migratableLegacyAttachments.length,
      );

      const targetId = link.linkKind === "root" ? link.rootId : link.replyId;
      const hasValidTargetId = Boolean(targetId);
      const target = targetId ? await ctx.db.get(targetId as any) : null;
      const targetCommunityMatches = Boolean(
        target
        && normalizeIdValue((target as any).communityId) === normalizeIdValue(link.communityId),
      );
      const canonicalAttachments = targetId
        ? await ctx.db
            .query("communityInteractionAttachments" as any)
            .withIndex(
              link.linkKind === "root" ? "by_root" : "by_reply",
              (q: any) => q.eq(link.linkKind === "root" ? "rootId" : "replyId", targetId),
            )
            .take(MAX_LEGACY_INTERACTION_ATTACHMENTS + 1)
        : [];
      const uploadedCanonicalAttachmentCount = canonicalAttachments.filter(
        (row: any) => row?.status === "uploaded",
      ).length;
      const classification = classifyLegacyAttachmentAuditRow({
        messageExists: Boolean(message),
        hasValidTargetId,
        targetExists: Boolean(target),
        targetCommunityMatches,
        migratableLegacyAttachmentCount: migratableLegacyAttachments.length,
        canonicalAttachmentCount: canonicalAttachments.length,
        uploadedCanonicalAttachmentCount,
      });
      statusCounts[classification] += 1;
      if (
        samples.length < MAX_AUDIT_SAMPLES_PER_PAGE
        && classification !== "no_migratable_legacy_attachments"
        && classification !== "canonical_owned"
      ) {
        samples.push({
          classification,
          link_id: normalizeIdValue(link._id),
          message_id: normalizeIdValue(link.messageId),
          target_type: link.linkKind,
          target_id: targetId ? normalizeIdValue(targetId) : null,
          legacy_payload_count: rawLegacyAttachments.length,
          migratable_legacy_attachment_count: migratableLegacyAttachments.length,
          canonical_attachment_count: canonicalAttachments.length,
          uploaded_canonical_attachment_count: uploadedCanonicalAttachmentCount,
        });
      }
    }

    return {
      scanned_links: page.page.length,
      links_with_legacy_payloads: linksWithLegacyPayloads,
      links_with_migratable_legacy_attachments: linksWithMigratableLegacyAttachments,
      legacy_attachment_overflow_targets: legacyAttachmentOverflowTargets,
      rejected_legacy_payload_items: rejectedLegacyPayloadItems,
      status_counts: statusCounts,
      samples,
      continue_cursor: page.continueCursor,
      is_done: page.isDone,
    };
  },
});
