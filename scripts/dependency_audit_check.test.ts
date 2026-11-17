import { describe, expect, it } from "vitest";
// @ts-expect-error plain script, no types
import { ALLOWED_DEV_ADVISORIES, advisoriesIn, unexcused } from "./dependency_audit_check.mjs";

const advisory = (id: string, name: string) => ({ source: 1, name, title: `${name} problem`, url: `https://github.com/advisories/${id}`, severity: "high" });
const report = (...entries: Array<[string, unknown[]]>) => ({ vulnerabilities: Object.fromEntries(entries.map(([name, via]) => [name, { name, severity: "high", via }])) });

describe("the gate's dependency audit", () => {
  it("names every advisory once, however many packages it reaches", () => {
    const found = advisoriesIn(report(["picomatch", [advisory("GHSA-fc5q-39xc-vjpf", "picomatch")]], ["fdir", ["picomatch"]], ["vite", ["picomatch", "tinyglobby"]]));
    expect(found.map((entry: { id: string }) => entry.id)).toEqual(["GHSA-fc5q-39xc-vjpf"]);
  });

  it("lets a named advisory through and nothing else", () => {
    const named = ALLOWED_DEV_ADVISORIES[0].id;
    expect(unexcused(report(["picomatch", [advisory(named, "picomatch")]]))).toEqual([]);
    const other = unexcused(report(["picomatch", [advisory(named, "picomatch"), advisory("GHSA-aaaa-bbbb-cccc", "picomatch")]]));
    expect(other.map((entry: { id: string }) => entry.id)).toEqual(["GHSA-aaaa-bbbb-cccc"]);
  });

  it("is an exception for one advisory, with a reason and a date", () => {
    for (const entry of ALLOWED_DEV_ADVISORIES) {
      expect(entry.id).toMatch(/^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/);
      expect(entry.why.length).toBeGreaterThan(40);
      expect(entry.allowed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
