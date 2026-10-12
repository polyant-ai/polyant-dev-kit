---
name: evaluating-agents
description: Use when testing or measuring a Polyant agent's behaviour — writing eval scenarios, choosing success criteria, deciding what runs in parallel, or triaging a failing eval. Use when an eval FAIL might be a test artifact rather than an agent bug, when a scenario writes to a live backend, when a change to spec should propagate into scenarios, or before escalating a prompt fix to a deterministic mechanism.
---

# Evaluating agents: measure behaviour, and triage before you trust a FAIL

## Overview

You cannot reason an agent correct — you measure it, on scenarios that run through the agent's real pipeline. The hard part is not running checks; it is knowing that **most red is not an agent bug**. A FAIL has three suspects, ruled out in this order: (1) the environment or the data, (2) the criterion, (3) the agent. Inverting the order leads to "fixing" the prompt for a broken test.

**Core principle:** criteria assert **behaviour and routing** — which tool, which route, what the agent said — never the outcome of a mutation on a live system. Asserting a live outcome makes a test flaky and non-repeatable.

## Running a check

**Reach for the CLI first.** `agent chat <slug> --message "…" --expect "<text>"` sends
one turn and **exits `1` when the reply does not contain the text** — the gate the raw
surfaces below make you build by hand. Reply on stdout, steps and tool calls on
stderr, so a pipe receives the answer alone; `--conversation <id>` reuses a
conversation across turns.

Know what it authenticates with before you build a gate on it: the path it addresses
is an **alias** of the agent's own chat stream, authenticated by a per-agent runtime
key and gated on that agent's `authEnabled` switch. Your management key is not
consulted. So `agent chat` works on an agent whose auth switch is **off** — admitted
by the absence of authentication — and answers `401` on one whose switch is on. A
gate built on it silently only covers open agents.

Drop to the raw surfaces when you need something the CLI does not expose: a specific
channel's behaviour, or a payload shape only that route accepts. Then pick by what you
need to observe.

| Surface | Use it when |
|---|---|
| `POST /channels/http/<slug>/messages` | simplest: with the agent's HTTP channel in `sync-response` mode the reply comes back in the response body, synchronously |
| `POST /api/instances/<slug>/chat/stream` | you need the live multi-step timeline — reasoning, tool calls, hook executions — as typed SSE events |
| `GET /api/conversations/<id>/messages?instanceId=<slug>` | the readback: this is where tool calls, arguments, results, tokens and latency actually live |

The two send surfaces authenticate with the **agent's own API key**, sent as `Authorization: Bearer <key>`; if that agent's auth switch is off, they accept anything, so a check can look authenticated when it never actually was. The readback route is a **different mechanism**: a management API key, sent as the `X-Polyant-Key` header (or a logged-in session), scoped to an org with its own explicit permission set. A key that can send a message may still be unable to read the conversation back — that asymmetry is the most likely reason a first check sends fine and then fails to read the result.

`instanceId` is a **required** query parameter on the readback route. Omitting it
is a 400 before anything else happens.

Read tool calls from `steps[i].toolCalls[j]` (`toolCallId`, `toolName`, `args`) and
their outcomes from `steps[i].toolResults[j]` — **correlated by `toolCallId`, not
by array index**. `toolResults` is optional and can be shorter than `toolCalls`.

There is **no success flag on a tool call.** Infer failure from a missing
`toolResults` entry or from the content of `result`, which is untyped. Rows carrying
`legacy: true` were migrated from an older shape and have no real timing —
exclude them from assertions.

## Success criteria: behaviour, not outcome

- Assert which tool was called, which route the agent took, or a semantic check on what it said — never the live mutation. A routing-only scenario must NOT assert completion: a fallback hand-off to a human after a partially completed action should not fail the test just because the action itself didn't finish.
- **A negative criterion ("the agent must NOT say X") describes ONLY the forbidden behaviour.** If the description also covers the *correct* behaviour, matching against it produces a false FAIL on a legitimate reply.
- **No double negatives, no composite criteria — one criterion, one concept.** State the forbidden thing in the positive and let the negative check-type invert it; don't stack a positive and a negative assertion in one criterion. A positive criterion that requires a subject to be present fails vacuously when the subject is legitimately absent.

## Live writes: mock the side-effect, or use real data

Synthetic ids break live writes (an already-exists / not-found / insufficient-data status from the write tool). Options, best first:
1. **For a live write, try the mock first**, so the suite stays re-runnable: a write tool that honours a mock-response signal simulates the call instead of hitting the real backend. This is what makes a scenario that completes a write safe to re-run.
2. **Real ids only where the source system couples them** to a record it can act on; otherwise identify the target *by name or another stable attribute* the backend can resolve on its own. Never assign an arbitrary id from a test pool — an id the backend cannot actually act on produces a spurious failure (or a spurious fallback hand-off) that looks like an agent bug, when it is really a data problem.
3. Accept flaky / exclude from the gate (last resort).
- Keep no non-repeatable real write in a gated suite — with no cleanup/cancel path, real records accumulate and the next run fails on a duplicate. Real-write coverage belongs in the codebase's own unit/integration tests, not the behavioural suite.

## Parallelizability invariant

A scenario is safe to run in parallel **if and only if** it writes to no backend in its expected path. **There is no third case.** Concretely: no create-and-forget writes against an external system, the objective never completes a mutating action, and any confirmation step either doesn't fire or has no real id to act on. `parallelizable: true` also makes *trials* of the same scenario run concurrently — the same guarantee must hold trial-to-trial (per-trial ids, no shared live state).

## Triage a FAIL: is it the agent?

Read the run back via the readback route (above) before you touch the prompt — which tool was called, with what arguments, and what result — and classify in the order from the Overview: environment/data, then criterion, then agent.

| Symptom | Cause | Not |
|---|---|---|
| A write tool returns an already-exists / not-found / insufficient-data status | leftover state from a prior run, or a synthetic id that doesn't correspond to a real record — environment/data | agent bug |

### Before blaming the agent

A run that errors with a transport-level failure — connection refused, an expired
credential, a rate-limited third party, latency of zero — is not an agent failure.
It never reached the agent. Classify by *where* the run stopped before you read
what the agent said, and keep the two exit conditions distinct in your tooling:
"the assertion failed" and "the call never landed" demand opposite responses.

## LLM-simulator hygiene

A check can drive the conversation's user turns one of two ways: **scripted replay** — a fixed, pre-written sequence of turns, deterministic and repeatable, the default to prefer — or an **LLM playing a user persona**, which improvises and is therefore non-deterministic. The rules below exist because of that second mode.

- The simulator can terminate a scenario early, before the flow actually completes — that is a **false negative of the tester**, not the agent. Guard deterministically: don't honour an early-termination signal while the agent is still asking a question and seeded answers remain pending.
- On a **spec change**, sweep *every* surface that names the removed concept, not just the script: the scripted turns, the success criteria, and the simulator/persona configuration (objective, seeded responses, constraints, persona — the one everyone forgets). Distinguish *stale* (fix it) from *intentional* (the removed concept IS the test — an adversarial/edge scenario keeps it on purpose).
- Seeded responses must map to the simulator's own seed rules, or the simulator improvises non-deterministically.

## Ingest real production conversations

Convert real production conversations into scripted-replay scenarios: conversation metadata becomes preconditions, the message history becomes the scripted user turns, and the original outcome becomes a first-draft ground truth. Anonymize PII deterministically before the scenario is stored — metadata fields *and* any self-declared name in free text, phones and emails replaced with placeholders. Caveat: the original outcome is not always a reliable ground truth — a mislabelled hand-off needs a real signal (an explicit request for a human in the transcript) before it becomes a critical criterion, not just the fact that a human once routed it that way.

## Measure before escalating a fix

**Measure before escalating** a prompt fix to a deterministic mechanism (`agent-prompt-design`): run the **boundary** scenarios first. A prompt-only rule is acceptable if boundary errors are rare; *recurring* false positives/negatives on the boundary are the signal to escalate to a deterministic classifier/gate — not a hunch after one bad run.

## Common mistakes

| Mistake | Fix |
|---|---|
| Treating every red as an agent bug | Read back the run first; classify environment/data → criterion → agent, in that order |
| Asserting the live outcome | Assert behaviour instead: tool called, routing, semantic content |
| A negative criterion that also describes the good behaviour | Describe ONLY the forbidden behaviour |
| Flagging a scenario that completes a mutating action as parallelizable | It writes → keep it sequential |
| Treating a transport-level failure as an agent bug | Classify by where the run stopped — it never reached the agent |
| Spec change swept only in the script | Sweep criteria and simulator/persona config too |

See also: `agent-prompt-design` (where a behaviour should live — measure here first), `tool-design` (the status/audit fields you assert against).
