import { describe, expect, it } from "vitest";

import { classifyLegacyAttachmentAuditRow } from "./communityInteractionAttachmentMigration";

const COMPLETE_ROW = {
  messageExists: true,
  hasValidTargetId: true,
  targetExists: true,
  targetCommunityMatches: true,
  migratableLegacyAttachmentCount: 1,
  canonicalAttachmentCount: 1,
  uploadedCanonicalAttachmentCount: 1,
};

describe("classifyLegacyAttachmentAuditRow", () => {
  it("separates broken linkage from attachment migration work", () => {
    expect(classifyLegacyAttachmentAuditRow({ ...COMPLETE_ROW, messageExists: false }))
      .toBe("missing_legacy_message");
    expect(classifyLegacyAttachmentAuditRow({ ...COMPLETE_ROW, hasValidTargetId: false }))
      .toBe("invalid_target_link");
    expect(classifyLegacyAttachmentAuditRow({ ...COMPLETE_ROW, targetExists: false }))
      .toBe("missing_canonical_target");
    expect(classifyLegacyAttachmentAuditRow({ ...COMPLETE_ROW, targetCommunityMatches: false }))
      .toBe("community_mismatch");
  });

  it("identifies exactly which targets still depend on legacy fallback", () => {
    expect(classifyLegacyAttachmentAuditRow(COMPLETE_ROW)).toBe("canonical_owned");
    expect(classifyLegacyAttachmentAuditRow({
      ...COMPLETE_ROW,
      migratableLegacyAttachmentCount: 0,
      canonicalAttachmentCount: 0,
      uploadedCanonicalAttachmentCount: 0,
    })).toBe("no_migratable_legacy_attachments");
    expect(classifyLegacyAttachmentAuditRow({
      ...COMPLETE_ROW,
      canonicalAttachmentCount: 0,
      uploadedCanonicalAttachmentCount: 0,
    })).toBe("pending_backfill");
    expect(classifyLegacyAttachmentAuditRow({
      ...COMPLETE_ROW,
      canonicalAttachmentCount: 1,
      uploadedCanonicalAttachmentCount: 0,
    })).toBe("blocked_by_non_uploaded_canonical_rows");
    expect(classifyLegacyAttachmentAuditRow({
      ...COMPLETE_ROW,
      canonicalAttachmentCount: 9,
      uploadedCanonicalAttachmentCount: 9,
    })).toBe("canonical_attachment_overflow");
  });
});
