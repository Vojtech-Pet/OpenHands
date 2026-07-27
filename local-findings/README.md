# OpenHands findings — local testing session (2026-07-27)

Collected while running OpenHands locally against LM Studio (single RTX 4090,
24GB VRAM) with two Qwen3.6 models swapped in/out of the same GPU, using the
native OpenHands Plan/Code mode toggle plus custom hooks/subagents on top of
the standard `.openhands/` extension points.

**Environment common to all issues below** (repeat per-issue only where it
differs):
- OpenHands version: **1.37.1** (`openhands-sdk`, `openhands-tools`,
  `openhands-agent-server`, `openhands_ai` all pinned to 1.37.1)
- Deployment: local, `openhands-agent-server` as an editable install
  (`pip install -e`) pointing at a local git checkout; sandbox execution via
  `ghcr.io/openhands/agent-server:1.37.1-python` Docker image, uid 10001
  inside the container
- LLM backend: LM Studio (OpenAI-compatible endpoint), reached from the
  sandbox container at `http://172.17.0.1:1234/v1`
- Models: two local Qwen3.6 GGUF quants (HauhauCS "Uncensored Aggressive"),
  both with `trainedForToolUse: true` reported by LM Studio:
  - `qwen3.6-27b-a3b`-class dense 27B, Q4_K, ~17GiB
  - `qwen3.6-35b-a3b` MoE 35B-A3B, Q4_K_M, ~22GiB
  - Both cannot fit in VRAM simultaneously; models are swapped via LM
    Studio's CLI (`lms load`/`lms unload`), not left resident together.

## Index

| # | File | Summary | Confidence |
|---|---|---|---|
| 1 | [issue-01-false-finished-status.md](issue-01-false-finished-status.md) | `execution_status` reports `"finished"` even when the agent's last turn was plain text with no `finish` tool call and no real task output | High — reproduced, mechanism understood |
| 2 | [issue-02-native-tool-calling-reliability.md](issue-02-native-tool-calling-reliability.md) | `native_tool_calling: false` (current default in the settings UI) is dramatically less reliable/slower than `true` for a tool-use-trained local model | High — reproduced with a controlled before/after |
| 3 | [issue-03-sandbox-not-torn-down-on-delete.md](issue-03-sandbox-not-torn-down-on-delete.md) | `DELETE /api/v1/app-conversations/{id}` does not stop the underlying sandbox Docker container | High — reproduced live, verified via `docker ps` |
| 4 | [issue-04-frontend-event-store-performance.md](issue-04-frontend-event-store-performance.md) | Web frontend dispatches one store update per streamed token; the store does an O(n) array copy per update, causing the tab to become sluggish/unresponsive on long runs | Medium-high — root cause identified in source, fix implemented and typechecked, not yet confirmed by a user in a live browser session |
| 5 | [issue-05-workspace-uid-gid-mismatch.md](issue-05-workspace-uid-gid-mismatch.md) | Bind-mounted host workspace + container uid 10001 causes `Permission denied` on agent-created directories, and host-side git treats the repo as "dubious ownership" | High — reproduced, worked around locally |
| 6 | [issue-06-missing-single-conversation-get-endpoint.md](issue-06-missing-single-conversation-get-endpoint.md) | `send-message`'s own docstring references a `GET /api/v1/app-conversations/{id}` endpoint that doesn't exist; comes with a working patch (see fork branch) | High — reproduced, fixed, fix verified for routing-order correctness |
| 7 | [issue-07-no-per-conversation-workspace-selection.md](issue-07-no-per-conversation-workspace-selection.md) | No API parameter to choose which host directory to mount per conversation — `SANDBOX_VOLUMES` is fixed at server startup, confirmed by reading `DockerSandboxService.start_sandbox()` directly | High — confirmed in source; this is a feature request, not a bug |
| 8 | [notes-planning-agent-capability-mismatch.md](notes-planning-agent-capability-mismatch.md) | The Planning agent's system prompt (as shipped) does not explicitly state that it has no terminal/git access, risking fabricated branch/commit info | Medium — observed with a **customized** planning prompt; stock prompt not independently re-checked |
| 9 | [notes-lm-studio-integration-gotchas.md](notes-lm-studio-integration-gotchas.md) | Not an OpenHands bug per se, but two sharp integration edges worth documenting for anyone running OpenHands against a local, VRAM-constrained LLM server | Informational |

## Suggested next steps (per the contribution workflow)

1. File issues 1–3 and 5 as separate GitHub issues on `OpenHands/OpenHands` (or the SDK repo, `OpenHands/software-agent-sdk`, for anything that's actually SDK-side — see each file's "Where this likely lives" note) — each is self-contained, has clear repro steps, and doesn't require judgment calls from maintainers.
2. Issue 4 (frontend perf) already has a candidate fix; that one is a good PR candidate once issue 4's repro is confirmed against a stock build (our fix was validated with `tsc`, not yet with a maintainer-facing before/after profile).
3. Note 6 is soft — it may be intentional (planning agents are expected to be given a capability-aware prompt by the *caller*, not by the SDK itself). Worth a clarifying question in the issue rather than asserting it's a bug.
4. Note 7 isn't actionable upstream at all — it's an LM Studio behavior, kept here only for anyone else hitting the same local-model-swap trap.
5. The bigger idea from this session (a native desktop client against the Agent Server API) is exactly the kind of "bigger change" the contribution guide flags — raise it as a discussion/issue before investing real time, per the guide.
