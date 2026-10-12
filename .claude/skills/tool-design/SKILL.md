---
name: tool-design
description: Use when designing what an agent tool should do and return — its status contract, what decision it owns vs delegates to the LLM, whether it should gate, and how it fails — as opposed to how to author the *.tool.ts file. Use when a tool exposes an LLM-chosen value that should be derived, throws instead of returning an error, or trusts an LLM-supplied argument. Use when choosing between writing a plugin tool and equipping a remote MCP one. Complements plugin-authoring (mechanics) and agent-prompt-design (where a behaviour lives).
---

# Tool design: the tool owns the decision, the prompt reacts to the status

## Overview

A tool is a **typed, deterministic capability**. Its job is to *own the decision that must be correct* and hand the LLM a **status** to react to — not to ask the LLM to make the decision and then trust the answer. This skill is about *what a tool should do and return*; for `defineTool` mechanics, the serialized JSON-Schema boundary, and loading, see `plugin-authoring`.

**Core principle:** if getting it wrong has a cost, decide it in code and return a status. The prompt branches on the status; it never re-derives the decision.

## The status contract

A tool returns structured data the prompt was written against — typically `{ status, ... }` — or, for the error case, a plain `"Error: ..."` string. The prompt reads `status` and reacts; it does not recompute the outcome from raw fields.

- **Errors are returned as data, never thrown to the LLM.** Return `"Error: ..."` (or `{ status: "error" }`) so the agent decides whether to retry or degrade gracefully. Evidence: an agent-to-agent invocation mechanism *always* returns errors as a result string, never throws — a thrown error would crash the caller's turn instead of letting its LLM recover.
- **Keep the status set small and closed.** The prompt reacts to a handful of named statuses, not to open-ended prose. New status → new prompt branch.

## Own the decision in code

The most valuable thing a tool does is take a decision *away* from the LLM.

- **Derive, don't expose.** If a value is a function of state, compute it inside the tool; do not expose it as an enum the LLM picks. Evidence: an agent exposed a service-type choice to the model as an enum; a user's phrasing produced the wrong branch and the wrong downstream action. Fix: derive the value inside the tool from the record's own data, and remove the choice from the model. Deterministic outputs (e.g. a scripted greeting) are computed by code and emitted verbatim.
- **Gate inside the tool.** Eligibility checks belong in the tool, not in prose: a tool decides whether the caller qualifies for an action from the record's own data and returns a status saying they do not (so the prompt can hand off), instead of stating the rule in the prompt and hoping the model applies it. The model never sees the flag the decision rests on.
- **LLM classifies, tool decides.** When only the LLM can read the utterance, accept a *narrow* classification param (`basis`/enum) and decide deterministically inside. Don't gate on a signal the LLM won't reliably send — if the classification itself is the engagement signal, don't gate it (evidence: a basis meaning "the user only asked about the state of things" is left un-gated, because the question itself is the signal).

## Two-step state-backed gate (for must-hold rules)

When a rule must hold and prose keeps failing (see `agent-prompt-design` for the escalation test), encode it as two tools over `ctx.state`: step 1 marks state, step 2 acts *only if* the state is set.
- **Evidence:** a prompt-only compliance rule was ignored — the model fabricated an answer it never actually collected. Fix: a first tool marks in state that the question was asked; a second tool records the answer only if that mark is present, else returns a status meaning "not asked" (e.g. `not_asked`) so the prompt can react instead of silently failing.
- **Deadlock caveat:** both tools MUST be among the agent's enabled tools and there must be an unblock path, or the agent can never satisfy step 2. Never build a gate for an optional step.

## Trusted input from state, not arguments

Read identity and pre-resolved facts from `ctx.state` (the server-seeded `_channel` key, `fieldMapping` projections), never from an LLM-supplied argument — an LLM argument is injection-prone. Writes to state are deterministic tool-code only.

## Idempotency and cancellation

The pipeline can cancel a run mid-flight (coordinator cancel-and-restart) and re-run pre-LLM hooks. In-flight tool HTTP calls complete on the remote server but their results are ignored.
- Make writes **idempotent** where possible: a write tool asked to apply the same change to the same record again should return a status saying it is already done (`already_applied`), not write a duplicate.
- Flag non-idempotent tools (`slackPostMessage`, a create-write tool) as a known risk; prefer a backend that de-dupes (e.g. a mock/echo returning an already-exists status).

## A remote MCP tool is one you do not own

An agent can equip tools from an external Model Context Protocol server as well as
from a plugin (`plugin-authoring` covers how). Everything above assumes you wrote the
tool; on a remote one you wrote none of it, and the design consequences follow from
that.

- **The status contract is not yours.** A remote tool returns whatever its author
  decided, in whatever shape, and it can change under you without a release on your
  side. So do not write prompt branches against a remote tool's result the way you
  would against your own closed status set. Treat its output as prose to be read, or
  wrap it: a plugin tool of your own that calls the server and normalises the result
  into a status you control is the honest way to get both.
- **It cannot own a decision you need to be right.** A remote tool reads none of the
  agent's state, holds none of its secrets, and cannot gate a turn. Every pattern
  above that matters — derive instead of expose, gate inside the tool, the two-step
  state-backed gate, identity from `ctx.state` — needs a tool you wrote. If getting
  it wrong has a cost, it is not an MCP server's job.
- **Idempotency is a claim, not a guarantee.** You cannot make a remote write
  idempotent; you can only find out whether it is. Treat every remote write as
  non-idempotent until the server's author says otherwise, and keep it off the paths
  where a turn can be replayed (`regenerate`, a coordinator restart).
- **The tool may simply not be there this turn.** A server that fails to answer is
  skipped and the turn proceeds without it. A capability that must exist on every
  turn does not belong behind a remote server.

The short version: reach for an MCP server to *fetch and act on the outside world*,
and for a plugin tool whenever the correctness of the turn depends on the tool.

## Schema constraints (strict mode)

The exact banned Zod constructs and the fix for each live in `plugin-authoring` (one
home, since they're mechanics, not a design decision). The *why* belongs here: OpenAI's
Responses API enforces strict mode and rejects a non-conforming tool *before* invoking
it, with `invalid_function_parameters`. The failure is therefore not a bad result — the
tool never runs at all, and the model sees only that the call failed.

## Quick reference

| Design question | Answer |
|---|---|
| Where does the decision live? | In the tool if it's data-derived or must-hold; in the LLM only if it's linguistic/soft |
| How does a tool fail? | Returns `"Error: ..."` / `{status:"error"}` — never throws to the LLM |
| How does the prompt use the result? | Branches on a small closed set of `status` values |
| Value the LLM keeps getting wrong? | Derive it in code; remove the LLM's choice |
| Rule that must always hold? | Two-step state-backed gate (mandatory steps only) |
| Where does identity come from? | `ctx.state`, never an LLM argument |
| A third party already exposes this capability? | An MCP server — unless the turn's correctness depends on it, then write the tool |
| Prompt branching on a remote tool's output? | Wrap it in a tool of yours that normalises the result into a status you own |

See also: `plugin-authoring` (defineTool, serialized boundary, loading, the schema banlist), `agent-prompt-design` (prompt vs tool vs gate vs state), `agent-prompt-writing` (how the prompt reacts to `status`).
