# polyant-dev-kit

A workspace for building, configuring, testing and verifying [Polyant](https://polyant.ai)
agents from your local coding agent — Claude Code, Codex, opencode, or any other.

The knowledge for building agents lives here as skills, the files you feed to a live
agent live here as versioned Markdown and JSON, and `polyant-cli` is the transport
between the two. That makes an agent change diffable, reviewable in a pull request,
and revertable.

## Quickstart

1. **Fork or clone this repo**, then install:

       npm install

2. **Run the guard suite** to confirm the workspace is healthy:

       npm test

3. **Read the skills** in `.claude/skills/` — they are the knowledge this repo
   ships with, independent of which coding agent you use. `AGENTS.md` maps each
   one to the situation it covers. The same files are mirrored under
   `.agents/skills/` for harnesses that read that path; a guard test keeps the two
   identical.

   `AGENTS.md` holds the workspace's instructions, and `CLAUDE.md` imports it, so a
   Claude Code session and a Codex session load the same rules. Point any other
   agent at `AGENTS.md` and it starts in the same place.

4. **Build a plugin.** `templates/plugin/` is a complete, tested starting point
   — one tool, one hook:

       cp -r templates/plugin ../my-plugin
       cd ../my-plugin
       npm install
       npm test

   Its README covers editing `plugin.json` and loading the plugin into an agent.

## Talking to a live instance

`polyant-cli` resolves a target and its credential, forwards requests to the
management API, and reports results with stable exit codes. It is deliberately
thin: the engine owns the request schemas, so the CLI does not duplicate them.

`polyant-cli` is installed from its GitHub repository, at a release tag. This
workspace pins it as a dev dependency at `v0.9.0`, the release for Polyant 1.2.0 and
Polyant Enterprise 1.2.0, so `npm install` fetches it. Its
version should follow the API version of the instance you talk to; to move it,
re-pin the tag:

```bash
npm i -D git+https://github.com/polyant-ai/polyant-cli.git#v0.9.0
npm run polyant -- --help
```

Run it through the npm script, not a global binary, so the pinned version is the
one that executes. If you also want it on your `PATH` outside this workspace:

```bash
npm install -g https://github.com/polyant-ai/polyant-cli/releases/download/v0.9.0/polyant-ai-cli-0.9.0.tgz
```

Then point the workspace at your instance.

**1. Get a key.** Create a **management API key** in your admin panel. It is
org-scoped and carries an explicit permission set — grant it only what this
workspace needs. Put the value in `.env`, under the variable named by `keyEnv` in
`polyant.yaml`; never in `polyant.yaml` itself, where a literal `key:` is rejected.

**2. Make the file yours.** `polyant.yaml` is gitignored, like `.env` — it names your
hosts and workspaces, so it is not the repo's to carry. Start from the template:

```bash
cp polyant.example.yaml polyant.yaml
```

Replace the example hosts with yours, then check the wiring:

```bash
npm run polyant -- config doctor      # names each keyEnv and whether it is set
```

**3. Find your organization and workspace.** The shipped contexts use placeholder
slugs, and you do not have to guess the real ones — ask the instance. With the key
in the environment, this is the only call you need before anything else works:

```bash
npm run polyant -- api GET /api/me
```

It answers with your organization's slug and name, and every workspace the key can
address (`slug`, `name`, `isDefault`).

A **context** is a versioned, non-secret shortcut for a target, an organization and
a workspace. Declare one — writes require both, and the CLI never guesses which one
a change lands in:

```bash
npm run polyant -- config context add engineering \
  --target staging --org <org-slug> --workspace <workspace-slug>
```

Both values are **slugs**, exactly as `api GET /api/me` reports them. The workspace
travels as `x-workspace-slug`, so the slug is the only identifier you ever write —
no internal id crosses the boundary.

If a workspace value is wrong you get `Unknown workspace slug`, naming the header the
CLI used. Older CLI versions sent `x-workspace-id` and wanted the UUID instead; if you
are on one of those, its failure is nastier — a `5xx` that reads as retryable — so
check your version before debugging further — `npm run polyant -- --help --json`
reports it, and names the header in the `--workspace` summary.

**4. Confirm you are talking to the right place.**

```bash
npm run polyant -- --context engineering whoami
npm run polyant -- --context engineering agent list
npm run polyant -- --context engineering agent show acme
```

Changing configuration is one field at a time, from a file you keep here.
`agents/acme/` is a worked example of the layout, with its own README; these
commands apply its files as they stand:

```bash
npm run polyant -- --context engineering agent prompt set acme \
  --section 01-identity --file agents/acme/prompts/01-identity.md

npm run polyant -- --context engineering agent tools set acme \
  --enable webSearch,searchKnowledge

npm run polyant -- --context engineering agent hooks add acme \
  --file agents/acme/hooks/seed-identity.json
```

`--section` takes the section's **literal key** (`01-identity`, not `identity`);
`agent prompt show acme` lists the ones your agent declares.

`agent tools set` states the **complete** desired selection — the engine replaces
the list, so passing only what you want to add disables the rest, and an empty
selection means *no tools* rather than all of them. Every write prints a recap on
stderr before anything is sent; `--dry-run` prints it and sends nothing. Read
`.claude/skills/cli-workflows/SKILL.md` before your first write.

Anything the product commands do not reach is available raw:

```bash
npm run polyant -- api GET /api/hook-functions
```

The CLI's commands trail the engine's routes by design, so a newer surface is
normally reached this way rather than through a verb. Ask `npm run polyant -- --help
--json` what exists instead of guessing: surfaces that used to need `api` — an
agent's MCP servers and A2A exposure, retention, the organization's provider
credentials and connections on Enterprise — have commands of their own now.

## Two editions

Polyant ships as an open-source edition and an Enterprise one, and this workspace
covers both. The skills mark **Enterprise** on anything that exists only there;
everything unmarked applies to both. It matters more than it looks, because a surface
you cannot reach and a surface that is not in your edition fail the same way from
this workspace.

## What is in here

| Path | What |
|---|---|
| `.claude/skills/` | the knowledge: how to design prompts, tools and checks, which per-agent switch does what, and how to drive the CLI |
| `templates/plugin/` | a tested starting point for a plugin — one tool, one hook |
| `agents/` | the files you feed to the CLI, versioned: prompt sections as Markdown, channel and hook configuration as JSON |
| `reference/` | snapshots you pull from a live instance with `--json` — read-only, never hand-edited |
| `polyant.example.yaml` | the template for `polyant.yaml` — your targets and the contexts that scope a write. The copy is gitignored |

Product documentation lives at [docs.polyant.ai](https://docs.polyant.ai). This
repo does not duplicate it: the docs describe what exists, the skills prescribe how
to decide.

## Secrets

Never commit a secret.

- **Management keys** (`pk_…`, sent as `X-Polyant-Key`) belong in `.env`, named by
  `keyEnv`. This is what the CLI authenticates with. On Enterprise, a **personal
  API token** (`pat_…`) can sit in the same place and authenticates you rather than
  a service principal — fine on your own machine, wrong for anything unattended.
  The `cli-workflows` skill covers the difference.
- **A per-agent runtime key** (sent as `Authorization: Bearer`) authenticates
  traffic *to one agent* on its chat endpoint and HTTP channel. The CLI never
  sends it; it is here for when you call an agent directly.
- **An agent's own secrets** — tool credentials and, on OSS, the model provider's
  key — are set with `agent secrets set <slug> --key <name> --file -`, which reads
  the value from stdin and never from a flag. They are never written into this
  workspace: a `secrets.example` file lists key *names* only.
- **On Enterprise, a provider key is not a secret**: it lives in a named connection,
  owned by the organization or private to the agent, and the agent binds it per
  role (`agent provider-roles`). A tool credential can also live at the
  organization, inherited by every agent that does not carry its own, so an agent
  reporting a key as not configured may still be working. The per-agent
  authentication keys are deliberately excluded from that inheritance.

Channel and hook configuration is accepted by the CLI only from a file or stdin,
never from an inline flag, so a credential cannot land in your shell history.
