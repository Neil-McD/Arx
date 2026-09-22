import { expect, test } from "vitest";
import { normalizeCommunityExternalFunnelUrl } from "../shared/communityExternalFunnel";

test("external marketing URLs are public HTTPS destinations only", () => {
  expect(normalizeCommunityExternalFunnelUrl(" https://example.com/join?source=polynet "))
    .toBe("https://example.com/join?source=polynet");
  expect(normalizeCommunityExternalFunnelUrl(" ")).toBeNull();
  for (const candidate of [
    "http://example.com", "javascript:alert(1)", "https://user:secret@example.com",
    "https://localhost/join", "https://127.0.0.1/join", "https://site.local/join",
    "https://[::1]/join", "https://example.com/" + "x".repeat(2048),
  ]) {
    expect(() => normalizeCommunityExternalFunnelUrl(candidate)).toThrow();
  }
});
