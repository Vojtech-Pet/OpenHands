<!--
READY TO SUBMIT: copy the section below the line into
https://github.com/OpenHands/OpenHands/issues/new?template=bug_template.yml
Field labels below match that template exactly.
-->

# [Bug]: `DELETE /api/v1/app-conversations/{id}` does not stop the underlying sandbox container

**Bug Description**

Deleting an app-conversation via the REST API removes it from
`GET /api/v1/app-conversations/search`, but the Docker container backing its
sandbox (`oh-agent-server-*`) keeps running indefinitely afterward. Over a
long working session this leaves an accumulating set of orphaned
containers, each still capable of making outbound LLM requests (and, in our
case, more than one of these orphans was still actively competing for a
single-slot local LLM server's request queue after its conversation had
already been deleted).

**Expected Behavior**

Deleting the (only) conversation attached to a sandbox should stop and
remove that sandbox's container, unless the sandbox is explicitly meant to
be reusable/shared across conversations (in which case: (a) that should be
discoverable via the API, e.g. a `sandbox_id` shared across multiple
`AppConversation` records, and (b) there should be a separate, documented
call to actually decommission a sandbox).

**Actual Behavior**

Confirmed three separate times in the same working session: conversations
were independently deleted via the REST API, and each time `docker ps`
showed their `oh-agent-server-*` container still `Up` minutes to hours
later, with no further API activity against them. The only way found to
actually stop them was `docker stop <container_id>` directly, bypassing the
API entirely.

This matters in practice: one of the orphaned containers was still
mid-conversation (its own agent loop hadn't reached a terminal state) and
was actively issuing requests to the shared local LLM server, competing for
its single-request-at-a-time queue with a brand new, unrelated conversation
— which looked, from the new conversation's point of view, like an
unexplained multi-minute stall until traced back to the orphan.

**Steps to Reproduce**

1. Start a conversation (`POST /api/v1/app-conversations`, poll the start
   task to `READY`). Note the `sandbox_id` and confirm a matching
   `oh-agent-server-<id>` container is running (`docker ps`).
2. `DELETE /api/v1/app-conversations/{conversation_id}` → `200`.
3. `docker ps` again — the container from step 1 is still running.

**OpenHands Installation Method**: Development workflow (editable install
against a local git checkout)

**OpenHands Version**: `openhands-sdk` / `openhands-tools` /
`openhands-agent-server` 1.37.1 (repo commit `652503005093`, 2026-07-24),
`DockerSandboxService`

**Model Name**: not applicable — this is independent of which LLM/model is
configured

**Operating System**: Linux

**Logs and Error Messages**

```
$ docker ps --format "{{.Names}}\t{{.Status}}" | grep oh-agent-server
oh-agent-server-6M3jzzumLAbzRJ6eymYDO    Up About an hour
```
(captured well after `DELETE` had already returned `200` for that
container's conversation)

**Screenshots and Additional Context**

Suggested fix / discussion points:
- If sandboxes are 1:1 with conversations by design: have
  `DELETE /api/v1/app-conversations/{id}` actually stop (and by default
  remove) the container.
- If sandboxes are meant to be reusable/pooled: expose that relationship in
  the API response (which conversations share a `sandbox_id`) and provide
  an explicit sandbox-lifecycle endpoint, since right now a caller has no
  way to know a container is still alive short of shelling out to
  `docker ps`.
- At minimum, document the actual lifecycle so integrators don't assume
  `DELETE` is a complete cleanup operation (we didn't, and it cost real
  debugging time tracing an unrelated "why is this new conversation
  stalled" symptom back to a deleted-but-still-running old one).
