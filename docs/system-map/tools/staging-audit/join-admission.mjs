export default query({
  handler: async (ctx) => {
    const LIMIT = 1000;
    const requestRows = await ctx.db.query("communityJoinRequests").take(LIMIT + 1);
    const membershipRows = await ctx.db.query("communityMemberships").take(LIMIT + 1);
    const requests = requestRows.slice(0, LIMIT);
    const memberships = membershipRows.slice(0, LIMIT);
    const counts = (values) => {
      const result = {};
      for (const value of values) result[value] = (result[value] ?? 0) + 1;
      return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
    };

    const requestPairCounts = new Map();
    for (const row of requests) {
      const key = `${String(row.communityId)}:${String(row.userId)}`;
      requestPairCounts.set(key, (requestPairCounts.get(key) ?? 0) + 1);
    }
    let ownerRequestRows = 0;
    let missingReferenceRequestRows = 0;
    let membershipPairNotUniqueRequestRows = 0;
    let activeMembershipWithRequestRows = 0;
    for (const row of requests) {
      const community = await ctx.db.get(row.communityId);
      const user = await ctx.db.get(row.userId);
      if (!community || !user) missingReferenceRequestRows += 1;
      if (community && String(community.ownerId) === String(row.userId)) {
        ownerRequestRows += 1;
      }
      const pairMemberships = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", row.communityId).eq("userId", row.userId),
        )
        .take(2);
      if (pairMemberships.length > 1) membershipPairNotUniqueRequestRows += 1;
      if (
        pairMemberships.some(
          (membership) =>
            membership.active === true && typeof membership.revokedAt !== "number",
        )
      ) {
        activeMembershipWithRequestRows += 1;
      }
    }
    const knownRevokedReasons = new Set([
      "left_by_member",
      "removed_by_manager",
      "removed_by_manager_stripe_canceled",
      "banned_by_manager",
      "banned_by_manager_stripe_canceled",
    ]);

    return {
      audit_version: "join_admission_authority:v3",
      output_contains_identifiers: false,
      scans: {
        requests: { scanned: requests.length, truncated: requestRows.length > LIMIT },
        memberships: { scanned: memberships.length, truncated: membershipRows.length > LIMIT },
      },
      request_status_counts: counts(
        requests.map((row) => String(row.status ?? "missing").trim().toLowerCase() || "missing"),
      ),
      duplicate_request_pairs: [...requestPairCounts.values()].filter((count) => count > 1).length,
      max_request_rows_per_pair: requestPairCounts.size
        ? Math.max(...requestPairCounts.values())
        : 0,
      invalid_request_status_rows: requests.filter(
        (row) => row.status !== "pending" && row.status !== "denied",
      ).length,
      pending_with_denial_fields: requests.filter(
        (row) =>
          row.status === "pending" &&
          (row.deniedAt !== undefined || row.reapplyAt !== undefined),
      ).length,
      malformed_denied_rows: requests.filter(
        (row) =>
          row.status === "denied" &&
          (typeof row.deniedAt !== "number" ||
            !Number.isFinite(row.deniedAt) ||
            typeof row.reapplyAt !== "number" ||
            !Number.isFinite(row.reapplyAt) ||
            row.reapplyAt <= row.deniedAt),
      ).length,
      owner_request_rows: ownerRequestRows,
      missing_reference_request_rows: missingReferenceRequestRows,
      membership_pair_not_unique_request_rows: membershipPairNotUniqueRequestRows,
      active_membership_with_request_rows: activeMembershipWithRequestRows,
      membership_state_counts: counts(
        memberships.map((row) =>
          row.active === true && typeof row.revokedAt !== "number" ? "active" : "inactive",
        ),
      ),
      known_membership_revoked_reason_counts: counts(
        memberships
          .filter((row) => !(row.active === true && typeof row.revokedAt !== "number"))
          .map((row) => {
            const reason = String(row.revokedReason ?? "missing").trim().toLowerCase() || "missing";
            return knownRevokedReasons.has(reason) ? reason : "other";
          }),
      ),
    };
  },
});
