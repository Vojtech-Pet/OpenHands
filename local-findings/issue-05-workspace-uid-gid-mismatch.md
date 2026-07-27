<!--
READY TO SUBMIT: copy the section below the line into
https://github.com/OpenHands/OpenHands/issues/new?template=bug_template.yml
Field labels below match that template exactly. This could also reasonably
be filed as a docs/feature request rather than a bug -- judgment call left
to whoever submits it.
-->

# [Bug]: Sandbox container uid (10001) vs. host uid mismatch breaks bind-mounted workspace writes and host-side git

**Bug Description**

The `agent-server` Docker image runs as uid 10001 inside the container. When
a host directory is bind-mounted in as the workspace (`SANDBOX_VOLUMES`),
any files/directories the agent creates are owned by uid 10001 on the host
filesystem too (bind mounts share the same inode ownership, container UID
namespace notwithstanding, unless user namespace remapping is configured).
This produces two concrete, separate problems for anyone running the
container against a real host project directory (a very common local
setup, not an edge case):

1. Permission denied inside the agent's own run, if the mounted directory
   (or a parent) has restrictive host permissions that don't already grant
   uid 10001 write access — the agent can fail to create its own working
   directories (e.g. a project-local scratch/state directory) with no
   obvious cause from the agent's own perspective.
2. Host-side git commands fail with "detected dubious ownership" the moment
   the agent has written anything to the repo (e.g. its own scratch
   directory, or files during a task) via uid 10001, because Git (correctly,
   per its own security model) refuses to operate in a repo it doesn't own
   unless the host user explicitly adds a `safe.directory` exception.

**Expected Behavior**

At minimum, this should be clearly documented as a setup requirement (e.g.
"the mounted workspace must be writable by uid 10001, and you will need
`git config --global --add safe.directory <path>` on the host, or run git
via the container instead"). Ideally, the container would support an easy
user-namespace-remap or `--user $(id -u):$(id -g)` override so the
in-container agent uid matches the host user, avoiding both problems
entirely for the common single-user local case.

**Actual Behavior**

Neither issue surfaces with an actionable error message pointing back at
the uid mismatch — `Permission denied` looks like an application bug from
inside the agent, and git's dubious-ownership message doesn't mention
Docker/uid 10001 at all, so tracing either back to "the container runs as
a different uid than my host user" takes real investigation.

**Steps to Reproduce**

1. Bind-mount a normal host project directory (owned by a regular host
   user, not uid 10001) into the sandbox via `SANDBOX_VOLUMES`.
2. Have the agent create a subdirectory for its own working state inside
   that mounted path (e.g. a `.agents_tmp/`-style directory) and write
   files there.
3. On the host, run any `git` command against that same repository —
   observe `fatal: detected dubious ownership in repository at '<path>'`.
4. Separately, if the mounted parent directory's permission bits don't
   already allow uid 10001 to create new entries (default `755` owned by a
   different uid does allow this for world-writable-adjacent cases, but
   more restrictive host setups will not) — the agent's own writes fail
   with `Permission denied`, surfacing as a confusing in-agent error with
   no indication the actual cause is a host/container uid mismatch.

**OpenHands Installation Method**: Local GUI (Docker web interface) /
Development workflow

**OpenHands Version**: `ghcr.io/openhands/agent-server:1.37.1-python`

**Model Name**: not applicable — independent of LLM/model configuration

**Operating System**: Linux (host), standard non-root user, project
directory owned by that user; `SANDBOX_VOLUMES=/path/on/host:/workspace/project:rw`

**Logs and Error Messages**

```
fatal: detected dubious ownership in repository at '/path/on/host'
To add an exception for this directory, call:

	git config --global --add safe.directory /path/on/host
```

**Screenshots and Additional Context**

Workarounds used locally (not fixes):
- `setfacl -R -d -m u:10001:rwX <project-dir>` to grant the container uid
  write access via a default ACL, without changing host ownership.
- All host-side git operations against the affected repo run through a
  throwaway `docker run ... git -c safe.directory=/workspace/project ...`
  container instead of touching host git config, since the user in this
  case explicitly declined adding a global `safe.directory` exception.

Suggested fix / discussion points:
- Document this explicitly in the self-hosting / Docker setup guide.
- Consider a `--user` / uid-remap flag or documented pattern for matching
  the container uid to the host user in local, single-user setups, which is
  probably the most common local-development configuration.
