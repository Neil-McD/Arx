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
    const activeMembershipPairs = new Set(
      memberships
        .filter((row) => row.active === true && typeof row.revokedAt !== "number")
        .map((row) => `${String(row.communityId)}:${String(row.userId)}`),
    );
    const knownRevokedReasons = new Set([
      "left_by_member",
      "removed_by_manager",
      "removed_by_manager_stripe_canceled",
      "banned_by_manager",
      "banned_by_manager_stripe_canceled",
    ]);

    return {
      audit_version: "join_admission_authority:v2",
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
      platform_home_opt_out_rows: requests.filter(
        (row) => String(row.message ?? "").trim() === "platform_home_autojoin_opt_out",
      ).length,
      denied_missing_denied_at: requests.filter(
        (row) => row.status === "denied" && typeof row.deniedAt !== "number",
      ).length,
      denied_missing_reapply_at: requests.filter(
        (row) => row.status === "denied" && typeof row.reapplyAt !== "number",
      ).length,
      non_denied_with_denial_fields: requests.filter(
        (row) =>
          row.status !== "denied" &&
          (typeof row.deniedAt === "number" || typeof row.reapplyAt === "number"),
      ).length,
      approved_without_active_membership: requests.filter(
        (row) =>
          row.status === "approved" &&
          !activeMembershipPairs.has(`${String(row.communityId)}:${String(row.userId)}`),
      ).length,
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
