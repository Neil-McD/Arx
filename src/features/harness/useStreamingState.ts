import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

export type StreamingTokens = {
  prompt_tokens?: number;
  completion_tokens?: number;
  max_tokens?: number;
};

export type StreamingMeta = {
  engine_id: string;
  model_id: string;
  inference_source?: string | null;
};

export type UseStreamingStateResult = {
  streamingContent: string | null;
  setStreamingContent: Dispatch<SetStateAction<string | null>>;
  streamingRunId: string | null;
  setStreamingRunId: Dispatch<SetStateAction<string | null>>;
  streamingRenderedContent: string | null;
  streamingTokens: StreamingTokens | null;
  setStreamingTokens: Dispatch<SetStateAction<StreamingTokens | null>>;
  streamingMeta: StreamingMeta | null;
  setStreamingMeta: Dispatch<SetStateAction<StreamingMeta | null>>;
  streamingContentRef: MutableRefObject<string | null>;
  streamingTokensRef: MutableRefObject<StreamingTokens | null>;
  streamingMetaRef: MutableRefObject<StreamingMeta | null>;
  streamingRafRef: MutableRefObject<number | null>;
  scheduleStreamingUpdate: () => void;
  clearStreamingRefs: () => void;
  clearStreamingState: () => void;
};

export function useStreamingState(): UseStreamingStateResult {
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [streamingRunId, setStreamingRunId] = useState<string | null>(null);
  const [streamingRenderedContent, setStreamingRenderedContent] = useState<string | null>(null);
  const [streamingTokens, setStreamingTokens] = useState<StreamingTokens | null>(null);
  const [streamingMeta, setStreamingMeta] = useState<StreamingMeta | null>(null);

  const streamingContentRef = useRef<string | null>(null);
  const streamingTokensRef = useRef<StreamingTokens | null>(null);
  const streamingMetaRef = useRef<StreamingMeta | null>(null);
  const streamingRafRef = useRef<number | null>(null);
  const streamingRenderTimeoutRef = useRef<number | null>(null);
  const streamingRenderLastFlushAtRef = useRef<number>(0);

  const scheduleStreamingUpdate = useCallback(() => {
    if (streamingRafRef.current !== null) return;
    streamingRafRef.current = requestAnimationFrame(() => {
      streamingRafRef.current = null;
      setStreamingContent(streamingContentRef.current);
      if (streamingTokensRef.current) {
        setStreamingTokens(streamingTokensRef.current);
      }
      if (streamingMetaRef.current) {
        setStreamingMeta(streamingMetaRef.current);
      }
    });
  }, []);

  const clearStreamingRefs = useCallback(() => {
    if (streamingRafRef.current !== null) {
      cancelAnimationFrame(streamingRafRef.current);
      streamingRafRef.current = null;
    }
    streamingContentRef.current = null;
    streamingTokensRef.current = null;
    streamingMetaRef.current = null;
  }, []);

  const clearStreamingState = useCallback(() => {
    clearStreamingRefs();
    setStreamingContent(null);
    setStreamingRunId(null);
    setStreamingRenderedContent(null);
    setStreamingTokens(null);
    setStreamingMeta(null);
    streamingRenderLastFlushAtRef.current = 0;
    if (streamingRenderTimeoutRef.current !== null) {
      window.clearTimeout(streamingRenderTimeoutRef.current);
      streamingRenderTimeoutRef.current = null;
    }
  }, [clearStreamingRefs]);

  useEffect(() => {
    const THROTTLE_MS = 140;

    if (!streamingContent) {
      if (streamingRenderTimeoutRef.current !== null) {
        window.clearTimeout(streamingRenderTimeoutRef.current);
        streamingRenderTimeoutRef.current = null;
      }
      streamingRenderLastFlushAtRef.current = 0;
      setStreamingRenderedContent(null);
      return;
    }

    const flush = (value: string) => {
      streamingRenderLastFlushAtRef.current = Date.now();
      setStreamingRenderedContent(value);
    };

    const now = Date.now();
    const elapsed = now - streamingRenderLastFlushAtRef.current;
    if (elapsed >= THROTTLE_MS) {
      if (streamingRenderTimeoutRef.current !== null) {
        window.clearTimeout(streamingRenderTimeoutRef.current);
        streamingRenderTimeoutRef.current = null;
      }
      flush(streamingContent);
      return;
    }

    if (streamingRenderTimeoutRef.current !== null) {
      window.clearTimeout(streamingRenderTimeoutRef.current);
    }
    streamingRenderTimeoutRef.current = window.setTimeout(() => {
      streamingRenderTimeoutRef.current = null;
      flush(streamingContentRef.current ?? streamingContent);
    }, THROTTLE_MS - elapsed);
  }, [streamingContent]);

  useEffect(() => {
    return () => {
      if (streamingRenderTimeoutRef.current !== null) {
        window.clearTimeout(streamingRenderTimeoutRef.current);
      }
    };
  }, []);

  return {
    streamingContent,
    setStreamingContent,
    streamingRunId,
    setStreamingRunId,
    streamingRenderedContent,
    streamingTokens,
    setStreamingTokens,
    streamingMeta,
    setStreamingMeta,
    streamingContentRef,
    streamingTokensRef,
    streamingMetaRef,
    streamingRafRef,
    scheduleStreamingUpdate,
    clearStreamingRefs,
    clearStreamingState,
  };
}
