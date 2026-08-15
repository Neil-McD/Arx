export type AsyncEpochRef = {
  current: number;
};

export function commitIfAsyncEpochCurrent(
  epochRef: AsyncEpochRef,
  expectedEpoch: number,
  commit: () => void,
): boolean {
  if (epochRef.current !== expectedEpoch) return false;
  commit();
  return true;
}
