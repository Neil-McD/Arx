export default query({
  handler: async (ctx) => {
    const LIMIT = 2000;
    const nowMs = Date.now();
    const bounded = async (table, limit = LIMIT) => {
      const fetched = await ctx.db.query(table).take(limit + 1);
      return { rows: fetched.slice(0, limit), scan: { scanned: Math.min(fetched.length, limit), truncated: fetched.length > limit, limit } };
    };
    const counts = (rows, read) => {
      const result = {};
      for (const row of rows) {
        const key = String(read(row) ?? "missing");
        result[key] = (result[key] ?? 0) + 1;
      }
      return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
    };
    const ageBuckets = (rows, read) => {
      const day = 24 * 60 * 60 * 1000;
      const result = { lt_7d: 0, d7_30: 0, d31_90: 0, gt_90d: 0, missing: 0 };
      for (const row of rows) {
        const value = Number(read(row));
        if (!Number.isFinite(value)) { result.missing += 1; continue; }
        const age = Math.max(0, nowMs - value);
        if (age < 7 * day) result.lt_7d += 1;
        else if (age < 30 * day) result.d7_30 += 1;
        else if (age < 90 * day) result.d31_90 += 1;
        else result.gt_90d += 1;
      }
      return result;
    };
    const tableNames = [
      "communities", "communityMemberships", "communityAiFeedPosts", "communityEvents",
      "criticalAuditEvents", "platformDiagnosticEvents", "runtimeRuns", "runtimeRunEvents",
      "emailOutbox", "communityMentionBroadcasts", "communityAgentServeRequests",
      "communitySourceCrawlJobs", "communityMemoryMetabolizerRuns", "communityCompilerDigests",
    ];
    const loaded = {};
    for (const table of tableNames) loaded[table] = await bounded(table);
    const rows = (table) => loaded[table].rows;
    const membershipsByCommunity = new Map();
    for (const row of rows("communityMemberships")) {
      if (row.active === false || typeof row.revokedAt === "number") continue;
      const key = String(row.communityId);
      membershipsByCommunity.set(key, (membershipsByCommunity.get(key) ?? 0) + 1);
    }
    const feedCommunities = new Set(rows("communityAiFeedPosts").map((row) => String(row.communityId)));
    const events = rows("communityEvents");
    const recurring = events.filter((row) => String(row.recurrenceFrequency ?? "none") !== "none");
    const memberCounts = [...membershipsByCommunity.values()];

    return {
      audit_version: "polynet_staging_async_scale_retention_shape:v1",
      generated_at_ms: nowMs,
      limits: { rows_per_table: LIMIT, output_contains_identifiers_or_content: false },
      scans: Object.fromEntries(tableNames.map((table) => [table, loaded[table].scan])),
      scheduler_threshold_impact: {
        communities_total_in_scan: rows("communities").length,
        communities_beyond_memory_sweep_500: Math.max(0, rows("communities").length - 500),
        published_communities_beyond_digest_prefix_50: Math.max(0, rows("communities").filter((row) => row.visibility === "published").length - 50),
        unlisted_communities_beyond_digest_prefix_50: Math.max(0, rows("communities").filter((row) => row.visibility === "unlisted").length - 50),
        distinct_ai_feed_communities_in_scan: feedCommunities.size,
        ai_feed_communities_beyond_monthly_2000: Math.max(0, feedCommunities.size - 2000),
        event_recurrence_counts: counts(recurring, (row) => row.recurrenceFrequency),
        recurring_events_beyond_per_frequency_500: Object.fromEntries(
          Object.entries(counts(recurring, (row) => row.recurrenceFrequency)).map(([key, count]) => [key, Math.max(0, count - 500)]),
        ),
        communities_with_more_than_500_active_memberships: memberCounts.filter((count) => count > 500).length,
        max_active_membership_rows_per_community: memberCounts.length ? Math.max(...memberCounts) : 0,
        impact_counts_complete: ["communities", "communityMemberships", "communityAiFeedPosts", "communityEvents"]
          .every((table) => !loaded[table].scan.truncated),
      },
      queue_states: {
        email_outbox: counts(rows("emailOutbox"), (row) => row.status),
        mention_broadcasts: counts(rows("communityMentionBroadcasts"), (row) => row.status),
        community_agent_serve_requests: counts(rows("communityAgentServeRequests"), (row) => row.status),
        source_crawl_jobs: counts(rows("communitySourceCrawlJobs"), (row) => row.status),
        memory_metabolizer_runs: counts(rows("communityMemoryMetabolizerRuns"), (row) => row.status),
      },
      operational_retention: {
        critical_audit_event_age: ageBuckets(rows("criticalAuditEvents"), (row) => row.createdAt),
        diagnostic_event_age: ageBuckets(rows("platformDiagnosticEvents"), (row) => row.createdAt),
        runtime_run_age: ageBuckets(rows("runtimeRuns"), (row) => row.startedAt ?? row.createdAt),
        runtime_event_age: ageBuckets(rows("runtimeRunEvents"), (row) => row.createdAt),
        compiler_digest_age: ageBuckets(rows("communityCompilerDigests"), (row) => row.updatedAt ?? row.createdAt),
      },
    };
  },
});
