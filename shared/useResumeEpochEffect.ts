import { useEffect, useRef } from "react";

export function useResumeEpochEffect(
  resumeEpoch: number,
  onResume: () => void,
): void {
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;
  const lastHandledResumeEpochRef = useRef(resumeEpoch);

  useEffect(() => {
    if (resumeEpoch <= lastHandledResumeEpochRef.current) return;
    lastHandledResumeEpochRef.current = resumeEpoch;
    onResumeRef.current();
  }, [resumeEpoch]);
}
