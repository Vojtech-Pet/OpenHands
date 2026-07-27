# Planning agent may not be told it lacks terminal access, risking fabricated git info

## Status: soft finding — needs verification against the stock (unmodified) prompt

## Summary

The Planning agent type (`AgentType.PLAN`) only has read-only tools
(`glob`, `grep`, `planning_file_editor`, `finish`, `think`) — no `terminal`.
When we instructed a Planning agent (via a **custom** system-prompt addition
on our side) to record the current git branch and commit as part of its
output, it attempted to comply by writing something like
`(run \`git branch --show-current\`)` into the output as a placeholder,
rather than recognizing outright that the command couldn't be run. This
happened with our own added instruction text, not the SDK's stock prompt —
so we can't confirm from this alone whether the stock Planning-agent prompt
already tells the model plainly "you have no terminal, do not attempt git or
shell commands." If it doesn't, the same failure mode (a model asked,
directly or by inference from a task description, to report something that
requires a tool it doesn't have) seems generally reproducible.

## What we actually observed

- Our custom instruction (added to test a Plan→Code handoff scheme) asked
  the Planning agent to determine the repository's current branch/commit.
- First attempt: the model produced a textual placeholder resembling a
  shell command instead of either (a) omitting the field, or (b) stating
  plainly that it lacks the tool to determine this.
- Fix applied on our side: don't ask the Planning agent for this at all;
  instead have it write a literal `TBD` sentinel, and have the *Code* agent
  (which does have a terminal) fill in the real values when picking up the
  plan. This worked reliably once implemted.

## Why this might still be worth raising upstream

If the stock Planning-agent system prompt doesn't explicitly enumerate "you
do not have terminal/git access, do not attempt to run commands, do not
guess at their output" as a hard constraint, then any caller who writes a
task description implying git/shell access (a very natural thing to write,
since most task descriptions aren't hand-checked against the current
agent's toolset) could hit the same fabrication risk. Since the toolset is
fully known ahead of time for a given agent type, this seems like something
the SDK could guard against systematically (e.g. auto-injecting a
capability-boundary statement derived from the actual registered tools, not
from prose that has to be kept in sync by hand).

## Suggested discussion point (not a confirmed bug)

Ask the maintainers: does the shipped Planning-agent prompt already state
its tool limitations explicitly? If yes, this note is moot (our failure was
self-inflicted by our own added instruction). If no, consider generating
that boundary statement from the agent's actual tool list rather than
leaving it to prompt authors to remember.
