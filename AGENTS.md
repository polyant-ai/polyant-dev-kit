# Working in this repo

This is a Polyant workspace: the knowledge for building agents lives in
`.claude/skills/`, the files you feed to a live agent live under `agents/`, and
`polyant-cli` carries a change from here to a running instance.

## Read a skill before you act

Each skill is a plain Markdown file with frontmatter. **Read the relevant one
before working** — they encode decisions that are not recoverable from the code.

| If you are about to | Read |
|---|---|
| decide where a behaviour belongs — prompt, tool, gate, state | `.claude/skills/agent-prompt-design/SKILL.md` |
| write or rewrite a system prompt | `.claude/skills/agent-prompt-writing/SKILL.md` |
| author a skill an agent loads on demand, or assign one | `.claude/skills/agent-skills/SKILL.md` |
| decide what a tool returns and what it decides | `.claude/skills/tool-design/SKILL.md` |
| author a `*.tool.ts` or `*.hook.ts` | `.claude/skills/plugin-authoring/SKILL.md` |
| test an agent or triage a failing check | `.claude/skills/evaluating-agents/SKILL.md` |
| change behaviour that is not prompt text | `.claude/skills/agent-configuration/SKILL.md` |
| push a change to a live instance, or read one back | `.claude/skills/cli-workflows/SKILL.md` |

If a rule the prompt states keeps getting ignored, that is `agent-prompt-design`,
not a prompt-tightening exercise.

The same skills live under `.agents/skills/` for harnesses that read that path.
The two copies are kept byte-identical and a guard test enforces it, so **edit
both** — or edit one and copy it across before committing.

### Two editions, one set of skills

Polyant ships as an open-source edition and an Enterprise one, and they do not carry
the same surfaces. Anything a skill marks **Enterprise** exists only on the Enterprise
edition — provider connections and roles, organization secrets, skill and plugin
assignment to organizations and workspaces, the plugin marketplace, governance gates,
retention policies, personal API tokens, member invitations, permission tiers, the
voice channel and `agent checkup` are the ones you will meet. Everything unmarked
applies to both. If you are unsure which edition you are talking to, `whoami` and the
version the CLI reports are the place to look, not a guess from a feature's absence:
an Enterprise surface you cannot reach and an OSS instance look alike from here.

This file is the single home for these instructions. `CLAUDE.md` at the root
imports it, because that is the file a Claude Code session loads; harnesses that
read `AGENTS.md` get it directly. Edit this file, never the importer.

## Layout

    agents/                 the files you feed to the CLI: prompts and skills as .md, channel and hook config as .json
    templates/plugin/       copy this out to start a plugin — a complete, tested example
    reference/              snapshots pulled from an instance with --json — never hand-edited
    polyant.example.yaml    template for polyant.yaml (gitignored): targets, and the contexts that scope a write
    .env                    the keys (gitignored, never committed)

## Rules

- **Never write a secret value under `agents/`.** Secrets live in `.env` or are set
  through the admin panel. A `secrets.example` file lists key *names* only.
- **Never hand-edit anything in `reference/`.** It is a snapshot of a running
  instance; edits are lost on the next refresh and mean nothing to the engine.
- **Scope every write.** `agent … set`, `create`, `update`, `delete` need an
  organization and a workspace: select a `--context` or pass `--org` and
  `--workspace`. A read without one answers from the default workspace and says so
  on stderr — do not mistake that for an empty workspace.
- **A `set` is a replacement, not a delta.** `agent tools set --enable` states the
  complete desired selection.
- Run `npm test` before committing a skill change — a guard test rejects
  references that do not belong in this workspace. Put names that are private to
  you in `tests/denylist.local.txt` (gitignored) and the same test checks them.

## How a change reaches an instance

Every change these skills describe — enabling a tool or a skill, wiring a hook to
an event, flipping a switch from `agent-configuration`, pointing an instance at a
plugin — is made against a running instance, not by editing this repo. Three routes,
in order of preference:

1. **`polyant-cli`**, from this workspace. Run it through the npm script so the
   pinned version is the one used: `npm run polyant -- --context <name> agent …`.
   Branch on the exit code, not the wording: `0` success, `1` a difference, `2`
   configuration or auth, `3` transient.
2. **The raw passthrough**, `npm run polyant -- api <METHOD> <path>`, for a route
   no product command reaches.
3. **The admin panel**, for anything interactive or one-off.

The CLI's command tree trails the engine's routes, and that is normal rather than a
defect: a surface the engine ships before a command exists for it is reached through
route 2. An agent's **MCP servers**, its **A2A** exposure and the Enterprise
**organization-tier credentials** were in that position, and no longer are — `agent
mcp`, `agent a2a`, `org secrets` and `org connections` reach them now. That is the
normal direction of travel, and the reason to ask `--help --json` what exists rather
than assuming either way: reach for `api` only when the answer is nothing.

One thing no route above covers: getting an **external plugin** onto the instance.
A plugin baked into the image needs `PLUGIN_DIRS`, a **server-side environment
variable** on the machine running the instance. On **Enterprise** it also needs a
grant of that plugin to your organization by a Platform Admin, and a marketplace
plugin is installed instead by an Organization Admin from the web console. If you
are on hosted Polyant rather than self-hosting, you control neither the image nor
the grant, and will need to ask whoever runs the instance.

## Not available

There is no declarative sync — no `pull`, no `diff`, no `push`. Configuration is
read and written one field at a time, and `agents/` is a directory *you* curate,
not one a command populates. Do not invent those verbs. For a whole-agent snapshot,
`agent export <slug>` into `reference/` is the bundle `agent import` reads back:
prompts, tools, channels, hooks and the non-sensitive settings, with credentials as
key names only. Importing over an existing agent **replaces** those parts rather than
merging them, so it is a restore, not a sync.
