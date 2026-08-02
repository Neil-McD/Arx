export function shouldShowFirstResolutionSkeleton(args: {
  isLoading: boolean;
  hasResolved: boolean;
  contentCount?: number;
  hasError?: boolean;
}): boolean {
  return Boolean(
    args.isLoading &&
      !args.hasResolved &&
      (args.contentCount ?? 0) === 0 &&
      !args.hasError,
  );
}
