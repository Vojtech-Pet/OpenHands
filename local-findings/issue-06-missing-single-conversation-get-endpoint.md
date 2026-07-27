<!--
READY TO SUBMIT: copy the section below the line into
https://github.com/OpenHands/OpenHands/issues/new?template=bug_template.yml
This one comes with a working patch (see the accompanying branch on the
fork) rather than just a report.
-->

# [Bug]: no `GET /api/v1/app-conversations/{id}` endpoint exists, but the `send-message` endpoint's own docstring references it

**Bug Description**

`app_conversation_router.py`'s `send_message_to_conversation` endpoint
documents an "Alternative Approach" of calling the agent server directly
using `conversation_url` obtained from `` GET /api/v1/app-conversations/{id} ``
— but no such single-item GET route is actually registered. The only
existing read routes are `GET /app-conversations/search`,
`GET /app-conversations/count`, and `GET /app-conversations` (batch, via
`?ids=...`). A client following the docstring literally gets a 404/405.

**Expected Behavior**

Either the documented single-item `GET /api/v1/app-conversations/{id}`
endpoint exists, or the docstring is corrected to point at the batch form
that actually works (`GET /api/v1/app-conversations?ids=<id>`).

**Actual Behavior**

The endpoint doesn't exist; the docstring is simply wrong for anyone
implementing a client by reading the API's own inline documentation (which
is exactly how we found this — writing a minimal REST client against this
API from scratch).

**Steps to Reproduce**

1. Read the docstring on `POST /api/v1/app-conversations/{id}/send-message`
   in `openhands/app_server/app_conversation/app_conversation_router.py`.
2. Try `GET /api/v1/app-conversations/{some-real-id}` as it describes.
3. Observe there is no matching route (only `/search`, `/count`, and the
   bare `/app-conversations?ids=...` batch form exist for reads).

**OpenHands Installation Method**: Development workflow (editable install
against a local git checkout)

**OpenHands Version**: `openhands-sdk` / `openhands-tools` /
`openhands-agent-server` 1.37.1 (repo commit `652503005093`, 2026-07-24)

**Model Name**: not applicable

**Operating System**: Linux

**Screenshots and Additional Context**

We implemented and locally verified a fix: add a
`` @router.get('/{conversation_id}') `` handler returning a single
`AppConversation` (404 if not found), and correct the docstring back to
reference it. **Route ordering matters here** — a wildcard single-segment
route like `/{conversation_id}` must be registered *after* other
single-segment literal routes under the same prefix (we found `/start-tasks`
specifically, a batch-get endpoint with no sub-path) or it will shadow them:
FastAPI/Starlette matches routes in registration order, and
`{conversation_id}: UUID` will match the literal segment `"start-tasks"`
first, fail UUID coercion, and return a 422 rather than ever reaching the
real batch handler. Confirmed via Starlette's own `Route.matches()` in
isolation (not just live testing) before and after fixing the placement.
Verified correct routing for `/start-tasks`, `/start-tasks/search`,
`/start-tasks/count`, `/search`, `/count`, and a real UUID path all
resolving to their intended handlers after the fix.
