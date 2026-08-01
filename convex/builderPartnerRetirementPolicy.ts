export const LEGACY_PARTNER_EXPECTED_COUNT = 4;
export const LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT = 8;
export const LEGACY_PARTNER_EXPECTED_COMMUNITY_DISTRIBUTION = [1, 2, 2, 3] as const;
export const LEGACY_PARTNER_GRANT_KEY = "future_partner_grandfather_v1";
export const LEGACY_PARTNER_SOURCE_PROGRAM = "builder_partner_v1";
export const LEGACY_PARTNER_TERMS_DOCUMENT_KEY = "builder_partner_terms";
export const LEGACY_PARTNER_TERMS_VERSION = "builder_partner_terms_v2";
export const LEGACY_COMMUNITY_INFERENCE_FUNDING_MODE = "owner_api_key";
export const LEGACY_COMMUNITY_INFERENCE_STATUS = "pending_credential";
export const LEGACY_COMMUNITY_INFERENCE_CONTRACT_VERSION = "community_inference_funding_v1";

export type LegacyPartnerSourceRow = {
  _id: unknown;
  userId: unknown;
  status: unknown;
  acceptedTermsVersion?: unknown;
  acceptedTermsAt?: unknown;
};

export type LegacyPartnerGrantRow = {
  userId: unknown;
  grantKey: unknown;
  sourceProgram: unknown;
  sourceRecordId: unknown;
  sourceStatus: unknown;
  acceptedTermsVersion: unknown;
  acceptedTermsAt: unknown;
};

export type LegacyPartnerOwnedCommunityRow = {
  _id: unknown;
  ownerId: unknown;
};

export type LegacyCommunityInferencePolicyRow = {
  communityId: unknown;
  payerUserId: unknown;
  fundingMode: unknown;
  status: unknown;
  contractVersion: unknown;
  sourceGrantKey: unknown;
  sourceProgram: unknown;
  sourcePartnerRecordId: unknown;
};

export type LegacyPartnerFinanceCounts = {
  attributions: number;
  commissions: number;
  adjustments: number;
  payoutBatches: number;
  payoutTransfers: number;
  payoutItems: number;
};

function hasCanonicalSourceTerms(row: LegacyPartnerSourceRow): boolean {
  return row.acceptedTermsVersion === LEGACY_PARTNER_TERMS_VERSION &&
    typeof row.acceptedTermsAt === "number" &&
    Number.isFinite(row.acceptedTermsAt);
}

function hasCanonicalGrantEvidence(row: LegacyPartnerGrantRow): boolean {
  return row.grantKey === LEGACY_PARTNER_GRANT_KEY &&
    row.sourceProgram === LEGACY_PARTNER_SOURCE_PROGRAM &&
    String(row.sourceRecordId ?? "").trim().length > 0 &&
    row.sourceStatus === "active" &&
    row.acceptedTermsVersion === LEGACY_PARTNER_TERMS_VERSION &&
    typeof row.acceptedTermsAt === "number" &&
    Number.isFinite(row.acceptedTermsAt);
}

function grantMatchesSource(
  grant: LegacyPartnerGrantRow,
  source: LegacyPartnerSourceRow,
): boolean {
  return hasCanonicalGrantEvidence(grant) &&
    grant.sourceRecordId === String(source._id) &&
    grant.acceptedTermsAt === source.acceptedTermsAt;
}

function duplicateCount(values: string[]): number {
  return values.length - new Set(values).size;
}

function sameNumberList(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasCanonicalCommunityInferencePolicy(row: LegacyCommunityInferencePolicyRow): boolean {
  return row.fundingMode === LEGACY_COMMUNITY_INFERENCE_FUNDING_MODE &&
    row.status === LEGACY_COMMUNITY_INFERENCE_STATUS &&
    row.contractVersion === LEGACY_COMMUNITY_INFERENCE_CONTRACT_VERSION &&
    row.sourceGrantKey === LEGACY_PARTNER_GRANT_KEY &&
    row.sourceProgram === LEGACY_PARTNER_SOURCE_PROGRAM &&
    String(row.sourcePartnerRecordId ?? "").trim().length > 0;
}

export function evaluateLegacyBuilderPartnerRetirement(args: {
  partners: LegacyPartnerSourceRow[];
  grandfatherGrants: LegacyPartnerGrantRow[];
  ownedCommunities: LegacyPartnerOwnedCommunityRow[];
  communityInferencePolicies: LegacyCommunityInferencePolicyRow[];
  legalAcceptedUserIds: ReadonlySet<string>;
  financeCounts: LegacyPartnerFinanceCounts;
  isTruncated: boolean;
}) {
  const activePartners = args.partners.filter((row) => row.status === "active");
  const nonActivePartners = args.partners.filter((row) => row.status !== "active");
  const partnerUserIds = activePartners.map((row) => String(row.userId));
  const grantUserIds = args.grandfatherGrants.map((row) => String(row.userId));
  const sourceRecordIds = args.grandfatherGrants.map((row) => String(row.sourceRecordId));
  const activePartnerUserIdSet = new Set(partnerUserIds);
  const grantUserIdSet = new Set(grantUserIds);
  const activePartnerByUserId = new Map(
    activePartners.map((row) => [String(row.userId), row]),
  );
  const grantByUserId = new Map(
    args.grandfatherGrants.map((row) => [String(row.userId), row]),
  );
  const relevantSourceUserIds = new Set(
    activePartners.length > 0 ? partnerUserIds : grantUserIds,
  );
  const ownedCommunityIds = args.ownedCommunities.map((row) => String(row._id));
  const ownedCommunityIdSet = new Set(ownedCommunityIds);
  const communityPolicyCommunityIds = args.communityInferencePolicies.map(
    (row) => String(row.communityId),
  );
  const communityPolicyCommunityIdSet = new Set(communityPolicyCommunityIds);

  const missingGrantUserCount = activePartners.filter(
    (row) => !grantUserIdSet.has(String(row.userId)),
  ).length;
  const unexpectedGrantUserCount = args.partners.length === 0
    ? 0
    : args.grandfatherGrants.filter(
        (row) => !activePartnerUserIdSet.has(String(row.userId)),
      ).length;
  const mismatchedGrantCount = args.grandfatherGrants.filter((grant) => {
    if (!hasCanonicalGrantEvidence(grant)) return true;
    if (args.partners.length === 0) return false;
    const source = activePartnerByUserId.get(String(grant.userId));
    return !source || !grantMatchesSource(grant, source);
  }).length;
  const sourceTermsEvidenceInvalidCount = activePartners.filter(
    (row) => !hasCanonicalSourceTerms(row),
  ).length;
  const relevantUserIds = new Set([...partnerUserIds, ...grantUserIds]);
  const missingLegalAcceptanceCount = [...relevantUserIds].filter(
    (userId) => !args.legalAcceptedUserIds.has(userId),
  ).length;
  const duplicateSourceUserCount = duplicateCount(partnerUserIds);
  const duplicateGrantUserCount = duplicateCount(grantUserIds);
  const duplicateSourceRecordIdCount = duplicateCount(sourceRecordIds);
  const duplicateOwnedCommunityCount = duplicateCount(ownedCommunityIds);
  const unexpectedOwnedCommunityOwnerCount = args.ownedCommunities.filter(
    (row) => !relevantSourceUserIds.has(String(row.ownerId)),
  ).length;
  const ownedCommunityCountByOwner = new Map<string, number>(
    [...relevantSourceUserIds].map((userId) => [userId, 0]),
  );
  for (const community of args.ownedCommunities) {
    const ownerId = String(community.ownerId);
    if (!ownedCommunityCountByOwner.has(ownerId)) continue;
    ownedCommunityCountByOwner.set(ownerId, (ownedCommunityCountByOwner.get(ownerId) ?? 0) + 1);
  }
  const ownedCommunityDistribution = [...ownedCommunityCountByOwner.values()].sort(
    (left, right) => left - right,
  );
  const ownedCommunityDistributionMatches = sameNumberList(
    ownedCommunityDistribution,
    LEGACY_PARTNER_EXPECTED_COMMUNITY_DISTRIBUTION,
  );
  const missingPolicyCommunityCount = args.ownedCommunities.filter(
    (row) => !communityPolicyCommunityIdSet.has(String(row._id)),
  ).length;
  const unexpectedPolicyCommunityCount = args.communityInferencePolicies.filter(
    (row) => !ownedCommunityIdSet.has(String(row.communityId)),
  ).length;
  const mismatchedCommunityPolicyCount = args.communityInferencePolicies.filter((policy) => {
    if (!hasCanonicalCommunityInferencePolicy(policy)) return true;
    const community = args.ownedCommunities.find(
      (row) => String(row._id) === String(policy.communityId),
    );
    if (!community || String(community.ownerId) !== String(policy.payerUserId)) return true;
    const sourcePartner = activePartnerByUserId.get(String(policy.payerUserId));
    const sourceGrant = grantByUserId.get(String(policy.payerUserId));
    const sourcePartnerRecordId = sourcePartner
      ? String(sourcePartner._id)
      : String(sourceGrant?.sourceRecordId ?? "");
    return !sourcePartnerRecordId || sourcePartnerRecordId !== String(policy.sourcePartnerRecordId);
  }).length;
  const duplicateCommunityPolicyCount = duplicateCount(communityPolicyCommunityIds);
  const financialRows = Object.values(args.financeCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  const captureComplete =
    !args.isTruncated &&
    args.partners.length === LEGACY_PARTNER_EXPECTED_COUNT &&
    activePartners.length === LEGACY_PARTNER_EXPECTED_COUNT &&
    nonActivePartners.length === 0 &&
    sourceTermsEvidenceInvalidCount === 0 &&
    duplicateSourceUserCount === 0 &&
    args.grandfatherGrants.length === LEGACY_PARTNER_EXPECTED_COUNT &&
    missingGrantUserCount === 0 &&
    unexpectedGrantUserCount === 0 &&
    mismatchedGrantCount === 0 &&
    duplicateGrantUserCount === 0 &&
    duplicateSourceRecordIdCount === 0 &&
    missingLegalAcceptanceCount === 0 &&
    args.ownedCommunities.length === LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT &&
    duplicateOwnedCommunityCount === 0 &&
    unexpectedOwnedCommunityOwnerCount === 0 &&
    ownedCommunityDistributionMatches &&
    args.communityInferencePolicies.length === LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT &&
    missingPolicyCommunityCount === 0 &&
    unexpectedPolicyCommunityCount === 0 &&
    mismatchedCommunityPolicyCount === 0 &&
    duplicateCommunityPolicyCount === 0;
  const readyForSourceDeletion = captureComplete && financialRows === 0;
  const sourceDeletionComplete =
    !args.isTruncated &&
    args.partners.length === 0 &&
    args.grandfatherGrants.length === LEGACY_PARTNER_EXPECTED_COUNT &&
    mismatchedGrantCount === 0 &&
    duplicateGrantUserCount === 0 &&
    duplicateSourceRecordIdCount === 0 &&
    missingLegalAcceptanceCount === 0 &&
    args.ownedCommunities.length === LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT &&
    duplicateOwnedCommunityCount === 0 &&
    unexpectedOwnedCommunityOwnerCount === 0 &&
    ownedCommunityDistributionMatches &&
    args.communityInferencePolicies.length === LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT &&
    missingPolicyCommunityCount === 0 &&
    unexpectedPolicyCommunityCount === 0 &&
    mismatchedCommunityPolicyCount === 0 &&
    duplicateCommunityPolicyCount === 0 &&
    financialRows === 0;
  const migrationComplete = readyForSourceDeletion || sourceDeletionComplete;
  const retirementPhase = sourceDeletionComplete
    ? "source_deleted"
    : readyForSourceDeletion
      ? "ready_for_source_deletion"
      : captureComplete && financialRows > 0
        ? "blocked_by_financial_rows"
        : args.partners.length === 0 && args.grandfatherGrants.length > 0
          ? "invalid_terminal_state"
          : "capture_required";

  return {
    partners: {
      total: args.partners.length,
      active: activePartners.length,
      nonActive: nonActivePartners.length,
      duplicateSourceUserCount,
      sourceTermsEvidenceInvalidCount,
    },
    grandfatherGrants: {
      expected: LEGACY_PARTNER_EXPECTED_COUNT,
      total: args.grandfatherGrants.length,
      missingGrantUserCount,
      unexpectedGrantUserCount,
      mismatchedGrantCount,
      duplicateGrantUserCount,
      duplicateSourceRecordIdCount,
      missingLegalAcceptanceCount,
    },
    ownedCommunities: {
      expected: LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT,
      total: args.ownedCommunities.length,
      distribution: ownedCommunityDistribution,
      expectedDistribution: [...LEGACY_PARTNER_EXPECTED_COMMUNITY_DISTRIBUTION],
      distributionMatches: ownedCommunityDistributionMatches,
      duplicateOwnedCommunityCount,
      unexpectedOwnerCount: unexpectedOwnedCommunityOwnerCount,
    },
    communityInferencePolicies: {
      expected: LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT,
      total: args.communityInferencePolicies.length,
      missingPolicyCommunityCount,
      unexpectedPolicyCommunityCount,
      mismatchedCommunityPolicyCount,
      duplicateCommunityPolicyCount,
    },
    financeCounts: args.financeCounts,
    financialRows,
    captureComplete,
    readyForSourceDeletion,
    sourceDeletionComplete,
    migrationComplete,
    retirementPhase,
    isTruncated: args.isTruncated,
  } as const;
}
