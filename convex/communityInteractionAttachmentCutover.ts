import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import {
  insertCanonicalInteractionAttachmentsFromLegacyMessage,
  normalizeInteractionAttachmentInputs,
  readLegacyInteractionAttachmentPayloads,
} from "./communityInteractionAttachmentBridge";
import {
  type CommunityChatMessageLike,
  normalizeIdValue,
} from "./communityCore";

const EXPECTED_TARGET_COUNT = 4;
const MAX_LEGACY_MESSAGES = 200;
const MAX_CANONICAL_ATTACHMENTS = 8;

const expectedTargetValidator = v.object({
  messageId: v.id("communityChatMessages"),
  rootId: v.id("communityInteractionRoots"),
  storageId: v.id("_storage"),
});

type ExpectedTarget = {
  messageId: any;
  rootId: any;
  storageId: any;
};

function readDeploymentKind(): string {
  try {
    return String((globalThis as any)?.process?.env?.POLYNET_DEPLOYMENT_KIND ?? "").trim();
  } catch {
    return "";
  }
}

function requireStaging(): void {
  if (readDeploymentKind() !== "staging") {
    throw new Error("community_interaction_attachment_cutover_staging_only");
  }
}

function exactStringSetsMatch(actual: string[], expected: string[]): boolean {
  const sortedActual = [...actual].sort((left, right) => left.localeCompare(right));
  const sortedExpected = [...expected].sort((left, right) => left.localeCompare(right));
  return sortedActual.length === sortedExpected.length
    && sortedActual.every((value, index) => value === sortedExpected[index]);
}

function requireUniqueExpectedTargets(expectedTargets: ExpectedTarget[]): void {
  if (expectedTargets.length !== EXPECTED_TARGET_COUNT) {
    throw new Error("community_interaction_attachment_cutover_expected_target_count_changed");
  }
  for (const key of ["messageId", "rootId", "storageId"] as const) {
    const values = expectedTargets.map((target) => normalizeIdValue(target[key]));
    if (new Set(values).size !== values.length) {
      throw new Error(`community_interaction_attachment_cutover_duplicate_${key}`);
    }
  }
}

async function inspectExpectedTarget(args: {
  ctx: any;
  expected: ExpectedTarget;
  expectedCanonicalCount: number;
}) {
  const message = (await args.ctx.db.get(args.expected.messageId)) as CommunityChatMessageLike | null;
  if (!message) throw new Error("community_interaction_attachment_cutover_message_missing");

  const links = await args.ctx.db
    .query("communityInteractionLegacyChatLinks" as any)
    .withIndex("by_message", (q: any) => q.eq("messageId", args.expected.messageId))
    .take(2);
  if (links.length !== 1) {
    throw new Error("community_interaction_attachment_cutover_link_count_changed");
  }
  const link = links[0];
  if (
    link.linkKind !== "root"
    || normalizeIdValue(link.rootId) !== normalizeIdValue(args.expected.rootId)
    || link.replyId
  ) {
    throw new Error("community_interaction_attachment_cutover_link_target_changed");
  }

  const root = await args.ctx.db.get(args.expected.rootId);
  if (
    !root
    || normalizeIdValue(root.communityId) !== normalizeIdValue(link.communityId)
    || root.status !== "live"
    || root.visibilityScope !== "community"
  ) {
    throw new Error("community_interaction_attachment_cutover_root_changed");
  }

  const rawAttachments = readLegacyInteractionAttachmentPayloads(message);
  const attachments = normalizeInteractionAttachmentInputs(rawAttachments);
  if (rawAttachments.length !== 1 || attachments.length !== 1) {
    throw new Error("community_interaction_attachment_cutover_payload_changed");
  }
  const attachment = attachments[0];
  if (
    attachment.attachmentKind !== "image"
    || !attachment.storageId
    || normalizeIdValue(attachment.storageId) !== normalizeIdValue(args.expected.storageId)
  ) {
    throw new Error("community_interaction_attachment_cutover_storage_changed");
  }
  const storageMetadata = await args.ctx.db.system.get("_storage", args.expected.storageId);
  if (!storageMetadata) {
    throw new Error("community_interaction_attachment_cutover_storage_missing");
  }

  const canonicalRows = await args.ctx.db
    .query("communityInteractionAttachments" as any)
    .withIndex("by_root", (q: any) => q.eq("rootId", args.expected.rootId))
    .take(2);
  if (canonicalRows.length !== args.expectedCanonicalCount) {
    throw new Error("community_interaction_attachment_cutover_canonical_count_changed");
  }
  if (args.expectedCanonicalCount === 1) {
    const canonical = canonicalRows[0];
    const expectedContentHash = `legacy-chat:${normalizeIdValue(message._id)}:${attachment.id}`;
    if (
      normalizeIdValue(canonical.communityId) !== normalizeIdValue(root.communityId)
      || normalizeIdValue(canonical.rootId) !== normalizeIdValue(root._id)
      || canonical.replyId
      || canonical.status !== "uploaded"
      || canonical.attachmentKind !== attachment.attachmentKind
      || canonical.name !== attachment.name
      || canonical.mimeType !== attachment.mimeType
      || Number(canonical.sizeBytes) !== attachment.sizeBytes
      || normalizeIdValue(canonical.storageId) !== normalizeIdValue(args.expected.storageId)
      || canonical.externalUrl
      || canonical.contentHash !== expectedContentHash
      || normalizeIdValue(canonical.createdByUserId) !== normalizeIdValue(message.senderUserId)
      || Number(canonical.createdAt) !== Number(message.createdAt)
    ) {
      throw new Error("community_interaction_attachment_cutover_canonical_shape_changed");
    }
  }

  return {
    message,
    root,
    summary: {
      messageId: normalizeIdValue(message._id),
      rootId: normalizeIdValue(root._id),
      canonicalAttachmentCount: canonicalRows.length,
      storageMetadataExists: true,
    },
  };
}

async function inspectCutover(args: {
  ctx: any;
  expectedTargets: ExpectedTarget[];
  expectedCanonicalTotal: number;
}) {
  requireUniqueExpectedTargets(args.expectedTargets);
  if (
    args.expectedCanonicalTotal !== 0
    && args.expectedCanonicalTotal !== EXPECTED_TARGET_COUNT
  ) {
    throw new Error("community_interaction_attachment_cutover_expected_canonical_total_invalid");
  }
  const expectedCanonicalCount = args.expectedCanonicalTotal === 0 ? 0 : 1;

  const legacyMessages = await args.ctx.db
    .query("communityChatMessages" as any)
    .take(MAX_LEGACY_MESSAGES + 1);
  if (legacyMessages.length > MAX_LEGACY_MESSAGES) {
    throw new Error("community_interaction_attachment_cutover_legacy_scan_limit_exceeded");
  }
  const attachmentMessageIds = legacyMessages
    .filter((message: CommunityChatMessageLike) =>
      readLegacyInteractionAttachmentPayloads(message).length > 0)
    .map((message: CommunityChatMessageLike) => normalizeIdValue(message._id));
  const expectedMessageIds = args.expectedTargets.map((target) => normalizeIdValue(target.messageId));
  if (!exactStringSetsMatch(attachmentMessageIds, expectedMessageIds)) {
    throw new Error("community_interaction_attachment_cutover_message_set_changed");
  }

  const canonicalRows = await args.ctx.db
    .query("communityInteractionAttachments" as any)
    .take(MAX_CANONICAL_ATTACHMENTS + 1);
  if (canonicalRows.length > MAX_CANONICAL_ATTACHMENTS) {
    throw new Error("community_interaction_attachment_cutover_canonical_scan_limit_exceeded");
  }
  if (canonicalRows.length !== args.expectedCanonicalTotal) {
    throw new Error("community_interaction_attachment_cutover_canonical_total_changed");
  }

  const inspected = [];
  for (const expected of args.expectedTargets) {
    inspected.push(await inspectExpectedTarget({
      ctx: args.ctx,
      expected,
      expectedCanonicalCount,
    }));
  }
  return {
    inspected,
    summary: {
      legacyAttachmentMessageCount: attachmentMessageIds.length,
      canonicalAttachmentCount: canonicalRows.length,
      targets: inspected.map((row) => row.summary),
    },
  };
}

export const auditLegacyInteractionAttachmentCutoverInternal = internalQuery({
  args: {
    expectedTargets: v.array(expectedTargetValidator),
    expectedCanonicalTotal: v.number(),
  },
  handler: async (ctx, args) => {
    requireStaging();
    return (await inspectCutover({ ctx, ...args })).summary;
  },
});

export const migrateLegacyInteractionAttachmentsInternal = internalMutation({
  args: {
    dryRun: v.boolean(),
    expectedTargets: v.array(expectedTargetValidator),
    expectedCanonicalTotal: v.number(),
  },
  handler: async (ctx, args) => {
    requireStaging();
    const inspection = await inspectCutover({ ctx, ...args });
    if (args.dryRun || args.expectedCanonicalTotal === EXPECTED_TARGET_COUNT) {
      return {
        ...inspection.summary,
        dryRun: args.dryRun,
        createdCount: 0,
      };
    }

    let createdCount = 0;
    for (const row of inspection.inspected) {
      const createdIds = await insertCanonicalInteractionAttachmentsFromLegacyMessage({
        ctx,
        communityId: row.root.communityId,
        rootId: row.root._id,
        message: row.message,
        nowMs: Date.now(),
      });
      if (createdIds.length !== 1) {
        throw new Error("community_interaction_attachment_cutover_insert_count_changed");
      }
      createdCount += createdIds.length;
    }
    const postflight = await inspectCutover({
      ctx,
      expectedTargets: args.expectedTargets,
      expectedCanonicalTotal: EXPECTED_TARGET_COUNT,
    });
    return {
      ...postflight.summary,
      dryRun: false,
      createdCount,
    };
  },
});
