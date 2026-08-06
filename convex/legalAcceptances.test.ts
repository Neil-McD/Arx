import { describe, expect, test } from "vitest";

import { hasAcceptedCurrentPlatformLegalFromRows } from "./legalAcceptances";

const privacyAcceptance = {
  documentKey: "privacy_ai_data_policy",
  documentVersion: "privacy_ai_data_policy_v1",
};

describe("platform legal acceptance versioning", () => {
  test("historical Terms v1 acceptance no longer satisfies the material v3 contract", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v1" },
      privacyAcceptance,
    ])).toBe(false);
  });

  test("historical Terms v2 acceptance no longer satisfies the material v3 contract", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v2" },
      privacyAcceptance,
    ])).toBe(false);
  });

  test("current Terms v3 acceptance is sufficient", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v3" },
      privacyAcceptance,
    ])).toBe(true);
  });

  test("unknown Terms versions fail closed", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_unknown" },
      privacyAcceptance,
    ])).toBe(false);
  });

  test("privacy acceptance remains independently required", () => {
    expect(hasAcceptedCurrentPlatformLegalFromRows([
      { documentKey: "terms_of_service", documentVersion: "terms_of_service_v3" },
    ])).toBe(false);
  });
});
