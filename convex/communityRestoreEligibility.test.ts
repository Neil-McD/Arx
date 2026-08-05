import { describe, expect, test } from "vitest";

import type { BuilderFundingProjection } from "../shared/builderFunding";
import { resolveCommunityRestoreEligibility } from "../shared/communityRestoreEligibility";

function funding(
  overrides: Partial<BuilderFundingProjection> = {},
): BuilderFundingProjection {
  return {
    lane: "builder",
    state: "builder_required",
    allowedActions: ["buy_builder"],
    ...overrides,
  };
}

describe("community restore eligibility", () => {
  test("active and archiving communities never expose restore authority", () => {
    expect(resolveCommunityRestoreEligibility({
      lifecycleStatus: "active",
      funding: funding({ state: "builder_included", allowedActions: [] }),
    })).toEqual({
      state: "not_archived",
      action: null,
      requires_verified_checkout: false,
    });
    expect(resolveCommunityRestoreEligibility({
      lifecycleStatus: "archiving",
      funding: funding({ state: "builder_included", allowedActions: [] }),
    })).toEqual({
      state: "archive_in_progress",
      action: null,
      requires_verified_checkout: false,
    });
  });

  test("only non-managed authoritative funding is immediately ready", () => {
    for (const projection of [
      funding({ lane: "builder_included", state: "builder_included", allowedActions: [] }),
      funding({
        lane: "legacy_choice",
        state: "legacy_api_active",
        allowedActions: ["manage_owner_api", "buy_builder"],
      }),
    ]) {
      expect(resolveCommunityRestoreEligibility({
        lifecycleStatus: "archived",
        funding: projection,
      })).toEqual({
        state: "ready",
        action: "restore_now",
        requires_verified_checkout: false,
      });
    }
  });

  test("managed active, canceling, and pending states are archived funding drift", () => {
    for (const projection of [
      funding({ state: "builder_active", allowedActions: ["manage_builder"] }),
      funding({ state: "builder_canceling", allowedActions: ["manage_builder"] }),
      funding({ state: "checkout_pending", allowedActions: ["resume_checkout"] }),
    ]) {
      expect(resolveCommunityRestoreEligibility({
        lifecycleStatus: "archived",
        funding: projection,
      })).toEqual({
        state: "funding_attention",
        action: projection.allowedActions.includes("manage_builder")
          ? "manage_builder"
          : null,
        requires_verified_checkout: false,
      });
    }
  });

  test("managed financial records override otherwise-ready restore funding", () => {
    expect(resolveCommunityRestoreEligibility({
      lifecycleStatus: "archived",
      funding: funding({
        lane: "builder_included",
        state: "builder_included",
        allowedActions: [],
      }),
      managedFundingConflict: true,
    })).toEqual({
      state: "funding_attention",
      action: null,
      requires_verified_checkout: false,
    });
  });

  test("managed restoration distinguishes checkout, pending, and payment attention", () => {
    expect(resolveCommunityRestoreEligibility({
      lifecycleStatus: "archived",
      funding: funding(),
    })).toEqual({
      state: "checkout_required",
      action: "buy_builder",
      requires_verified_checkout: true,
    });
    expect(resolveCommunityRestoreEligibility({
      lifecycleStatus: "archived",
      funding: funding({
        state: "builder_past_due",
        allowedActions: ["manage_builder"],
      }),
    })).toEqual({
      state: "funding_attention",
      action: "manage_builder",
      requires_verified_checkout: false,
    });
  });

  test("legacy restoration preserves the canonical API funding choice", () => {
    expect(resolveCommunityRestoreEligibility({
      lifecycleStatus: "archived",
      funding: funding({
        lane: "legacy_choice",
        state: "legacy_api_available",
        allowedActions: ["activate_owner_api", "buy_builder"],
      }),
    })).toEqual({
      state: "funding_attention",
      action: "activate_owner_api",
      requires_verified_checkout: false,
    });
  });
});
