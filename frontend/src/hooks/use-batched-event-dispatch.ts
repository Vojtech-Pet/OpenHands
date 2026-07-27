import { useCallback, useEffect, useRef } from "react";
import { isStreamingDeltaEvent } from "#/types/v1/type-guards";
import { StreamingDeltaEvent } from "#/types/v1/core/events/streaming-delta-event";
import { mergeStreamingDeltaEvent } from "#/utils/handle-event-for-ui";
import { OHEvent } from "#/stores/use-event-store";

const FLUSH_DELAY_MS = 120;

/**
 * Wraps a raw `addEvent` dispatcher so that consecutive StreamingDeltaEvents
 * (one per generated token) are coalesced client-side before ever reaching
 * the event store, instead of calling `addEvent` once per token.
 *
 * Why: `useEventStore.addEvent` and `handleEventForUI` do an immutable
 * `[...array]` copy of the accumulated event list on every call (Zustand
 * requires a new reference to trigger re-renders). That copy is O(n) in the
 * number of already-accumulated events, so on a long-running conversation
 * (thousands of tool-call/hook events) with a model that streams long
 * reasoning traces, calling `addEvent` per token turns into effectively
 * quadratic work over the life of the session -- this is the leading
 * suspect for the browser tab becoming sluggish/unresponsive on long runs
 * (found 2026-07-27, comparing against LM Studio's own chat UI which has no
 * such per-token history list).
 *
 * This coalesces same-stream deltas using the exact same
 * `mergeStreamingDeltaEvent` concatenation the store itself uses, so the
 * *content* delivered to the store is identical either way (string
 * concatenation is associative) -- only the *number* of expensive store
 * commits drops, roughly by the batching factor. Non-delta events always
 * flush any pending delta first, preserving event order.
 */
export function useBatchedEventDispatch(addEvent: (event: OHEvent) => void) {
  const pendingRef = useRef<StreamingDeltaEvent | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending !== null) {
      pendingRef.current = null;
      addEvent(pending as unknown as OHEvent);
    }
  }, [addEvent]);

  // Flush on unmount so the last partial chunk of a stream isn't dropped.
  useEffect(() => () => flush(), [flush]);

  const dispatch = useCallback(
    (event: OHEvent) => {
      if (isStreamingDeltaEvent(event as never)) {
        const delta = event as unknown as StreamingDeltaEvent;
        pendingRef.current = pendingRef.current
          ? mergeStreamingDeltaEvent(delta, pendingRef.current)
          : delta;
        if (timerRef.current === null) {
          timerRef.current = setTimeout(flush, FLUSH_DELAY_MS);
        }
        return;
      }

      // A genuine event ends the current stream run -- flush first so it
      // lands after the deltas that produced it, not before.
      flush();
      addEvent(event);
    },
    [addEvent, flush],
  );

  return dispatch;
}
