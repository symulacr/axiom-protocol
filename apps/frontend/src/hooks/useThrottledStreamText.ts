import { useCallback, useEffect, useRef, useState } from "react";

const STREAM_THROTTLE_MS = 50;

/** Stream-text state with a ref mirror and 50 ms render throttle: chunk
 *  handlers append to `textRef` (cheap, per-chunk) and call `schedule()` to
 *  coalesce re-renders; `flush()` renders the ref immediately (stream end),
 *  `reset()` clears both for the next run. */
export function useThrottledStreamText() {
  const [streamText, setStreamText] = useState("");
  const textRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelThrottle = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    if (timerRef.current !== null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setStreamText(textRef.current);
    }, STREAM_THROTTLE_MS);
  }, []);

  const flush = useCallback(() => {
    cancelThrottle();
    setStreamText(textRef.current);
  }, [cancelThrottle]);

  const reset = useCallback(() => {
    cancelThrottle();
    textRef.current = "";
    setStreamText("");
  }, [cancelThrottle]);

  useEffect(() => () => cancelThrottle(), [cancelThrottle]);

  return { streamText, setStreamText, textRef, schedule, flush, reset };
}
