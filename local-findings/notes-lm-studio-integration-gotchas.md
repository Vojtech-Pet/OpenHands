# LM Studio integration gotchas (not OpenHands bugs — environment notes for other local-model users)

Kept here only because they cost real debugging time and are easy for
anyone else running OpenHands against a local, VRAM-constrained LLM server
to hit. Not actionable as OpenHands issues; these are LM Studio behaviors.

## 1. LM Studio's JIT-loading + auto-evict does not reliably swap models on request

When a client sends a chat-completion request naming a model that isn't
currently loaded, LM Studio does **not** reliably load it and does **not**
return an error if it can't — in our testing, it silently served whatever
model *was* already loaded instead, with the response's own `"model"` field
still (misleadingly) echoing back the requested model id in some cases.
Confirmed by directly inspecting `/v1/chat/completions` responses while a
different model than the one requested was loaded.

**Workaround used**: an explicit small HTTP helper that calls LM Studio's own
CLI (`lms unload --all` then `lms load <key> --identifier <id>`) before
switching, rather than trusting JIT-loading to do the right thing.

## 2. A model swap does not cancel requests already in flight against the old model

If a request was submitted while model A was loaded, and the operator then
unloads A and loads model B, that original request does not fail cleanly —
it appears to remain queued against the server (observed via `lms ps`
showing `queued: N` for the *new* model, N counting stale in-flight requests
from before the swap), consuming the server's single processing slot
(`parallel: 1` in our config) and delaying genuinely new requests by
however long the stale one takes to resolve or time out. Combined with
issue #3 in the main list (OpenHands not tearing down sandbox containers on
conversation delete), this compounds: an orphaned sandbox container can keep
a stale request alive indefinitely, silently starving every other
conversation sharing that LLM server.

**Workaround used**: track and explicitly stop/delete any old
conversation (and its underlying container, since delete alone doesn't do
this — see issue #3) before assuming a fresh model swap gives a clean
slate.
