---
name: agent-prompt-writing
description: Use when writing or rewriting an agent's system prompt — its phrasing, tone, or structure, or when a prompt is bloated, repetitive, shouty (CAPS / "ALWAYS" / "NEVER"), or holds rules the model keeps ignoring. Use when starting from a newly created agent, whose sections are seeded empty. Complements agent-prompt-design (what belongs in prompt vs tools) and tool-design (the status contract).
---

# Agent prompt writing: principle-led, calm, no noise

A good agent prompt reads like a calm brief, not a wall of commands. State the goal and the **policy plus the why**, then trust the model. You steer behaviour with **clear principles**, not with the **volume of prohibitions**: a pile of CAPS, "ALWAYS"/"NEVER" and ⚠️ is brittle, and past a point the model stops following it. Decide *what* goes in the prompt vs the tools with `agent-prompt-design`; this skill is *how* to write what stays.

> Evidence: Anthropic system-prompt style (dispositional prose, rationale-bearing rules, minimal formatting); the terse-prompt design shared by Claude Code and Codex ("say less, say it precisely, trust the model").

## Style standard
1. **Principle + rationale, not enumeration.** Give the rule and the reason; the *why* lets the model generalise to cases you never listed. An enumeration of scenarios is the brittle `if-this-then-that` to avoid.
2. **Positive framing first.** Say what to do; let prohibitions be illustrative examples of the principle, not the mechanism.
3. **Cut the noise.** Minimal CAPS, emphasis markers, "ABSOLUTE RULE". Reserve emphasis for the few load-bearing rules — when everything shouts, nothing stands out.
4. **Separate altitudes.** goal → context/identity → routing → flows → "follow the tool's `status`". Don't mix high-level routing and step detail in one dense block.
5. **Determinism belongs in tools, not prose.** If a rule MUST hold, move the guarantee into a tool gate (`tool-design`); the prompt stays principle. Re-tightening prose the model keeps ignoring is the wrong lever.

## Don't restate the runtime
- Tool definitions and schemas are passed by the API — never paste a tool catalogue into the prompt.
- Don't instruct a step the harness already performs (a start-of-conversation hook, pre-seeded state or identity). Reference the context that is already there; don't tell the model to re-derive it.

## A new agent starts blank — and one section is not

Creating an agent seeds seven sections whose content is **empty**. That is
deliberate: the sections used to carry generic assistant boilerplate, so an agent's
behaviour came from prose its author had never read, and the same agent created
against a different engine version got different text. The rows still exist because
the panel lists the sections the API gives it — they are somewhere to write, not
something to inherit.

So the inventory step is short on a new agent, and the risk inverts: nothing will
fight your brief, but nothing is stated either. An agent whose prompt you left
half-written has no house style to fall back on. Say what you mean in every section
that carries a behaviour, and leave the rest genuinely empty rather than filling them
to look complete.

**`05-skills` is the exception, and overwriting it carelessly is the trap.** It is
seeded with `{{skillsList}}` and nothing else. That placeholder is the only channel
through which the agent's assigned skills reach its prompt: drop it and every skill
goes silently inert, with no error and nothing in the index to explain why. If you
write instructional prose into that section — how to choose a skill, one at a time,
whatever your agent needs — keep the placeholder in it.

An agent inherited from someone else is the case where the old advice still applies:
read every section before writing one. `agent prompt show <slug>` lists the keys and
`--json` gives you the text. A section that states a *behaviour* must be rewritten or
it stays in force; a section that instructs a tool the agent does not have is inert
and can be left, because the model cannot call what the API never offered it.

## Rewrite process
1. **Inventory** every behaviour the current prompt encodes, so none is lost in the rewrite. On a newly created agent there is nothing to inventory but `{{skillsList}}` — the work is stating a behaviour, not recovering one.
2. **Diagnose** anti-patterns: negative enumerations, CAPS-noise, the same rule duplicated across sections, mixed altitudes, rules the model ignores (candidates for a tool gate), instructions for what the runtime already does.
3. **Rewrite section by section** in the style standard, preserving every load-bearing behaviour; give each rule **one home** (dedup across sections).
4. **Move ignored rules into tool gates** instead of shouting louder.
5. **Show the proposed text for approval, then apply**; confirm no behaviour was dropped.

## Example: enumeration → principle
**Before** — "Call `recordX` ONLY when the user confirms. Do NOT call it when the user: asks a question / expresses doubt / disputes details / wants to change / …"

**After** — "A confirmation is the user's explicit commitment. A question, a doubt, or merely mentioning the topic is not one — recording a confirmation the user did not give has a real cost. Call `recordX` only on a genuine signal; otherwise serve the actual request."

## Anti-patterns
| Smell | Fix |
|---|---|
| Negative enumeration of scenarios | One positive principle + the why |
| CAPS / ⚠️ / "ABSOLUTE" everywhere | Calm prose; emphasis only on the few load-bearing rules |
| Same rule repeated across sections | One home per rule; cross-reference |
| Tool catalogue or schemas pasted in | Drop it — the API already provides the tools |
| Instructing what a hook / the runtime already did | Reference the pre-seeded context instead |
| Re-tightening a rule the model ignores | Move the guarantee into a tool gate |
| Rewriting `05-skills` without keeping `{{skillsList}}` | Keep the placeholder — it is the only path from an assigned skill to the prompt, and losing it fails silently |
| Filling an empty section so the prompt looks complete | An unwritten section states nothing, which is safe; padding it states something you did not decide |

See also: `agent-prompt-design` (what belongs in prompt vs tools), `tool-design` (the `status` contract the prompt reacts to), `agent-configuration` (before writing a rule about what the agent knows or remembers, check whether a switch already provides it).
