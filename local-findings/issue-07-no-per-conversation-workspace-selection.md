<!--
This one is more of a feature request than a bug -- consider filing under
feature_request.yml, or raising in Slack #proj-gui / #proj-runtime first per
CONTRIBUTING.md, since it's an architectural addition, not a report.
-->

# [Feature Request]: no way to select which host directory to mount per conversation -- workspace volumes are fixed at server startup

**Summary**

`POST /api/v1/app-conversations` (and the underlying
`DockerSandboxService.start_sandbox()`) has no parameter for which host
directory to bind-mount as the workspace. The mount is entirely determined
by `SANDBOX_VOLUMES`, read once when the agent-server process itself
starts, and baked into every sandbox it creates thereafter. Confirmed by
reading the actual volume-construction code, not inferred:

```python
# docker_sandbox_service.py, start_sandbox()
volumes = {
    mount.host_path: {'bind': mount.container_path, 'mode': mount.mode}
    for mount in self.mounts
}
```

`self.mounts` is a `DockerSandboxService` constructor-time attribute.
`start_sandbox(sandbox_spec_id, sandbox_id)` takes no mounts/volumes
argument at all. `SandboxSpecInfo` (what `sandbox_spec_id` selects between)
only carries `id` (Docker image), `command`, `initial_env`, and
`working_dir` — no mount information either.

**Why this matters for a desktop client**

A desktop client naturally wants "open project X" to be a per-conversation
choice, the same way an IDE lets you switch projects without restarting the
whole application. As things stand, switching which local project OpenHands
can see requires changing the `SANDBOX_VOLUMES` environment variable and
restarting the entire agent-server process -- there's no way to do this
from a running client, and no way to run conversations against two
different local projects concurrently from the same server instance
(everything the server starts shares the same fixed mount set).

**Expected Behavior**

Either:
- `AppConversationStartRequest` (or an equivalent) accepts a per-request
  mount/workspace path, applied only to that conversation's sandbox
  container, or
- `SandboxSpecInfo` carries mount information, so different "specs" can
  represent different pre-registered projects and `sandbox_spec_id`
  becomes the mechanism for "which project" as well as "which image."

**Actual Behavior**

Workspace selection is a deploy-time environment variable, not a runtime,
per-conversation, or per-client API surface.

**Additional Context**

Not asserting this must change -- there are reasonable security/isolation
arguments for keeping mounts server-operator-controlled rather than
client-selectable (a client-supplied arbitrary host path would need careful
scoping/allow-listing to avoid an obvious traversal/access risk). Raising
this primarily to confirm whether it's an intentional constraint or an area
open to a scoped addition (e.g. a server-side allow-list of nameable
project roots that a client could pick from by name, without accepting
arbitrary client-supplied paths).
