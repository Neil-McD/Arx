import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
} from "./communityCore";

function membership(
  overrides: Partial<CommunityMembershipLike> = {},
): CommunityMembershipLike {
  return {
    _id: "membership_1",
    communityId: "community_1",
    userId: "user_1",
    role: "member",
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("community membership authority", () => {
  test("only an explicitly active, unrevoked row grants membership", () => {
    const explicitActive = membership();
    const missingActive = membership();
    delete missingActive.active;

    expect(communityMembershipRowIsActive(explicitActive)).toBe(true);
    expect(communityMembershipRowIsActive(missingActive)).toBe(false);
    expect(communityMembershipRowIsActive(membership({ active: false }))).toBe(false);
    expect(communityMembershipRowIsActive(membership({ revokedAt: 0 }))).toBe(false);
    expect(communityMembershipRowIsActive(membership({ revokedAt: 100 }))).toBe(false);
    expect(communityMembershipRowIsActive(null)).toBe(false);
    expect(communityMembershipRowIsActive(undefined)).toBe(false);
  });

  test("schema and projections cannot restore missing-active compatibility", () => {
    const schema = read("schema.ts");
    const operatorDashboard = read("operatorDashboard.ts");
    const projectionFiles = [
      "communityAppMounts.ts",
      "communityRecipientCore.ts",
      "emailDigests.ts",
      "operatorIntelligence.ts",
      "userPlatformAppMounts.ts",
    ];

    expect(schema).toMatch(
      /communityMemberships: defineTable\(\{[\s\S]*?active: v\.boolean\(\)/,
    );
    expect(operatorDashboard).not.toContain("backfillCommunityMembershipActiveFlags");
    expect(operatorDashboard).not.toContain("community_membership_active_flags_backfill");

    for (const relativePath of projectionFiles) {
      const source = read(relativePath);
      expect(source).toContain("communityMembershipRowIsActive");
      expect(source).not.toMatch(/membership\.active\s*!==\s*false/);
      expect(source).not.toMatch(/membership\.active\s*===\s*false/);
      expect(source).not.toMatch(/row\.active\s*!==\s*false/);
    }
  });
});
