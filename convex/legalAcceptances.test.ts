import { describe, expect, test } from "vitest";

import { hasAcceptedCurrentPlatformLegalFromRows } from "./legalAcceptances";

const privacyAcceptance = {
  documentKey: "privacy_ai_data_policy",
  documentVersion: "privacy_ai_data_policy_v2",
};

describe("platform legal acceptance versioning", () => {
  test("historical Terms v1 acceptance no longer satisfies the material v4 contract", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v1" },
      privacyAcceptance,
    ])).toBe(false);
  });

  test("historical Terms v2 acceptance no longer satisfies the material v4 contract", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v2" },
      privacyAcceptance,
    ])).toBe(false);
  });

  test("Terms v3 acceptance (paid Builder model) no longer satisfies v4: members re-accept once", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v3" },
      privacyAcceptance,
    ])).toBe(false);
  });

  test("Terms v4 acceptance still counts under v5: members are not asked again", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v4" },
      privacyAcceptance,
    ])).toBe(true);
  });

  test("unknown Terms versions fail closed", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_unknown" },
      privacyAcceptance,
    ])).toBe(false);
  });

  test("Privacy v1 acceptance still counts under v2: members are not asked again", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v4" },
      { documentKey: "privacy_ai_data_policy", documentVersion: "privacy_ai_data_policy_v1" },
    ])).toBe(true);
  });

  test("a v1 privacy acceptance never stands in for the terms", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "privacy_ai_data_policy_v1" },
      { documentKey: "privacy_ai_data_policy", documentVersion: "privacy_ai_data_policy_v1" },
    ])).toBe(false);
  });

  test("current Terms v5 acceptance is sufficient", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v5" },
      privacyAcceptance,
    ])).toBe(true);
  });

  test("privacy acceptance remains independently required", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v4" },
    ])).toBe(false);
  });
});
