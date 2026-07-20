export default query({
  handler: async (ctx) => {
    const LIMIT = 5000;
    const nowMs = Date.now();
    const bounded = async (table, limit = LIMIT) => {
      const fetched = await ctx.db.query(table).take(limit + 1);
      return {
        rows: fetched.slice(0, limit),
        scan: { scanned: Math.min(fetched.length, limit), truncated: fetched.length > limit, limit },
      };
    };
    const valueCounts = (rows, read) => {
      const counts = {};
      for (const row of rows) {
        const value = String(read(row) ?? "missing");
        counts[value] = (counts[value] ?? 0) + 1;
      }
      return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
    };
    const duplicateSummary = (rows, readKey) => {
      const counts = new Map();
      for (const row of rows) {
        const key = String(readKey(row) ?? "");
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const duplicateCounts = [...counts.values()].filter((count) => count > 1);
      return {
        distinct_keys: counts.size,
        duplicate_keys: duplicateCounts.length,
        duplicate_rows_beyond_first: duplicateCounts.reduce((sum, count) => sum + count - 1, 0),
        max_rows_per_key: duplicateCounts.length ? Math.max(...duplicateCounts) : 1,
      };
    };
    const ageBuckets = (rows, readMs) => {
      const day = 24 * 60 * 60 * 1000;
      const buckets = { lt_1d: 0, d1_7: 0, d8_30: 0, d31_90: 0, gt_90d: 0, missing: 0 };
      for (const row of rows) {
        const value = Number(readMs(row));
        if (!Number.isFinite(value)) { buckets.missing += 1; continue; }
        const age = Math.max(0, nowMs - value);
        if (age < day) buckets.lt_1d += 1;
        else if (age < 7 * day) buckets.d1_7 += 1;
        else if (age < 30 * day) buckets.d8_30 += 1;
        else if (age < 90 * day) buckets.d31_90 += 1;
        else buckets.gt_90d += 1;
      }
      return buckets;
    };

    const [users, sessions, entitlements, communities, memberships, joinRequests] = await Promise.all([
      bounded("users"),
      bounded("authSessions"),
      bounded("userEntitlements"),
      bounded("communities"),
      bounded("communityMemberships"),
      bounded("communityJoinRequests"),
    ]);

    const normalizedEmails = users.rows.filter((row) => String(row.normalizedEmail ?? "").trim());
    const entitlementByUser = new Map();
    for (const row of entitlements.rows) {
      const key = String(row.userId);
      const list = entitlementByUser.get(key) ?? [];
      list.push(row);
      entitlementByUser.set(key, list);
    }
    const entitlementRowBuckets = { one: 0, two: 0, three: 0, four_to_ten: 0, gt_ten: 0 };
    let ambiguousLatestEntitlementUsers = 0;
    for (const rows of entitlementByUser.values()) {
      if (rows.length === 1) entitlementRowBuckets.one += 1;
      else if (rows.length === 2) entitlementRowBuckets.two += 1;
      else if (rows.length === 3) entitlementRowBuckets.three += 1;
      else if (rows.length <= 10) entitlementRowBuckets.four_to_ten += 1;
      else entitlementRowBuckets.gt_ten += 1;
      const maxStartsAt = Math.max(...rows.map((row) => Number(row.startsAt ?? 0)));
      const latestTiers = new Set(rows.filter((row) => Number(row.startsAt ?? 0) === maxStartsAt).map((row) => String(row.tier)));
      if (latestTiers.size > 1) ambiguousLatestEntitlementUsers += 1;
    }

    const membershipPairs = new Map();
    const activeDistinctByCommunity = new Map();
    for (const row of memberships.rows) {
      const pairKey = `${String(row.communityId)}:${String(row.userId)}`;
      const list = membershipPairs.get(pairKey) ?? [];
      list.push(row);
      membershipPairs.set(pairKey, list);
      if (row.active !== false && typeof row.revokedAt !== "number") {
        const communityKey = String(row.communityId);
        const usersForCommunity = activeDistinctByCommunity.get(communityKey) ?? new Set();
        usersForCommunity.add(String(row.userId));
        activeDistinctByCommunity.set(communityKey, usersForCommunity);
      }
    }
    const duplicateMembershipPairs = [...membershipPairs.values()].filter((rows) => rows.length > 1);
    const multipleActiveMembershipPairs = duplicateMembershipPairs.filter(
      (rows) => rows.filter((row) => row.active !== false && typeof row.revokedAt !== "number").length > 1,
    );
    let activeMemberCountMismatches = 0;
    for (const community of communities.rows) {
      const expected = 1 + (activeDistinctByCommunity.get(String(community._id))?.size ?? 0);
      if (Number(community.activeMemberCount ?? 0) !== expected) activeMemberCountMismatches += 1;
    }

    const sessionIds = new Set(sessions.rows.map((row) => String(row.sessionId)));
    const missingReplacementTargets = sessions.rows.filter(
      (row) => row.replacedBySessionId && !sessionIds.has(String(row.replacedBySessionId)),
    ).length;

    return {
      audit_version: "polynet_staging_identity_access_shape:v1",
      generated_at_ms: nowMs,
      limits: { rows_per_table: LIMIT, output_contains_identifiers: false },
      scans: {
        users: users.scan,
        auth_sessions: sessions.scan,
        user_entitlements: entitlements.scan,
        communities: communities.scan,
        community_memberships: memberships.scan,
        community_join_requests: joinRequests.scan,
      },
      users: {
        anonymous_auth_subject_rows: users.rows.filter((row) => String(row.authSubject ?? "").startsWith("anon:")).length,
        missing_normalized_email_rows: users.rows.filter((row) => !String(row.normalizedEmail ?? "").trim()).length,
        auth_subject_uniqueness: duplicateSummary(users.rows, (row) => row.authSubject),
        normalized_email_uniqueness: duplicateSummary(normalizedEmails, (row) => String(row.normalizedEmail).toLowerCase()),
      },
      sessions: {
        state_counts: valueCounts(sessions.rows, (row) => typeof row.revokedAt === "number" ? "revoked" : "active"),
        created_age_buckets: ageBuckets(sessions.rows, (row) => row.createdAt),
        replacement_rows: sessions.rows.filter((row) => Boolean(row.replacedBySessionId)).length,
        missing_replacement_targets_in_scan: missingReplacementTargets,
        replacement_reference_check_complete: !sessions.scan.truncated,
      },
      entitlements: {
        users_with_rows: entitlementByUser.size,
        rows_per_user_buckets: entitlementRowBuckets,
        tier_counts: valueCounts(entitlements.rows, (row) => row.tier),
        source_counts: valueCounts(entitlements.rows, (row) => row.source),
        ambiguous_latest_start_users: ambiguousLatestEntitlementUsers,
      },
      communities: {
        slug_uniqueness: duplicateSummary(communities.rows, (row) => row.slug),
        visibility_counts: valueCounts(communities.rows, (row) => row.visibility),
        entry_policy_counts: valueCounts(communities.rows, (row) => row.entryPolicy),
        deprecated_member_onboarding_rows: communities.rows.filter((row) => row.memberOnboarding != null).length,
        active_member_count_mismatches: activeMemberCountMismatches,
        active_member_count_check_complete: !communities.scan.truncated && !memberships.scan.truncated,
      },
      memberships: {
        missing_active_rows: memberships.rows.filter((row) => typeof row.active !== "boolean").length,
        active_rows: memberships.rows.filter((row) => row.active !== false && typeof row.revokedAt !== "number").length,
        inactive_or_revoked_rows: memberships.rows.filter((row) => row.active === false || typeof row.revokedAt === "number").length,
        access_source_counts: valueCounts(memberships.rows, (row) => row.accessSource),
        role_counts: valueCounts(memberships.rows, (row) => row.role),
        duplicate_pairs: duplicateMembershipPairs.length,
        duplicate_rows_beyond_first: duplicateMembershipPairs.reduce((sum, rows) => sum + rows.length - 1, 0),
        multiple_active_pairs: multipleActiveMembershipPairs.length,
      },
      join_requests: {
        status_counts: valueCounts(joinRequests.rows, (row) => row.status),
      },
    };
  },
});
