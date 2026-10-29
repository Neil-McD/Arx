import { describe, expect, test } from "vitest";
import {
  communityClientAnswerFormatIssue,
  communityClientValueFromAnswer,
  type CommunityClientPropertyDefinition,
} from "../shared/communityClients";

// A typed answer that passes the member's check must fill its property, and one
// that would fill nothing (or the wrong number) must be caught before submit.
const property = (type: "number" | "date" | "url") => ({ key: type, name: type, type, options: [] }) as unknown as CommunityClientPropertyDefinition;
const shortText = { type: "short_text", options: [] };

describe("typed form answers", () => {
  test.each([
    ["number", "12", 12],
    ["number", " 1,200 ", 1200],
    ["number", "-3.5", -3.5],
    ["date", " 2026-11-01 ", "2026-11-01"],
    ["url", " https://example.com/a ", "https://example.com/a"],
  ] as const)("%s %j passes and fills %j", (type, answer, value) => {
    expect(communityClientAnswerFormatIssue(type, answer)).toBeNull();
    expect(communityClientValueFromAnswer(property(type), shortText, answer)).toBe(value);
  });

  test.each([
    ["number", ","],
    ["number", "five"],
    ["number", "5 hours"],
    ["number", "1,5"],
    ["date", "next week"],
    ["date", "2026-02-30"],
    ["url", "example"],
  ] as const)("%s %j is caught and never fills", (type, answer) => {
    expect(communityClientAnswerFormatIssue(type, answer)).toMatch(/^Enter /);
    expect(() => communityClientValueFromAnswer(property(type), shortText, answer)).toThrow("client_property_value_invalid");
  });
});
