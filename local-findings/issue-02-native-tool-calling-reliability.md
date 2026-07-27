<!--
READY TO SUBMIT: copy the section below the line into
https://github.com/OpenHands/OpenHands/issues/new?template=bug_template.yml
Field labels below match that template exactly.
This one might be better framed as a feature_request.yml instead (defaulting/
surfacing a setting) rather than bug_template.yml -- judgment call left to
whoever submits it; content is the same either way.
-->

# [Bug]: `native_tool_calling: false` (current effective default) is dramatically less reliable/slower than `true` for a tool-call-trained local model

**Bug Description**

With `agent_settings.llm.native_tool_calling` set to its apparent default of
`false`, a local model with `trainedForToolUse: true` (per LM Studio) took
30+ minutes on a moderately open-ended Planning task and never produced a
usable result (see the companion false-"finished"-status issue — it
"finished" with no real output). Setting `native_tool_calling: true` on the
exact same model, same task, same hardware dropped this to ~6 minutes with a
complete, correct result on the first attempt. This is a large enough gap
that it's worth the project either defaulting native tool calling to `true`
when the underlying model advertises tool-use training, or making the
tradeoff much more visible in the settings UI / docs.

**Expected Behavior**

Either:
- `native_tool_calling` defaults to `true` (or is auto-detected) for
  backends that report native function-calling support, since the
  text-based fallback parser is clearly the less reliable path for such
  models, or
- The settings UI makes the reliability tradeoff explicit ("your model
  supports native tool calling — recommended: on") rather than leaving it
  as a buried LLM-config boolean most users won't know to flip.

**Actual Behavior**

`native_tool_calling` is a low-visibility boolean with no guidance, defaults
to `false`, and the failure mode when it's wrong (garbled/hallucinated tool
calls, false completion status, multi-minute stalls) gives no signal
pointing back at this setting — a user would have no reason to suspect it.

**Steps to Reproduce**

1. Configure an OpenAI-compatible custom endpoint (e.g. LM Studio) with a
   model that supports native function-calling.
2. Leave `native_tool_calling` at its default (`false`) and give the agent a
   task requiring several rounds of exploration (e.g. "analyze this
   repository and produce a plan for X").
3. Observe frequent malformed/hallucinated tool calls (in our case, the
   model called a nonexistent tool named `view` — plausibly a bias from
   `text_editor`-style tool schemas seen in its base training — it
   self-corrected the next turn, but this kind of parse-and-retry churn was
   common), slow overall progress, and in the worst case the false-"finished"
   behavior described in the companion issue.
4. Set `native_tool_calling: true`, restart the conversation with the same
   task, same model.
5. Observe a much more direct, low-churn run to a correct, verifiable
   result.

**OpenHands Installation Method**: Development workflow (editable install
against a local git checkout)

**OpenHands Version**: `openhands-sdk` / `openhands-tools` /
`openhands-agent-server` 1.37.1 (repo commit `652503005093`, 2026-07-24)

**Model Name**: local Qwen3.6 (both a 27B dense and a 35B-A3B MoE variant
showed the same qualitative effect), HauhauCS "Uncensored Aggressive"
quants, served via LM Studio's OpenAI-compatible endpoint,
`trainedForToolUse: true`. Config field: `~/.openhands/settings.json` →
`agent_settings.llm.native_tool_calling`; only this field changed between
the two runs, `agent_settings.llm.model` was identical.

**Operating System**: Linux

**Logs and Error Messages**

Qualitative timing from repeated same-task runs, same hardware:
- `native_tool_calling: false`: ~30+ minutes, no usable output, ended in the
  false-"finished" state (see companion issue)
- `native_tool_calling: true`: ~6 minutes, complete and correct output,
  first attempt

We don't have machine-readable profiling logs saved from that specific run
(noticed during interactive testing, not a benchmark harness) — if pressed
on this upstream, it would be worth re-running with `log_completions: true`
to attach raw request/response logs for both settings.

**Screenshots and Additional Context**

Suggested fix / discussion points:
- Surface `native_tool_calling` more prominently in settings when a custom
  OpenAI-compatible endpoint is configured, since this is exactly the case
  (self-hosted / local models) where it matters most and where users are
  least likely to already know about it.
- Consider probing the endpoint's `/v1/models` response (LM Studio and
  others expose a `trainedForToolUse`-style capability flag) to suggest or
  auto-set this.
