<!--
READY TO SUBMIT: copy the section below the line into
https://github.com/OpenHands/OpenHands/issues/new?template=feature_request.yml
-->

# [Feature]: allow selecting which workspace/project a conversation mounts, via a server-side allow-list of named project roots

**Problem or Use Case**

There is currently no way to choose which host directory a conversation's
sandbox mounts as its workspace, except by setting `SANDBOX_VOLUMES` when
the agent-server process itself starts, which then applies to every
sandbox that server creates for as long as it runs. Confirmed by reading
`DockerSandboxService.start_sandbox()` directly (not inferred): it builds
`volumes` from `self.mounts`, a constructor-time attribute, and neither
`start_sandbox(sandbox_spec_id, sandbox_id)` nor `SandboxSpecInfo` (image,
command, env, working_dir) carry any mount override. `AppConversationStartRequest`
has no workspace/mount field either.

This is a structural limitation, not just a missing convenience, for
several real use cases:
- **Desktop/native clients**: a client naturally wants "open project X" to
  be a per-conversation choice, the way an IDE switches projects without
  restarting the whole application. Today that requires editing an env var
  and restarting the entire agent-server process.
- **Multi-project interfaces**: a UI that lists several local projects and
  lets a user start a conversation against whichever one they pick has no
  API surface to act on that choice.
- **Parallel conversations against different projects**: since the mount
  set is fixed for the whole server process, you cannot run one
  conversation against project A and another against project B from the
  same running server — every sandbox that server creates shares the same
  mounts.
- **Project isolation**: there's no way to scope a single conversation to
  see only one project's files; if multiple projects are mounted, every
  sandbox sees all of them.
- **Multi-user servers**: a server used by more than one person/team has no
  way to give different conversations different, isolated workspaces —
  everyone gets whatever the operator mounted at startup.

**Proposed Solution**

**Not** proposing that the API accept an arbitrary client-supplied host
path — that would be a real security regression for multi-tenant
deployments (OpenHands Cloud): a caller who isn't the server operator
getting to name any host path would be an host-filesystem escape, not a
convenience feature. The trust boundary that matters is "who configured
the mount," not "who started the conversation," and those are different
people in a multi-tenant deployment.

Instead: the server operator pre-registers a set of named, allow-listed
project roots (e.g. an extension of `SandboxSpecInfo`, or a small new
`WorkspaceRoot { name, host_path }` registry, configured the same way
`SANDBOX_VOLUMES` is today — an operator-controlled, deploy-time
allow-list). At conversation-creation time, the client supplies the *name*
of a pre-registered root (not a path), and the server resolves it to the
actual mount internally. A single-user local deployment can register as
many named roots as the user wants (effectively "one per project"); a
multi-tenant deployment can register none, or scope names per API key/user,
with the existing fixed-mount behavior remaining the default when no name
is given (fully backward compatible).

**Alternatives Considered**

- Restarting the agent-server process with different `SANDBOX_VOLUMES` per
  project: works, but means no two projects can be active at once from the
  same server, and switching projects requires tearing down every existing
  conversation.
- Running one agent-server process per project (each with its own fixed
  mount): works around the limitation at the cost of one full server
  process (and port, and resource footprint) per project, which doesn't
  scale for a desktop client meant to manage many small projects.
- Accepting an arbitrary client-supplied host path directly: rejected —
  see the security note above.

**Priority / Severity**: High — Significant impact on productivity (blocks
building a proper multi-project desktop/GUI client without either
per-project server processes or manual restarts)

**Estimated Scope**: Large - Significant feature requiring architecture
changes (touches `SandboxSpecInfo`/registry, `start_sandbox()`,
`AppConversationStartRequest`, and whatever admin/config surface registers
the allow-list)

**Feature Area**: File system / Workspace management

**Technical Implementation Ideas**

- Extend `SandboxSpecInfo` (or add a sibling model) with a named,
  operator-registered root: `{ name: str, host_path: str }`, configured at
  deploy time the same way `SANDBOX_VOLUMES` is today (env var, config
  file, or a small admin API gated separately from conversation creation).
- `AppConversationStartRequest` gains an optional `workspace_name: str`
  field; when set, the server resolves it against the registry and mounts
  that root; when unset, falls back to the current fixed-mount behavior
  (fully backward compatible).
- `DockerSandboxService.start_sandbox()` accepts an optional resolved mount
  override, applied only for that sandbox instead of `self.mounts`.
- Reject (400/403) any `workspace_name` not present in the registry — no
  path ever comes from the client, only a name looked up server-side.

**Additional Context**

Raised while building a native desktop client against the Agent Server API
locally; every other MVP capability (create conversation, send message,
stream events, pause/interrupt, workspace-permission preflight) has a
working API surface — this is the one piece that has none.
