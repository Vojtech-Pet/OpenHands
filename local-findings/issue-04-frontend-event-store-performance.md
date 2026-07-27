<!--
READY TO SUBMIT: copy the section below the line into
https://github.com/OpenHands/OpenHands/issues/new?template=bug_template.yml
Field labels below match that template exactly. Note: per CONTRIBUTING.md,
bigger frontend changes should be raised in the #proj-gui Slack channel
first -- do that before/alongside filing this, and before proposing the PR
in issue-04-fix-branch.
-->

# [Bug]: Web frontend becomes sluggish/unresponsive on long-running conversations (per-token store updates)

**Bug Description**

The web frontend's event store (`useEventStore`, Zustand) is updated once
per streamed token during agent generation, and each update does an
immutable `[...array]` copy of the entire accumulated event list — an O(n)
operation in the number of events seen so far in the conversation. On a
long-running conversation (thousands of accumulated events: tool calls,
hook executions, reasoning traces) with a model that streams long outputs,
this turns into effectively per-token-linear work over the life of the
session, and was the leading suspect for the browser tab becoming
sluggish/unresponsive on long runs — a problem that does not occur in LM
Studio's own chat UI (which has no equivalent per-token history list) on
the same hardware, same model, same machine.

**Expected Behavior**

Token-level streaming updates should be coalesced before they reach the
store (or the store shouldn't require a full-array copy per update), so the
cost of rendering is roughly proportional to visible UI updates per second,
not to total tokens generated over the life of the conversation.

**Actual Behavior**

One expensive store commit per token, unbounded by how many tokens a given
turn produces or how large the conversation has already grown.

**Steps to Reproduce**

1. Start a conversation and let the agent run a long task with a model that
   streams verbose reasoning/output (long `StreamingDeltaEvent` runs).
2. Watch main-thread responsiveness (e.g. Chrome performance profiler, or
   just interactivity of the tab) as the accumulated event count grows into
   the thousands.
3. Compare with an equivalent-length raw chat session against the same
   backend model via a client with no per-token history list (e.g. LM
   Studio's own UI) — no equivalent degradation.

**OpenHands Installation Method**: Local GUI (Docker web interface) /
Development workflow (frontend run from source against a local
`openhands-agent-server`)

**OpenHands Version**: `openhands-sdk` / `openhands-tools` /
`openhands-agent-server` 1.37.1 (repo commit `652503005093`, 2026-07-24),
`frontend/` (React + Zustand)

**Model Name**: not model-specific — reproduces with any model that
streams long `StreamingDeltaEvent` runs; observed with local Qwen3.6
27B/35B-A3B via LM Studio

**Operating System**: Linux

**Browser**: Chromium-based (KDE default), current stable

**Logs and Error Messages**

Root cause identified directly in source, not just inferred from symptoms:
- `frontend/src/contexts/conversation-websocket-context.tsx`: the WebSocket
  message handler calls `addEvent(event)` once per incoming event, including
  once per `StreamingDeltaEvent` (i.e. once per generated token during
  streaming).
- `useEventStore.addEvent` / `handleEventForUI` does
  `const newUiEvents = [...uiEvents]` — a full copy of the accumulated UI
  event list — on every single call, then merges/replaces the last element.
  Zustand requires a new array reference to trigger re-renders, which is why
  the copy exists, but doing it per-token rather than per rendered-frame is
  the actual problem.

**Screenshots and Additional Context**

Candidate fix implemented and typechecked (not yet confirmed live in-browser
with a before/after profile): a small client-side batching layer,
`frontend/src/hooks/use-batched-event-dispatch.ts`, wraps the raw `addEvent`
dispatcher so consecutive `StreamingDeltaEvent`s are merged in-memory (using
the same `mergeStreamingDeltaEvent` concatenation the store already uses)
and flushed to the store on a fixed timer (120ms) rather than per token.
Non-delta events always flush any pending delta first, preserving event
order. Wired into `conversation-websocket-context.tsx` for both the main and
planning-agent sockets; left the bulk history-preload path (on conversation
open/reconnect) untouched since that's a one-time batch, not a streaming hot
path.

Verified with `npx tsc --noEmit` (no type errors). Not yet verified with an
actual before/after browser profiling session — that would be the right
next step before proposing this as a PR (a maintainer would reasonably want
to see the actual profiler flamegraph difference, not just "it typechecks"),
and per the contribution guide, bigger frontend changes should be raised in
Slack `#proj-gui` first.
