import { useCallback, useRef } from "react";

type Waiter = {
  epoch: number;
  resolve: () => void;
  reject: (error: unknown) => void;
};

export type LastClickWinsWorkerState<TTarget> = {
  inFlight: boolean;
  target: TTarget | null;
};

export function useLastClickWinsController<TTarget>(options: {
  applyTarget: (target: TTarget) => Promise<void>;
  onWorkerStateChange?: (state: LastClickWinsWorkerState<TTarget>) => void;
  onTargetSettled?: (params: {
    target: TTarget;
    isLatest: boolean;
    error: unknown | null;
  }) => void;
}): {
  requestTarget: (target: TTarget) => Promise<void>;
  isInFlight: () => boolean;
} {
  const applyRef = useRef(options.applyTarget);
  const onWorkerStateChangeRef = useRef(options.onWorkerStateChange);
  const onTargetSettledRef = useRef(options.onTargetSettled);
  applyRef.current = options.applyTarget;
  onWorkerStateChangeRef.current = options.onWorkerStateChange;
  onTargetSettledRef.current = options.onTargetSettled;

  const epochRef = useRef(0);
  const appliedEpochRef = useRef(0);
  const desiredTargetRef = useRef<TTarget | null>(null);
  const inFlightRef = useRef(false);
  const waitersRef = useRef<Waiter[]>([]);

  const settleWaiters = useCallback((upToEpoch: number, error: unknown | null) => {
    const remaining: Waiter[] = [];
    for (const waiter of waitersRef.current) {
      if (waiter.epoch <= upToEpoch) {
        if (error) waiter.reject(error);
        else waiter.resolve();
      } else {
        remaining.push(waiter);
      }
    }
    waitersRef.current = remaining;
  }, []);

  const runWorker = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    onWorkerStateChangeRef.current?.({ inFlight: true, target: desiredTargetRef.current });
    try {
      while (appliedEpochRef.current < epochRef.current) {
        const epoch = epochRef.current;
        const target = desiredTargetRef.current;
        if (target === null) {
          appliedEpochRef.current = epoch;
          settleWaiters(epoch, null);
          break;
        }

        onWorkerStateChangeRef.current?.({ inFlight: true, target });
        try {
          await applyRef.current(target);
          appliedEpochRef.current = epoch;
          settleWaiters(epoch, null);
          onTargetSettledRef.current?.({
            target,
            isLatest: epoch === epochRef.current,
            error: null,
          });
        } catch (error) {
          appliedEpochRef.current = epoch;
          settleWaiters(epoch, error);
          onTargetSettledRef.current?.({
            target,
            isLatest: epoch === epochRef.current,
            error,
          });
        }
      }
    } finally {
      inFlightRef.current = false;
      onWorkerStateChangeRef.current?.({ inFlight: false, target: null });
    }
  }, [settleWaiters]);

  const requestTarget = useCallback(
    (target: TTarget): Promise<void> => {
      const epoch = (epochRef.current += 1);
      desiredTargetRef.current = target;
      void runWorker();
      return new Promise<void>((resolve, reject) => {
        waitersRef.current.push({ epoch, resolve, reject });
      });
    },
    [runWorker],
  );

  const isInFlight = useCallback(() => inFlightRef.current, []);

  return { requestTarget, isInFlight };
}
