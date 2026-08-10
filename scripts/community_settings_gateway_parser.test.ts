import { describe, expect, it } from "vitest";

import { parseCloudCommunitySettingsSnapshot } from "../shared/cloudCommunityAdminGateway";

const validSnapshot = {
  community_id: "community_123",
  name: "Polynet",
  slug: "polynet",
  one_liner: "Collective intelligence",
  about: null,
  avatar_url: "https://example.com/avatar.png",
  avatar_storage_id: "storage_avatar",
  avatar_focus_x: 0.5,
  avatar_focus_y: 0.4,
  avatar_zoom: 1.2,
  banner_url: "https://example.com/banner.png",
  banner_storage_id: "storage_banner",
  banner_focus_x: 0.6,
  banner_focus_y: 0.5,
  banner_zoom: 1,
  visibility: "published",
  updated_at: "2026-08-09T12:00:00.000Z",
  branding_revision: 7,
  settings_revision: 12,
  pricing: {
    mode: "monthly",
    monthly_amount_base_units: 2900,
    annual_amount_base_units: null,
    currency: "usd",
    currency_decimals: 2,
  },
};

describe("parseCloudCommunitySettingsSnapshot", () => {
  it("accepts the complete versioned aggregate", () => {
    expect(parseCloudCommunitySettingsSnapshot(validSnapshot)).toMatchObject({
      community_id: "community_123",
      settings_revision: 12,
      visibility: "published",
      pricing: {
        mode: "monthly",
        monthly_amount_base_units: 2900,
      },
    });
  });

  it("fails closed when revision or pricing authority is missing", () => {
    expect(() =>
      parseCloudCommunitySettingsSnapshot({
        ...validSnapshot,
        settings_revision: undefined,
      }),
    ).toThrow("community_settings_snapshot_invalid");
    expect(() =>
      parseCloudCommunitySettingsSnapshot({
        ...validSnapshot,
        pricing: undefined,
      }),
    ).toThrow("community_settings_snapshot_invalid");
  });

  it("fails closed on unsupported visibility and currency values", () => {
    expect(() =>
      parseCloudCommunitySettingsSnapshot({
        ...validSnapshot,
        visibility: "private",
      }),
    ).toThrow("community_settings_snapshot_invalid");
    expect(() =>
      parseCloudCommunitySettingsSnapshot({
        ...validSnapshot,
        pricing: { ...validSnapshot.pricing, currency: "eur" },
      }),
    ).toThrow("community_settings_snapshot_invalid:currency");
  });

  it("fails closed on incomplete metadata and invalid visual framing", () => {
    expect(() =>
      parseCloudCommunitySettingsSnapshot({
        ...validSnapshot,
        updated_at: "",
      }),
    ).toThrow("community_settings_snapshot_invalid");
    expect(() =>
      parseCloudCommunitySettingsSnapshot({
        ...validSnapshot,
        banner_focus_x: 1.1,
      }),
    ).toThrow("community_settings_snapshot_invalid:banner_focus_x");
    expect(() =>
      parseCloudCommunitySettingsSnapshot({
        ...validSnapshot,
        avatar_zoom: 0.9,
      }),
    ).toThrow("community_settings_snapshot_invalid:avatar_zoom");
  });
});
