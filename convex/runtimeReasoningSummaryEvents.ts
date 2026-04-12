type AppendRuntimeEvent = (event: {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
}) => Promise<void>;

export function createRuntimeReasoningSummaryEmitter(params: {
  runId: string;
  summaryStreamId: string;
  appendRunEvent: AppendRuntimeEvent;
}) {
  let summaryPartCount = 0;
  let summaryDeltaCount = 0;

  return {
    onPartAdded: async (summaryIndex: number): Promise<void> => {
      try {
        summaryPartCount += 1;
        await params.appendRunEvent({
          eventType: "reasoning_summary_part_added",
          eventKey: `${params.runId}:reasoning_summary_part_added:${summaryPartCount}`,
          payload: {
            run_id: params.runId,
            summary_stream_id: params.summaryStreamId,
            summary_index: summaryIndex,
          },
        });
      } catch {
        // Best-effort UX event; reasoning summaries should not break the turn.
      }
    },
    onTextDelta: async (delta: string, summaryIndex: number): Promise<void> => {
      if (!delta) return;
      try {
        summaryDeltaCount += 1;
        await params.appendRunEvent({
          eventType: "reasoning_summary_text_delta",
          eventKey: `${params.runId}:reasoning_summary_text_delta:${summaryDeltaCount}`,
          payload: {
            run_id: params.runId,
            summary_stream_id: params.summaryStreamId,
            summary_index: summaryIndex,
            delta,
          },
        });
      } catch {
        // Best-effort UX event; reasoning summaries should not break the turn.
      }
    },
  };
}
