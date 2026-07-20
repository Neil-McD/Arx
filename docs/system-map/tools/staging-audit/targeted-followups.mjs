export default query({
  handler: async (ctx) => {
    const LIMIT = 1000;
    const load = async (table) => {
      const fetched = await ctx.db.query(table).take(LIMIT + 1);
      return { rows: fetched.slice(0, LIMIT), truncated: fetched.length > LIMIT };
    };
    const counts = (rows, read) => {
      const result = {};
      for (const row of rows) {
        const key = String(read(row) ?? "missing");
        result[key] = (result[key] ?? 0) + 1;
      }
      return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
    };
    const [users, communities, memberships, entitlements, partners, acceptances] = await Promise.all([
      load("users"), load("communities"), load("communityMemberships"), load("userEntitlements"),
      load("builderPartners"), load("legalAcceptances"),
    ]);
    const communityById = new Map(communities.rows.map((row) => [String(row._id), row]));
    const activeUsersByCommunity = new Map();
    let activeOwnerMembershipRows = 0;
    for (const row of memberships.rows) {
      if (row.active === false || typeof row.revokedAt === "number") continue;
      const community = communityById.get(String(row.communityId));
      if (community && String(community.ownerId) === String(row.userId)) {
        activeOwnerMembershipRows += 1;
        continue;
      }
      const key = String(row.communityId);
      const set = activeUsersByCommunity.get(key) ?? new Set();
      set.add(String(row.userId));
      activeUsersByCommunity.set(key, set);
    }
    const memberCountDeltas = [];
    let missingCachedCount = 0;
    for (const community of communities.rows) {
      const expected = 1 + (activeUsersByCommunity.get(String(community._id))?.size ?? 0);
      if (typeof community.activeMemberCount !== "number") missingCachedCount += 1;
      memberCountDeltas.push(Number(community.activeMemberCount ?? 0) - expected);
    }
    const entitlementByUser = new Map();
    for (const row of entitlements.rows) {
      const key = String(row.userId);
      entitlementByUser.set(key, (entitlementByUser.get(key) ?? 0) + 1);
    }
    const partnerTermsByVersion = counts(partners.rows, (row) => row.acceptedTermsVersion);
    const partnerTermAcceptances = acceptances.rows.filter((row) => row.documentKey === "builder_partner_terms");
    const acceptanceUserVersions = new Set(partnerTermAcceptances.map((row) => `${String(row.userId)}:${String(row.documentVersion)}`));
    const matchingPartnerLegalRows = partners.rows.filter((row) =>
      row.acceptedTermsVersion && acceptanceUserVersions.has(`${String(row.userId)}:${String(row.acceptedTermsVersion)}`),
    ).length;

    return {
      audit_version: "polynet_staging_targeted_followups:v1",
      generated_at_ms: Date.now(),
      limits: { rows_per_table: LIMIT, output_contains_identifiers_or_content: false },
      scans_complete: {
        users: !users.truncated,
        communities: !communities.truncated,
        memberships: !memberships.truncated,
        entitlements: !entitlements.truncated,
        builder_partners: !partners.truncated,
        legal_acceptances: !acceptances.truncated,
      },
      identity: {
        anonymous_rows: users.rows.filter((row) => String(row.authSubject ?? "").startsWith("anon:")).length,
        non_anonymous_rows: users.rows.filter((row) => !String(row.authSubject ?? "").startsWith("anon:")).length,
        rows_with_email: users.rows.filter((row) => String(row.email ?? "").trim()).length,
        rows_with_email_missing_normalized_email: users.rows.filter((row) => String(row.email ?? "").trim() && !String(row.normalizedEmail ?? "").trim()).length,
        rows_without_email_or_normalized_email: users.rows.filter((row) => !String(row.email ?? "").trim() && !String(row.normalizedEmail ?? "").trim()).length,
      },
      active_member_count: {
        active_owner_membership_rows: activeOwnerMembershipRows,
        communities_checked: communities.rows.length,
        communities_missing_cached_count: missingCachedCount,
        exact_match_communities: memberCountDeltas.filter((delta) => delta === 0).length,
        undercounted_communities: memberCountDeltas.filter((delta) => delta < 0).length,
        overcounted_communities: memberCountDeltas.filter((delta) => delta > 0).length,
        delta_counts: counts(memberCountDeltas, (delta) => delta),
      },
      entitlements: {
        users_with_multiple_rows: [...entitlementByUser.values()].filter((count) => count > 1).length,
        max_rows_for_one_user: entitlementByUser.size ? Math.max(...entitlementByUser.values()) : 0,
      },
      builder_partner_terms_lineage: {
        partner_rows: partners.rows.length,
        accepted_terms_version_counts: partnerTermsByVersion,
        standalone_builder_partner_legal_acceptance_rows: partnerTermAcceptances.length,
        partner_rows_with_matching_standalone_acceptance: matchingPartnerLegalRows,
      },
    };
  },
});
