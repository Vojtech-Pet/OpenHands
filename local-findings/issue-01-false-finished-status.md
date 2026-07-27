<!--
READY TO SUBMIT: copy the section below the line into
https://github.com/OpenHands/OpenHands/issues/new?template=bug_template.yml
Field labels below match that template exactly.
-->

# [Bug]: `execution_status` reports "finished" even when the agent never produced real output or called `finish`

**Bug Description**

A conversation's `execution_status` (`GET /api/v1/app-conversations/{id}`,
also broadcast as part of `ConversationStateUpdateEvent`) transitions to
`"finished"` as soon as the agent's turn ends — including when that turn was
plain assistant text with no tool call at all, and specifically no call to
the `finish` tool. A client that treats `"finished"` as "the task is done"
will report success on a run that produced nothing.

**Expected Behavior**

`execution_status` should only report `"finished"` once the agent has
explicitly signalled completion (a genuine `ActionEvent` with
`tool_name == "finish"`), or the API should expose a separate field so
clients can distinguish "the model's turn ended" from "the agent explicitly
finished."

**Actual Behavior**

`"finished"` is used for both cases indistinguishably. From the event stream
alone, the only way a client can tell these apart is to scan the full event
history for an `ActionEvent` with `tool_name == "finish"` and treat
`"finished"` without one as unverified.

**Steps to Reproduce**

1. Start a conversation with the Planning agent type (`glob`, `grep`,
   `planning_file_editor`, `finish`, `think` — no terminal) and a long,
   open-ended task ("analyze the project and plan X").
2. Let it run with `native_tool_calling: false` (see the companion issue
   about that setting — this status seems more likely to occur with
   tool-call parsing disabled, since the model is more prone to emitting
   free text that merely resembles a tool call instead of a real one).
3. In the case we hit, the model's final turn (after ~30 minutes of
   discovery) was a plain-text message that read like a plan summary but was
   not a call to `planning_file_editor` and not a call to `finish` —
   `tool_calls: null` on that `MessageEvent`.
4. Poll `GET /api/v1/app-conversations/{id}` — `execution_status` reads
   `"finished"`.
5. Check the artifact the task was supposed to produce (in our case
   `.agents_tmp/PLAN.md`) — it does not exist / was never written.

**OpenHands Installation Method**: Development workflow (editable install of
`openhands-sdk` / `openhands-tools` / `openhands-agent-server` against a
local git checkout; sandbox execution via the
`ghcr.io/openhands/agent-server:1.37.1-python` Docker image)

**OpenHands Version**: `openhands-sdk` / `openhands-tools` /
`openhands-agent-server` 1.37.1 (repo commit `652503005093`, 2026-07-24).
Note: the classic `openhands-ai` app package in the same checkout reports
1.11.0 — this finding is specifically about the V1 SDK/agent-server stack.

**Model Name**: local Qwen3.6-35B-A3B (HauhauCS "Uncensored Aggressive"
quant, Q4_K_M) served via LM Studio's OpenAI-compatible endpoint,
`trainedForToolUse: true`

**Operating System**: Linux

**Logs and Error Messages**

Event stream shape for a genuine finish (for contrast — this is what the
client-side workaround checks for), captured live in a follow-up test run
against the same server:

```json
{"kind": "ActionEvent", "source": "agent", "tool_name": "finish", ...}
{"kind": "ObservationEvent", "source": "environment", "tool_name": "finish", ...}
```

In the false-finish case, no event of `kind == "ActionEvent"` with
`tool_name == "finish"` exists anywhere in that conversation's event
history, yet `execution_status` still read `"finished"`.

**Screenshots and Additional Context**

Suggested fix / discussion points:
- Expose a boolean or enum distinguishing "turn ended, no explicit finish"
  from "agent called finish" — either as a new field on `AppConversation`,
  or by having `execution_status` itself carry a third value (e.g.
  `"finished_unverified"` vs `"finished"`).
- Alternatively, document explicitly in the API reference that clients must
  scan for a `finish` `ActionEvent` themselves to distinguish these cases,
  since this isn't currently mentioned anywhere obvious.

Client-side workaround implemented in a companion desktop-client prototype:
a `CompletionTracker` that watches the event stream for a genuine
`ActionEvent(tool_name="finish")` per run, and resolves `"finished"` to
either `COMPLETED` or `FINISHED_UNVERIFIED` accordingly (`core/completion.py`).
This is a workaround, not a fix — the false status is still what the server
reports.
