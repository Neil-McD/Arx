import { expect, test } from "vitest";
import { acceptsPreviousValidator as accepts } from "./cachedClientValidatorCompatibility";
const string = { type: "string" }, boolean = { type: "boolean" };
const obj = (value: any) => ({ type: "object", value });
const field = (fieldType: any, optional = false) => ({ fieldType, optional });
test("rejects removed production overlap argument and newly required fields", () => {
  const old = obj({ overlap: field(boolean, true) });
  expect(accepts(obj({}), old)).toBe(false);
  expect(accepts(obj({ overlap: field(boolean) }), old)).toBe(false);
  expect(accepts(obj({ overlap: field(boolean, true), extra: field(string) }), old)).toBe(false);
  expect(accepts(obj({ overlap: field(boolean, true), extra: field(string, true) }), old)).toBe(true);
});
test("rejects nested attachment payload narrowing", () => {
  const old = obj({ attachments: field({ type: "array", value: obj({ storageId: field(string) }) }, true) });
  const next = obj({ attachments: field({ type: "array", value: obj({ attachmentId: field(string) }) }, true) });
  expect(accepts(next, old)).toBe(false);
});
test("accepts equivalent metadata regardless of JSON key order", () => {
  expect(accepts({ type: "id", tableName: "users" }, { tableName: "users", type: "id" })).toBe(true);
});
test("allows enum expansion but rejects narrowing and different id tables", () => {
  const literal = (value: string) => ({ type: "literal", value });
  const union = (...value: any[]) => ({ type: "union", value });
  expect(accepts(union(literal("a"), literal("b")), literal("a"))).toBe(true);
  expect(accepts(literal("a"), union(literal("a"), literal("b")))).toBe(false);
  expect(accepts({ type: "id", tableName: "users" }, { type: "id", tableName: "communities" })).toBe(false);
});
