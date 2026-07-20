export default query({
  handler: async (ctx) => {
    const LIMIT = 1000;
    const bounded = async (table, limit = LIMIT) => {
      const fetched = await ctx.db.query(table).take(limit + 1);
      return {
        rows: fetched.slice(0, limit),
        scan: { scanned: Math.min(fetched.length, limit), truncated: fetched.length > limit, limit },
      };
    };
    const counts = (rows, read) => {
      const result = {};
      for (const row of rows) {
        const key = String(read(row) ?? "missing");
        result[key] = (result[key] ?? 0) + 1;
      }
      return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
    };
    const tables = [
      "communityChatThreads", "communityChatMessages", "communityInteractionLegacyChatLinks",
      "communityInteractionRoots", "communityInteractionReplies", "communityInteractionAttachments",
      "communityInteractionModerationEvents", "dmConversations", "dmParticipants", "dmMessages",
      "communityResources", "communityResourceContents", "communityEvidenceRetrievalLogs",
      "communityIntelligenceRetrievalLogs", "communityIntelligenceNodes", "memberFacts",
      "memberProfileSpines", "legalAcceptances", "userSourceIntegrationConnections",
      "userSourceIntegrationAuthStates", "appOAuthStates", "workspaceAutoRechargeSettings",
      "userStripeCustomers", "workspaceDirectorySnapshots", "workspaceFilePreviewSnapshots",
      "polynetCodexWorkerCapacityLeases", "daytonaCodexRuntimeTargets",
    ];
    const loaded = {};
    for (const table of tables) loaded[table] = await bounded(table);
    const rows = (table) => loaded[table].rows;
    const scans = Object.fromEntries(tables.map((table) => [table, loaded[table].scan]));

    const resources = rows("communityResources");
    const contents = rows("communityResourceContents");
    const resourceIds = new Set(resources.map((row) => String(row._id)));
    const contentByResource = new Map();
    for (const row of contents) {
      const key = String(row.resourceId);
      contentByResource.set(key, (contentByResource.get(key) ?? 0) + 1);
    }
    const inlineResources = resources.filter((row) => String(row.bodyMd ?? "").trim().length > 0);
    const intelligenceNodes = rows("communityIntelligenceNodes");
    const legacyUnversionedNodes = intelligenceNodes.filter(
      (row) => Array.isArray(row.sourceTraceIds) && row.sourceTraceIds.length > 0 &&
        (row.evidencePolicyVersion !== "citation_v1" || !Array.isArray(row.evidenceCitationIds) || row.evidenceCitationIds.length === 0),
    );
    const participantByConversation = new Map();
    for (const row of rows("dmParticipants")) {
      const key = String(row.conversationId);
      participantByConversation.set(key, (participantByConversation.get(key) ?? 0) + 1);
    }

    return {
      audit_version: "polynet_staging_lifecycle_migrations_shape:v1",
      generated_at_ms: Date.now(),
      limits: { rows_per_table: LIMIT, output_contains_identifiers_or_content: false },
      scans,
      interaction_migration: {
        legacy_chat_threads: rows("communityChatThreads").length,
        legacy_chat_messages: rows("communityChatMessages").length,
        legacy_links: rows("communityInteractionLegacyChatLinks").length,
        legacy_link_kind_counts: counts(rows("communityInteractionLegacyChatLinks"), (row) => row.linkKind),
        canonical_roots: rows("communityInteractionRoots").length,
        canonical_replies: rows("communityInteractionReplies").length,
        canonical_attachments: rows("communityInteractionAttachments").length,
        moderation_event_counts: counts(rows("communityInteractionModerationEvents"), (row) => row.eventType),
        privacy_purge_requested_events: rows("communityInteractionModerationEvents").filter((row) => row.eventType === "privacy_purge_requested").length,
        privacy_purged_events: rows("communityInteractionModerationEvents").filter((row) => row.eventType === "privacy_purged").length,
      },
      direct_messages: {
        conversations: rows("dmConversations").length,
        participants: rows("dmParticipants").length,
        messages: rows("dmMessages").length,
        participant_status_counts: counts(rows("dmParticipants"), (row) => row.status),
        conversations_with_one_participant_in_scan: [...participantByConversation.values()].filter((count) => count === 1).length,
        conversations_with_two_or_more_participants_in_scan: [...participantByConversation.values()].filter((count) => count >= 2).length,
        relationship_check_complete: !loaded.dmConversations.scan.truncated && !loaded.dmParticipants.scan.truncated,
      },
      resource_content_migration: {
        resources: resources.length,
        content_rows: contents.length,
        resources_with_inline_body: inlineResources.length,
        inline_body_and_content_row: inlineResources.filter((row) => contentByResource.has(String(row._id))).length,
        inline_body_without_content_row: inlineResources.filter((row) => !contentByResource.has(String(row._id))).length,
        duplicate_content_resource_keys: [...contentByResource.values()].filter((count) => count > 1).length,
        orphan_content_rows: contents.filter((row) => !resourceIds.has(String(row.resourceId))).length,
        relationship_check_complete: !loaded.communityResources.scan.truncated && !loaded.communityResourceContents.scan.truncated,
      },
      retrieval_privacy_migration: {
        evidence_retrieval_rows: rows("communityEvidenceRetrievalLogs").length,
        evidence_rows_with_raw_query: rows("communityEvidenceRetrievalLogs").filter((row) => String(row.query ?? "").length > 0).length,
        intelligence_retrieval_rows: rows("communityIntelligenceRetrievalLogs").length,
        intelligence_rows_with_raw_query: rows("communityIntelligenceRetrievalLogs").filter((row) => String(row.query ?? "").length > 0).length,
        intelligence_nodes: intelligenceNodes.length,
        legacy_unversioned_nodes: legacyUnversionedNodes.length,
      },
      account_lifecycle_unmapped_state: {
        member_facts: rows("memberFacts").length,
        member_profile_spines: rows("memberProfileSpines").length,
        legal_acceptances: rows("legalAcceptances").length,
        source_integration_connections: rows("userSourceIntegrationConnections").length,
        source_integration_auth_states: rows("userSourceIntegrationAuthStates").length,
        app_oauth_states: rows("appOAuthStates").length,
        workspace_auto_recharge_settings: rows("workspaceAutoRechargeSettings").length,
        stripe_customer_rows: rows("userStripeCustomers").length,
        workspace_directory_snapshots: rows("workspaceDirectorySnapshots").length,
        workspace_file_preview_snapshots: rows("workspaceFilePreviewSnapshots").length,
        worker_capacity_leases: rows("polynetCodexWorkerCapacityLeases").length,
        daytona_runtime_targets: rows("daytonaCodexRuntimeTargets").length,
      },
    };
  },
});
