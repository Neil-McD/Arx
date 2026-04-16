import { useEffect, useRef, useState } from "react";
import {
  getNextSmoothStreamingText,
  shouldDisableStreamingSmoothing,
} from "./smoothStreamingText";

export function useSmoothStreamingText(
  targetText: string,
  options: { active?: boolean; draining?: boolean } = {},
): string {
  const active = options.active === true;
  const [displayText, setDisplayText] = useState(() =>
    active && !shouldDisableStreamingSmoothing() ? "" : String(targetText ?? ""),
  );
  const displayTextRef = useRef(displayText);
  const targetTextRef = useRef(String(targetText ?? ""));
  const drainingRef = useRef(options.draining === true);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    displayTextRef.current = displayText;
  }, [displayText]);

  useEffect(() => {
    drainingRef.current = options.draining === true;
  }, [options.draining]);

  useEffect(() => {
    targetTextRef.current = String(targetText ?? "");
    if (!active || shouldDisableStreamingSmoothing()) {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      displayTextRef.current = targetTextRef.current;
      setDisplayText(targetTextRef.current);
      return;
    }

    const tick = () => {
      rafRef.current = null;
      const next = getNextSmoothStreamingText(
        displayTextRef.current,
        targetTextRef.current,
        {
          draining: drainingRef.current,
          reducedMotion: false,
        },
      );
      if (next !== displayTextRef.current) {
        displayTextRef.current = next;
        setDisplayText(next);
      }
      if (next !== targetTextRef.current) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    if (rafRef.current === null) {
      rafRef.current = window.requestAnimationFrame(tick);
    }

  }, [active, targetText]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return displayText;
}
