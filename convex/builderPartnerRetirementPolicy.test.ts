import { describe, expect, it } from "vitest";

import {
  evaluateLegacyBuilderPartnerRetirement,
  LEGACY_COMMUNITY_INFERENCE_CONTRACT_VERSION,
  LEGACY_COMMUNITY_INFERENCE_FUNDING_MODE,
  LEGACY_COMMUNITY_INFERENCE_STATUS,
  LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT,
  LEGACY_PARTNER_EXPECTED_COMMUNITY_DISTRIBUTION,
  LEGACY_PARTNER_EXPECTED_COUNT,
  LEGACY_PARTNER_GRANT_KEY,
  LEGACY_PARTNER_SOURCE_PROGRAM,
  LEGACY_PARTNER_TERMS_VERSION,
  type LegacyPartnerFinanceCounts,
} from "./builderPartnerRetirementPolicy";

const zeroFinance: LegacyPartnerFinanceCounts = {
  attributions: 0,
  commissions: 0,
  adjustments: 0,
  payoutBatches: 0,
  payoutTransfers: 0,
  payoutItems: 0,
};

const partners = Array.from({ length: LEGACY_PARTNER_EXPECTED_COUNT }, (_, index) => ({
  _id: `partner_${index}`,
  userId: `user_${index}`,
  status: "active",
  acceptedTermsVersion: LEGACY_PARTNER_TERMS_VERSION,
  acceptedTermsAt: 1_000 + index,
}));

const grants = partners.map((partner) => ({
  userId: partner.userId,
  grantKey: LEGACY_PARTNER_GRANT_KEY,
  sourceProgram: LEGACY_PARTNER_SOURCE_PROGRAM,
  sourceRecordId: String(partner._id),
  sourceStatus: "active",
  acceptedTermsVersion: LEGACY_PARTNER_TERMS_VERSION,
  acceptedTermsAt: partner.acceptedTermsAt,
}));

const ownedCommunities = LEGACY_PARTNER_EXPECTED_COMMUNITY_DISTRIBUTION.flatMap(
  (communityCount, partnerIndex) =>
    Array.from({ length: communityCount }, (_, communityIndex) => ({
      _id: `community_${partnerIndex}_${communityIndex}`,
      ownerId: partners[partnerIndex].userId,
    })),
);

const communityInferencePolicies = ownedCommunities.map((community) => {
  const partner = partners.find((row) => row.userId === community.ownerId);
  if (!partner) throw new Error("test_fixture_partner_missing");
  return {
    communityId: community._id,
    payerUserId: community.ownerId,
    fundingMode: LEGACY_COMMUNITY_INFERENCE_FUNDING_MODE,
    status: LEGACY_COMMUNITY_INFERENCE_STATUS,
    contractVersion: LEGACY_COMMUNITY_INFERENCE_CONTRACT_VERSION,
    sourceGrantKey: LEGACY_PARTNER_GRANT_KEY,
    sourceProgram: LEGACY_PARTNER_SOURCE_PROGRAM,
    sourcePartnerRecordId: partner._id,
  };
});

const legalAcceptedUserIds = new Set(partners.map((partner) => partner.userId));

type RetirementInput = Parameters<typeof evaluateLegacyBuilderPartnerRetirement>[0];

function evaluate(overrides: Partial<RetirementInput> = {}) {
  return evaluateLegacyBuilderPartnerRetirement({
    partners,
    grandfatherGrants: grants,
    ownedCommunities,
    communityInferencePolicies,
    legalAcceptedUserIds,
    financeCounts: zeroFinance,
    isTruncated: false,
    ...overrides,
  });
}

describe("Builder Partner v1 retirement policy", () => {
  it("requires capture while only the four source identities exist", () => {
    const result = evaluate({
      grandfatherGrants: [],
      communityInferencePolicies: [],
    });
    expect(result.retirementPhase).toBe("capture_required");
    expect(result.captureComplete).toBe(false);
    expect(result.readyForSourceDeletion).toBe(false);
  });

  it("permits source deletion only after exact four-person and eight-community capture", () => {
    const result = evaluate();
    expect(result.retirementPhase).toBe("ready_for_source_deletion");
    expect(result.captureComplete).toBe(true);
    expect(result.readyForSourceDeletion).toBe(true);
    expect(result.sourceDeletionComplete).toBe(false);
    expect(result.ownedCommunities.total).toBe(LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT);
    expect(result.ownedCommunities.distribution).toEqual([1, 2, 2, 3]);
  });

  it("blocks deletion until all eight community policies are captured", () => {
    const result = evaluate({
      communityInferencePolicies: communityInferencePolicies.slice(0, -1),
    });
    expect(result.communityInferencePolicies.missingPolicyCommunityCount).toBe(1);
    expect(result.captureComplete).toBe(false);
    expect(result.readyForSourceDeletion).toBe(false);
  });

  it("rejects community ownership distribution drift", () => {
    const driftedCommunities = ownedCommunities.map((community, index) =>
      index === 0 ? { ...community, ownerId: partners[3].userId } : community,
    );
    const result = evaluate({ ownedCommunities: driftedCommunities });
    expect(result.ownedCommunities.distribution).toEqual([0, 2, 2, 4]);
    expect(result.ownedCommunities.distributionMatches).toBe(false);
    expect(result.readyForSourceDeletion).toBe(false);
  });

  it("rejects mismatched community funding policy", () => {
    const mismatchedPolicies = communityInferencePolicies.map((policy, index) =>
      index === 0 ? { ...policy, status: "active" } : policy,
    );
    const result = evaluate({ communityInferencePolicies: mismatchedPolicies });
    expect(result.communityInferencePolicies.mismatchedCommunityPolicyCount).toBe(1);
    expect(result.readyForSourceDeletion).toBe(false);
  });

  it("rejects a payer that is not the community owner", () => {
    const mismatchedPolicies = communityInferencePolicies.map((policy, index) =>
      index === 0 ? { ...policy, payerUserId: partners[1].userId } : policy,
    );
    const result = evaluate({ communityInferencePolicies: mismatchedPolicies });
    expect(result.communityInferencePolicies.mismatchedCommunityPolicyCount).toBe(1);
    expect(result.readyForSourceDeletion).toBe(false);
  });

  it("rejects duplicated community funding policy", () => {
    const result = evaluate({
      communityInferencePolicies: [
        ...communityInferencePolicies,
        communityInferencePolicies[0],
      ],
    });
    expect(result.communityInferencePolicies.duplicateCommunityPolicyCount).toBe(1);
    expect(result.readyForSourceDeletion).toBe(false);
  });

  it("rejects policy rows outside the eight-community boundary", () => {
    const unexpectedPolicies = communityInferencePolicies.map((policy, index) =>
      index === 0 ? { ...policy, communityId: "community_unexpected" } : policy,
    );
    const result = evaluate({ communityInferencePolicies: unexpectedPolicies });
    expect(result.communityInferencePolicies.missingPolicyCommunityCount).toBe(1);
    expect(result.communityInferencePolicies.unexpectedPolicyCommunityCount).toBe(1);
    expect(result.readyForSourceDeletion).toBe(false);
  });

  it("blocks deletion if any financial row appears", () => {
    const result = evaluate({
      financeCounts: { ...zeroFinance, commissions: 1 },
    });
    expect(result.retirementPhase).toBe("blocked_by_financial_rows");
    expect(result.captureComplete).toBe(true);
    expect(result.migrationComplete).toBe(false);
    expect(result.readyForSourceDeletion).toBe(false);
  });

  it("blocks deletion on mismatched or duplicated grant evidence", () => {
    const mismatched = grants.map((grant, index) =>
      index === 0 ? { ...grant, sourceRecordId: grants[1].sourceRecordId } : grant,
    );
    const result = evaluate({ grandfatherGrants: mismatched });
    expect(result.grandfatherGrants.mismatchedGrantCount).toBe(1);
    expect(result.grandfatherGrants.duplicateSourceRecordIdCount).toBe(1);
    expect(result.readyForSourceDeletion).toBe(false);
  });

  it("proves the terminal state after source rows are deleted", () => {
    const result = evaluate({ partners: [] });
    expect(result.retirementPhase).toBe("source_deleted");
    expect(result.captureComplete).toBe(false);
    expect(result.readyForSourceDeletion).toBe(false);
    expect(result.sourceDeletionComplete).toBe(true);
    expect(result.migrationComplete).toBe(true);
  });

  it("rejects an incomplete terminal state", () => {
    const result = evaluate({
      partners: [],
      grandfatherGrants: grants.slice(0, 3),
    });
    expect(result.retirementPhase).toBe("invalid_terminal_state");
    expect(result.sourceDeletionComplete).toBe(false);
  });
});
