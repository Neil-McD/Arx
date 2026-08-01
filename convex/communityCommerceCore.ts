export function requireCommunityProviderAccountMatch(args: {
  expectedProviderAccountId: unknown;
  actualProviderAccountId: unknown;
  missingCode: string;
  mismatchCode: string;
}): string {
  const actualProviderAccountId = String(args.actualProviderAccountId ?? "").trim();
  if (!actualProviderAccountId) throw new Error(args.missingCode);
  const expectedProviderAccountId = String(args.expectedProviderAccountId ?? "").trim();
  if (!expectedProviderAccountId || expectedProviderAccountId !== actualProviderAccountId) {
    throw new Error(args.mismatchCode);
  }
  return actualProviderAccountId;
}
