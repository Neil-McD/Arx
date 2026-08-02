export function shouldShowFirstResolutionSkeleton(args: {
  isPresentationExpected: boolean;
  hasResolved: boolean;
  contentCount?: number;
  hasError?: boolean;
}): boolean {
  return Boolean(
    args.isPresentationExpected &&
      !args.hasResolved &&
      (args.contentCount ?? 0) === 0 &&
      !args.hasError,
  );
}
