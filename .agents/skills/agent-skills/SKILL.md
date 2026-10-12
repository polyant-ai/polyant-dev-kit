---
name: agent-skills
description: Use when giving an agent procedural knowledge it loads on demand — authoring a skill's markdown, its requiredEnv and requiredTools, its scripts, assigning it to an agent, pinning or upgrading its version. Use when a skill you assigned never appears to the agent, when enabling one silently changed the agent's tool list, or when an edit lost the scripts. Complements agent-prompt-design (prompt vs skill) and agent-configuration (the per-agent switches).
---

# Agent skills: knowledge the agent loads only when it needs it

## What a skill is

A skill is **versioned markdown in the instance's own catalogue**, not a file the
agent reads from disk and not a plugin. You author it as a payload — `name`,
`description`, `content` (the markdown), and optionally `requiredEnv`,
`requiredTools` — and the engine stores it as a new version. Nothing about a skill
is resolved from the filesystem, so there is no `SKILL.md` with frontmatter to drop
anywhere: if you keep the text in this workspace under `agents/<name>/skills/`, that
copy is *yours*, and the write is what puts it on the instance.

On OSS the catalogue is the deployment's own: any skill in it can be assigned to any
agent.

On **Enterprise** a skill belongs to an organization. A platform-owned skill is
granted to an organization separately, and a revoked grant stops it being served —
not just listed. The organization's grant is not the last gate either. A
**workspace** carries its own assignment, and what an agent may actually use is the
**intersection** of the two: a skill the organization holds but this workspace was
never assigned is unusable here. `workspace skills list <workspace>` is the place to
read it, and it lists the whole catalogue with an assigned column rather than the
assigned subset — because the row that answers "why does this agent not have that
skill" is the row that says no.

## How it reaches the turn

Two stages, and the first one is the point of the feature:

1. **The index.** Every enabled skill contributes only its **name and description**
   to the prompt's `05-skills` section. The content is not there.
2. **The load.** The model calls `readSkill` with the skill's **slug** — the value
   the index printed — and gets the content back, plus the skill's configured env
   values.

That is progressive disclosure: twenty skills cost twenty descriptions, not twenty
documents. Write the **description** as the routing signal — it is the only thing
the model sees when deciding whether to open the skill.

`autoLoad` inlines a skill's full content into the prompt and **defeats stage two
for that skill**. Reach for it only when the content is needed on every single turn;
otherwise you have paid the whole context cost to save one tool call.

The `05-skills` section is seeded with `{{skillsList}}` and **nothing else** — no
instructional prose, no "one skill at a time" rule. That placeholder is the only
channel through which the index reaches the prompt, so rewriting the section without
keeping it leaves every assigned skill inert, silently. Write whatever guidance your
agent needs around the placeholder, never instead of it — see `agent-prompt-writing`.

## A skill you assigned can be invisible, silently

This is the first thing to check when the agent behaves as if the skill does not
exist. All of these remove it from the index with **no error and no warning**, to
the model or to you:

- an `requiredEnv` key that is not configured for that agent
- a `requiredTools` entry that is not among the agent's enabled tools
- **Enterprise:** a platform-owned skill whose grant to the organization was revoked
- **Enterprise:** a skill the organization holds that this **workspace** was never assigned
- the skill archived, or disabled on the agent

So read the index, not the assignment: if `readSkill` is never called, ask what the
model was offered before you touch the prompt.

## Enabling a skill changes the agent's tool list

`requiredTools` is not documentation — the engine recomputes the agent's enabled
tools as *globals + what the pinned skill versions require + what you enabled by
hand*. Two consequences worth knowing before you write:

- Enabling a skill can **add** tools to the agent.
- Disabling one can **remove** a tool you believed you had enabled manually,
  if the skill was the reason it was there.

The set-skills write reports the resulting tool difference. Read it. And remember
that a tool write is itself a replacement, not a delta — see `cli-workflows`.

## Versions are pinned per agent

Publishing a new version does **not** move any agent. Each update creates a new
version with the **minor** bumped (`0.1.0` → `0.2.0` — there is no major or patch
bump), and every agent stays on the version it was assigned until you upgrade it
explicitly. Rollback names the version to go back to.

Treat the catalogue as the library and the assignment as the pin: fixing a skill is
two operations, and forgetting the second one is why the agent still misbehaves
after you "fixed the skill".

## An update rewrites the version — it does not patch it

A new version is built from the payload you sent, so **anything you omit is gone
from it**:

- **`scripts` are dropped.** The update payload has no `scripts` field, so every
  edit through the ordinary route (or the admin panel) publishes a version with
  none. A skill that carries scripts must be written through the **catalogue
  bundle**, which is the only form that carries them.
- **`requiredEnv` and `requiredTools` are the whole metadata.** Anything else you
  put there does not survive.

Version the markdown in this workspace and re-send the full payload; do not treat
the stored version as a base to patch.

## Scripts run for real

A skill's scripts are strings stored with the version, materialised to a temporary
directory and executed by `runSkillScript`. What that means in practice:

- **No sandbox.** The script runs with the privileges of the engine process. Only
  put a script in a skill you would run yourself on that machine.
- The environment is the **skill's own env values plus `SKILL_DIR` and the
  inherited `PATH`** — nothing else. `${SKILL_DIR}` inside the *content* is a
  textual placeholder; it is a real variable only inside a script run.
- 30s default timeout, 120s ceiling, ~1 MB of captured output, and the temporary
  directory is removed when the run ends. A long job does not belong here.
- The filename must be declared in `scripts` and match `^[\w.-]+$`.

## Skill env values behave like secrets

They are **sensitive by default** — including a bare string in `requiredEnv`. A read
never returns a sensitive value, and writing an empty string is a **no-op**, not a
delete: use the delete for that. The same reasoning as `agent secrets`, for the same
reason (see `cli-workflows`).

## A platform-owned skill is read-only to you — **Enterprise**

Editing one is refused with a `403`, not a `404` — the skill exists, it is simply not
yours. To diverge, create a skill of your own with the **same slug**: the
organization's own skill wins the resolution.

## Prompt, tool, or skill?

`agent-prompt-design` decides where a behaviour lives; a skill is what to reach for
when the answer was "prompt" **but only some conversations need it**:

| The knowledge is | Where it goes |
|---|---|
| how the agent always behaves — tone, routing, the rules of every turn | the prompt |
| a procedure that applies to a minority of conversations | a skill |
| a decision that must be correct, derived from data | a tool (`tool-design`) |
| access the agent does not have at all | a per-agent switch (`agent-configuration`) |

A skill is prompt text with the loading deferred. It buys context, not enforcement:
a rule that must hold does not become reliable by moving into a skill — if anything
it is weaker there, because the model has to choose to open it.

## Quick reference

| Situation | Do |
|---|---|
| the agent never mentions the skill | check `requiredEnv`, `requiredTools` and, on Enterprise, the organization grant and the workspace assignment — all of them fail silently |
| you fixed the skill and nothing changed | the agent is pinned; upgrade it |
| the scripts vanished after an edit | the ordinary update drops them — write the catalogue bundle |
| a skill needs a key | configure the skill's env for that agent, not a prompt line |
| you want the content in every turn | `autoLoad`, and only if you mean every turn |
| the model calls `readSkill` with the wrong name | it takes the **slug** |
| you rewrote `05-skills` and every skill went quiet | the section lost `{{skillsList}}` — put it back |
| you need to know which command does this | `--help --json` on the CLI; `api <METHOD> <path>` when there is none |

See also: `agent-prompt-design` (where a behaviour lives), `agent-prompt-writing`
(how the skill's markdown should read — a skill is a prompt), `agent-configuration`
(the per-agent switches), `cli-workflows` (writing it to an instance).
