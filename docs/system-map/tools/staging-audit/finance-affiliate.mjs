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
    const sum = (rows, read) => Math.round(rows.reduce((total, row) => {
      const value = Number(read(row));
      return total + (Number.isFinite(value) ? value : 0);
    }, 0) * 100) / 100;
    const duplicateUserSummary = (rows, read) => {
      const byUser = new Map();
      for (const row of rows) {
        const key = String(read(row) ?? "");
        if (!key) continue;
        byUser.set(key, (byUser.get(key) ?? 0) + 1);
      }
      const duplicates = [...byUser.values()].filter((count) => count > 1);
      return { duplicate_users: duplicates.length, duplicate_rows_beyond_first: duplicates.reduce((n, count) => n + count - 1, 0) };
    };
    const tableNames = [
      "builderPartners", "partnerAttributions", "partnerCommissionLedger",
      "partnerCommissionAdjustments", "partnerPayoutBatches", "partnerPayoutTransfers",
      "partnerPayoutItems", "userStripeConnectAccounts", "communitySubscriptions",
      "checkoutSessions", "workspaceCreditBalances", "userStripeCustomers", "legalAcceptances",
    ];
    const loaded = {};
    for (const table of tableNames) loaded[table] = await bounded(table);
    const rows = (table) => loaded[table].rows;
    const commissions = rows("partnerCommissionLedger");
    const payoutBatches = rows("partnerPayoutBatches");
    const payoutTransfers = rows("partnerPayoutTransfers");

    return {
      audit_version: "polynet_staging_finance_affiliate_shape:v1",
      generated_at_ms: nowMs,
      limits: { rows_per_table: LIMIT, output_contains_identifiers: false, monetary_values_are_staging_aggregates: true },
      scans: Object.fromEntries(tableNames.map((table) => [table, loaded[table].scan])),
      builder_partners: {
        status_counts: counts(rows("builderPartners"), (row) => row.status),
        accepted_terms_rows: rows("builderPartners").filter((row) => typeof row.acceptedTermsAt === "number").length,
        missing_terms_rows: rows("builderPartners").filter((row) => typeof row.acceptedTermsAt !== "number").length,
      },
      attributions: {
        status_counts: counts(rows("partnerAttributions"), (row) => row.status),
        bound_to_user_rows: rows("partnerAttributions").filter((row) => Boolean(row.referredUserId)).length,
        community_revenue_eligible_rows: rows("partnerAttributions").filter((row) => row.eligibleForCommunityRevenue === true).length,
      },
      commissions: {
        status_counts: counts(commissions, (row) => row.status),
        basis_type_counts: counts(commissions, (row) => row.basisType),
        payout_open_rows: commissions.filter((row) => row.payoutOpen === true).length,
        payout_debt_rows: commissions.filter((row) => row.payoutDebt === true).length,
        hold_elapsed_locked_or_risk_rows: commissions.filter((row) =>
          (row.status === "locked" || row.status === "risk_hold") && typeof row.holdUntil === "number" && row.holdUntil <= nowMs,
        ).length,
        aggregate_commission_amount_usd: sum(commissions, (row) => row.commissionAmountUsd),
        aggregate_open_settlement_cents: sum(commissions, (row) => row.openSettlementCents),
        aggregate_net_settlement_cents: sum(commissions, (row) => row.netSettlementCents),
      },
      commission_adjustments: {
        status_counts: counts(rows("partnerCommissionAdjustments"), (row) => row.status),
        type_counts: counts(rows("partnerCommissionAdjustments"), (row) => row.adjustmentType),
        aggregate_amount_usd: sum(rows("partnerCommissionAdjustments"), (row) => row.amountUsd),
      },
      payout_batches: {
        status_counts: counts(payoutBatches, (row) => row.status),
        nonterminal_rows: payoutBatches.filter((row) => !["paid", "rejected", "failed"].includes(String(row.status))).length,
        aggregate_amount_usd: sum(payoutBatches, (row) => row.totalAmountUsd),
      },
      payout_transfers: {
        status_counts: counts(payoutTransfers, (row) => row.status),
        nonterminal_rows: payoutTransfers.filter((row) => !["succeeded", "failed", "canceled"].includes(String(row.status))).length,
        aggregate_amount_usd: sum(payoutTransfers, (row) => row.amountUsd),
      },
      payout_items: {
        status_counts: counts(rows("partnerPayoutItems"), (row) => row.status),
        aggregate_amount_usd: sum(rows("partnerPayoutItems"), (row) => row.amountUsd),
      },
      community_commerce: {
        subscription_status_counts: counts(rows("communitySubscriptions"), (row) => row.status),
        checkout_mode_counts: counts(rows("checkoutSessions"), (row) => row.mode),
        checkout_status_counts: counts(rows("checkoutSessions"), (row) => row.status),
        connect_status_counts: counts(rows("userStripeConnectAccounts"), (row) => row.status),
        connect_duplicate_users: duplicateUserSummary(rows("userStripeConnectAccounts"), (row) => row.userId),
      },
      billing_identity_invariants: {
        workspace_credit_balance_duplicates: duplicateUserSummary(rows("workspaceCreditBalances"), (row) => row.userId),
        stripe_customer_duplicates: duplicateUserSummary(rows("userStripeCustomers"), (row) => row.userId),
      },
      legal_acceptances: {
        document_key_counts: counts(rows("legalAcceptances"), (row) => row.documentKey),
      },
    };
  },
});
