// Discover lists a published community once it looks finished: a banner and
// a one-liner (docs/specs/discover-v1.md; the server's rule is
// communityLooksFinished in convex/communityPublic.ts). This is the line the
// host reads under "Listed in Discover" when theirs is switched on but not
// showing yet. Null: nothing is missing.
export function discoverListingGap(input: { listed: boolean; hasBanner: boolean; oneLiner: string | null | undefined }): string | null {
  if (!input.listed) return null;
  const needsBanner = !input.hasBanner;
  const needsLine = !String(input.oneLiner ?? "").trim();
  if (needsBanner && needsLine) return "Add a banner and a one-liner to appear in Discover.";
  if (needsBanner) return "Add a banner to appear in Discover.";
  if (needsLine) return "Add a one-liner to appear in Discover.";
  return null;
}
