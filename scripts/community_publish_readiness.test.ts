import { expect, test } from "vitest";

import {
  getCommunityPublishReadinessBlockingFields,
} from "../shared/communityPublishReadiness";

const READY_PROFILE = {
  name: "Ready community",
  oneLiner: "A complete public profile.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
};

test("entering Published requires the complete launch profile", () => {
  expect(
    getCommunityPublishReadinessBlockingFields({
      currentVisibility: "unlisted",
      nextVisibility: "published",
      current: {
        name: "Draft community",
        oneLiner: "Not ready yet.",
      },
      next: {
        name: "Draft community",
        oneLiner: "Not ready yet.",
      },
    }),
  ).toEqual(["community_avatar", "community_banner"]);
});

test("legacy Published communities can make unrelated edits and repair incrementally", () => {
  const legacyProfile = {
    name: "Legacy community",
    oneLiner: "Published before branding became required.",
  };

  expect(
    getCommunityPublishReadinessBlockingFields({
      currentVisibility: "published",
      nextVisibility: "published",
      current: legacyProfile,
      next: legacyProfile,
    }),
  ).toEqual([]);

  expect(
    getCommunityPublishReadinessBlockingFields({
      currentVisibility: "published",
      nextVisibility: "published",
      current: legacyProfile,
      next: {
        ...legacyProfile,
        avatarUrl: "https://example.com/repaired-avatar.png",
      },
    }),
  ).toEqual([]);
});

test("Published communities cannot introduce a new readiness regression", () => {
  expect(
    getCommunityPublishReadinessBlockingFields({
      currentVisibility: "published",
      nextVisibility: "published",
      current: {
        name: "Legacy community",
        oneLiner: "Existing copy.",
      },
      next: {
        name: "Legacy community",
        oneLiner: null,
      },
    }),
  ).toEqual(["community_one_liner"]);

  expect(
    getCommunityPublishReadinessBlockingFields({
      currentVisibility: "published",
      nextVisibility: "published",
      current: READY_PROFILE,
      next: {
        ...READY_PROFILE,
        bannerUrl: null,
      },
    }),
  ).toEqual(["community_banner"]);
});

test("moving to Unlisted does not require a public launch profile", () => {
  expect(
    getCommunityPublishReadinessBlockingFields({
      currentVisibility: "published",
      nextVisibility: "unlisted",
      current: READY_PROFILE,
      next: {},
    }),
  ).toEqual([]);
});
