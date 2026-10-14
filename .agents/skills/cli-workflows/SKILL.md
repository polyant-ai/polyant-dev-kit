---
name: cli-workflows
description: Use when changing a live agent's configuration from this workspace with polyant-cli — scoping a write to the right workspace, picking a product command over the raw `api` passthrough, reading the exit code instead of the prose, and verifying that a change landed. Use when a write is rejected for a missing workspace, when a workspace-scoped call fails with a 5xx, when a read silently answered from the wrong workspace, or when a secret is about to reach a flag. Complements agent-configuration (which switch to flip) and tool-design (what the change should do).
---

# CLI workflows: the transport is thin, so the discipline is yours

## Overview

`polyant-cli` is the transport between this workspace and a running instance. It resolves a target and its credential, forwards the request, and reports a stable exit code. It deliberately does **not** wrap the API's routes or validate bodies — the engine owns those schemas.

**Core principle:** the CLI will not stop you making a correct-looking change in the wrong place. What it guarantees is that you can always tell *where* a change went and *whether* it landed. Use those two guarantees.

## Ask the CLI what it can do — never trust a list in prose

```bash
npm run polyant -- --help --json
```

It emits its own surface: the version, every global option, the exit-code contract, and the whole command tree — each node with its full `path` (`"agent secrets set"`, ready to append to an invocation), a summary, its usage line, and `supportsDryRun`. Per-node help works too: `agent secrets set --help`.

**Enumerate from that, not from this skill.** A command list written into prose is stale the day someone ships a verb, and this repo has already been caught out by exactly that: the CLI grew four whole command families while its documentation still described six. So this skill deliberately does **not** inventory the commands. What follows is only the part the JSON cannot tell you — the judgement.

If something here contradicts `--help --json`, the JSON is right and this file needs a fix.

## Read the exit code, not the prose

An agent driving this tool branches on the code, never on the wording. The CLI states this contract itself under `exitCodes`; what it cannot state is the third column.

| Code | Meaning | What to do |
|---|---|---|
| `0` | success | continue |
| `1` | a difference, or a failed assertion | not a tool error — this is an answer |
| `2` | configuration, usage, auth (4xx except 429) | fix the invocation or the key; retrying is pointless |
| `3` | 5xx, 429, timeout, unreachable | transient — retry with backoff |

`429` is `3`, not `2`: it is worth retrying. A malformed URL is `2`, not `3`: retrying a URL that can never parse is pointless.

**A `3` that repeats with identical input is not transient.** The class is inferred from the HTTP status, so a server-side rejection of a malformed argument arrives as a retryable `3`. Retry twice; on a third identical failure, treat it as permanent and read the request instead — the workspace trap below is exactly this shape.

Two commands break the pattern deliberately. `whoami` exits `0` even against an unreachable instance, because reporting that *is* its job — read its `reachable` field. `monitor status` prints its whole report and *then* exits non-zero. **Use `monitor status` when you need a gate, `whoami` when you need a description.**

stdout carries only parsable data; everything else is stderr. So `--json` output is safe to pipe even when the command is chatty.

## Raw observability rows: three ways to get a wrong number

The CLI can now serve the rows behind the analytics aggregates, not just the
aggregates. Enumerate the commands from `--help --json` as always; what the JSON
cannot tell you is how to read them.

**A cost total from the raw rows does not match `analytics overview`, and both
are right.** The aggregate counts only calls that RETURNED; the raw list includes
the ones that failed. Do not "fix" the discrepancy — reproduce the aggregate's
basis explicitly when you want to compare, and expect the raw total to be the
larger of the two.

**A window older than the analytics retention window is partial, and reads as cheap.**
A global, age-based sweep deletes `ai_logs` and `pipeline_traces` engine-wide,
independent of any conversation, on a 90-day default — while the conversations
themselves are untouched, so an old window shows conversations with no cost
attached. That is missing data, not free traffic. (The per-agent retention
policy, on Enterprise, is a different mechanism, purges conversation and cost rows together, and
is off by default — it is not the knob to check here.) Establish the analytics
retention window — a platform setting in Settings → General, 90 days unless a
Platform Admin changed it — before concluding anything about an old period.

**A `total` beside more than ten thousand rows is a floor, not a count.** The engine
counts over at most 10001 matching rows, and says so in `totalIsCapped` on the same
response — read that field rather than the total alone. When it is `true`, narrow the
window to get a real figure; the human output prints "at least 10001" for the same
reason. An engine that predates the field omits it, which reads as uncapped.

All three produce a plausible number rather than an error, which is why they are here
and not in the tool's own help.

## Scope: a write refuses to run without a workspace

The rule is not advisory — it is enforced before the request is built:

- **write** requires a **workspace**, and a workspace implies an organization. Missing either is a `2` with `Missing required scope component`.
- **read** requires only a target. Without a workspace the engine answers from the organization's **default** workspace, and the CLI says so on stderr.

Which of the two a command is, you read from `--help --json`: `supportsDryRun: true` marks the mutations. It is a proxy — it states "you may pass `--dry-run`", not "you must supply a workspace" — but today the two coincide, so use it and expect the `2` to confirm.

Treat that stderr note as a warning, not a confirmation: a read that quietly answered from the wrong workspace looks exactly like an empty one. Do not conclude a workspace is empty until you know which one you were served.

`--org` is required for a write but, on the `agent` commands, it only appears in the recap — the organization that applies is the one bound to the key, and a key cannot reach another one. So supply the key's own organization: a different value there changes what you read on screen, not where the change lands.

### The workspace goes into the context as a slug

The workspace is a **slug** everywhere — the URL segment, the `x-workspace-slug`
header, the `api GET /api/me` payload. That is the value a context holds.

A UUID there comes back as `Unknown workspace slug — workspace "<uuid>" was sent as
x-workspace-slug`: the CLI naming the header it used. Read that message instead of
assuming, because older versions sent `x-workspace-id` and wanted the UUID, and their
symptom is the opposite and far nastier — a `5xx` the table above classes as
retryable, on `agent create` and the list reads, while the everyday writes kept
working and hid the problem. `--help --json` reports the version and names the header
in the `--workspace` summary, so check there before trusting
either.

```bash
npm run polyant -- api GET /api/me      # every workspace the key can address
```

## Product command first, `api` when it is not there

`api <METHOD> <path>` covers every route without wrapping any. That makes it the right tool for what the product commands do not reach — and the wrong tool for what they do.

- **Prefer the product command.** It reads current state first so its recap can show the previous value, it names what changed, and it knows which arguments are destructive.
- **Reach for `api` when there is no command** for the route, or when you need the response body untouched. Both directions are byte-for-byte: a large integer keeps its precision, `1.0` stays `1.0`, key order survives.
- Paths start with `/`, and **not every route is under `/api`**: `/health`, `/v1`, `/memories`, `/channels/http`, `/webhooks`, `/oauth` are top level.

## Invocation surface

- **The global flags are listed by `--help --json`**, each with whether it takes a value. What the listing does not say is how they parse: they are consumed anywhere in the argv, **before or after** the command path, and `--flag=value` works as well as `--flag value`.
- **Repeating one is an error**, not last-wins. So is giving a boolean flag a value.
- **`--` stops flag parsing**; everything after it goes to the command.
- **A command validates its own flags.** A typo'd command-local flag is a `2` naming the option, never a silently ignored argument.
- **A global flag never doubles as a command's own option.** `--workspace` on a command that acts on a workspace is the global flag, and the command reads it from there; where a command needs a switch of its own it takes a different name rather than reusing `--org`, which names an organization and takes a value. On Enterprise, `member invitations create` and `org audit authz` read `--workspace` this way, and `governance analytics` takes `--org-wide`.
- **There is no `--key` flag.** Keys are read only from the environment variable named by `keyEnv`; argv is visible in `ps` and lands in shell history.
- **`keyEnv` holds a management key, and on Enterprise it may hold a personal token instead; the prefix is the difference.** `pk_…` is a management key: a service principal scoped to one organization, carrying its own permission set, which outlives whoever created it. `pat_…` is an **Enterprise** personal API token: it authenticates the PERSON who issued it and resolves their live role bindings, so it stops working when their access does. Use a management key for anything unattended — a pipeline authenticated as an employee breaks, or over-grants, the day they are offboarded. A personal token is for your own workstation, and can be restricted to less than you can do. Two things behave differently under one: anything its holder cannot do it cannot do (checked per request, so a changed role takes effect at once), and the credential-management routes (`POST /api/me/password`, `/api/me/two-factor`, `/api/me/tokens`, `/api/invitations/accept`) refuse it outright.
- **A write refuses to run non-interactively without `--yes`.** It prints the full recap first, then exits `2` with `… is non-interactive; --yes is required`. This includes `config context add|edit`, which touches nothing but `polyant.yaml`. The refusal is a free `--dry-run` — read the recap it just gave you before re-running.

## A replacement is not a delta

`agent tools set --enable a,b` states the **complete desired selection**; the engine replaces the list. Passing only what you want to add silently disables everything else.

Read the current state first, decide the full set, then write it. The recap names what is enabled, disabled, and left alone — read it before confirming.

**An empty selection means no tools**, and it is the case worth stating separately
because it used to mean the opposite. No stored rows was once read as "enable
everything", so an agent with every switch off — or one seeded before the tool
catalogue had synced — ran with the whole registry, the HTTP and file tools
included. It is now exactly what is stored, on the runtime and on the
secret-prompting side alike. Two consequences: writing an empty set is a real
instruction the engine will honour, and an agent you inherited whose tool rows are
empty has *lost* tools it was silently running. Read its tool list before assuming it
never had any.

## Prompt sections are addressed by their literal key

`agent prompt set --section <key>` matches the section key exactly: `01-identity`, not `identity`. A friendly name matches nothing, and the error lists the keys the agent declares. `agent prompt show <slug>` lists them first.

## Channel config merges onto what is stored

`agent channels set <slug> <type> --file f.json` sends the file as the channel's **bare config object**; the CLI wraps it as `{ config, enabled }` and `--disable` flips the flag.

The engine does **not** replace the stored config with your file. It starts from what is stored, overlays each key your file supplies, then validates the merged whole. Three consequences:

- **A credentialed channel can be versioned — after its secret exists.** A file holding only `allowedUserIds` passes for Telegram once `botToken` is stored, because the token survives the merge. The first write is the one that needs the credential, so seed it in the admin panel and version the rest.
- **A file cannot delete a key.** The merge only adds and overwrites. To drop one, `channels remove` and set it again.
- **A masked value is ignored, not written.** A value beginning with the mask characters is skipped, so piping back a `channels show` output cannot overwrite a real secret with dots.

Never put the credential in the file itself. Hook and channel configuration is accepted only from a file or stdin (`--file -`), never an inline flag, so a secret cannot land in shell history — pipe a one-off secret through `--file -` instead of committing it.

**An unreadable config looks exactly like an absent one.** A channel whose stored config no longer decrypts — a rotated `ENCRYPTION_KEY` is the usual cause — renders with no keys, the same as a channel nobody has configured. `configReadable` on the show response is the only thing that separates the two, so read it before you re-enter a credential you may already have. The engine may also have auto-disabled the channel, and it says why; do not re-enable one without reading that reason.

## The voice channel has commands of its own — **Enterprise**

The telephone voice channel is a channel row like the others, so `channels show`
lists it, but do not write it with `channels set`. Its stored shape keeps the voice
profile as a JSON string, and the generic merge would store a broken profile
unchecked; the first caller finds out. Use the voice commands (CLI 0.7 or later):

- `agent channels voice status <slug>` is where to start. It gives the URL to paste
  into the Twilio number's "A call comes in" setting, says whether a call can start,
  and names what is missing: channel fields (the Twilio Auth Token, the ElevenLabs
  voice id), the voice roles the saved settings use — speech synthesis, speech
  recognition, turn detection, the text model, the judges — with the provider each
  must be on and whether its connection can run, and the failing checks. From CLI
  0.8 it reports roles where earlier versions reported keys; bind them with
  `agent provider-roles bind` (below). The checks are computed as if the channel were on, so read it
  before enabling. A localhost URL means the platform Base URL is not set; Twilio
  needs a public HTTPS address that also carries WebSockets.
- `agent channels voice settings show <slug> > voice.json` prints the settings as the
  JSON the next command takes, ready to version under `agents/`.
- `agent channels voice settings set <slug> --file voice.json` **replaces the whole
  configuration**: a field the file leaves out takes its default, unlike the merge
  above. The engine checks every field and the profile against its language pack
  before the recap, and nothing is saved while an issue remains, `--dry-run`
  included, which makes a dry run the way to validate a profile edit.

Keep `twilio.authToken` out of the versioned file: an absent token keeps the stored
one, `null` clears it. Seed it once in the admin panel, or pipe a one-off file through
`--file -`.

**Saving an enabled voice channel costs money.** The engine synthesizes the agent's
fixed phrases and wait lines again on every save and at every engine start, billed in
ElevenLabs characters. Batch your profile edits, validate them with `--dry-run`, and
save once.

`agent export` carries the voice channel, profile included, without its Auth Token,
and `agent import` brings it back disabled until the token is set again.

## A secret is set per agent, by name, from stdin

`agent secrets set <slug> --key <name> --file <path|->` sets a credential the agent's
tools and channels declare — and, on OSS, its model provider's key. It reads the value
from a file or stdin and never from a flag — the same rule as channel and hook config, for the
same reason: an inline secret lands in shell history and in `ps`. The recap names the
key and reports the value's length and where it came from, never the value.

```bash
printf %s "$VALUE" | npm run polyant -- --context <name> --yes \
  agent secrets set <slug> --key <key-name> --file -
```

`agent secrets show <slug>` lists every key the agent **declares**, each with a
`configured` flag — so it tells you what is missing without revealing what is set.
That includes the keys its enabled tools declare (a bucket, a region, an allowlist),
which the engine lists only once they are stored; the CLI reads them from the tools
route, which needs `tool:read`. A key without that permission still sees and manages
the stored secrets, and stderr says that a tool key never stored is missing from the
list. `--configured-only` narrows it to what exists.

`set` refuses a key the agent does not declare, naming the ones it does. `unset` is
destructive — `--yes --confirm <name>` — and refuses a key that is not configured,
a typo included. Both checks matter for the same reason: the engine answers `200`
either way, so without them a typo would report success while the real secret sat
untouched.

## A provider credential is a connection, bound per role — **Enterprise**

On Polyant Enterprise 1.3.0 a model provider's key is not an agent secret. It lives
in a **connection** — a named credential the organization lends to workspaces, or
one private to the agent — and each use of it is a **role** bound to exactly one
connection: an agent's `chat`, `embedding` and `stt` roles, the voice roles, and at
the organization `library_embedding`. The CLI reaches this from 0.8 on:

```bash
npm run polyant -- agent provider-roles show <slug>          # every role, its binding, whether it can run, and why not
npm run polyant -- agent provider-roles bind <slug> chat <connection-id>
printf '{"api_key":"%s"}' "$KEY" | npm run polyant -- --yes \
  agent connections create <slug> <name> --provider <provider> --file -
```

`provider-roles show` is the place to start: it lists the connections each role may
take, filtered by the same test the binding applies, and the engine's own reason when
a role cannot run. Four things follow.

- **There is no fallback.** A role with no binding stops the turn rather than reaching
  for another key, and so does a role bound to a connection that was withdrawn from
  the agent's workspace, or a private connection in an organization that accepts only
  its own. A new agent answers nothing until its `chat` role is bound, and
  `agent import` warns about each role the imported agent needs bound.
- **A provider key sent as a secret is refused.** `agent secrets set` and
  `org secrets set` answer `400` for a provider's key and name the connection routes.
  A copy an upgrade left behind stays listed while it is stored, is read by no role,
  and can be removed with `secrets unset`.
- **`org secrets` still serves tool credentials.** An agent's own value wins and the
  organization's is the fallback, so several agents on one search account share one
  key — and `agent secrets show` reporting such a key as not configured does not mean
  the agent lacks it. The two **per-agent authentication keys are deliberately excluded**: one
  organization-level key authenticating every agent would void the per-agent
  authentication model, so the CLI refuses to store one there.
- **A connection a role is bound to cannot be deleted.** The engine answers `409`
  until those roles point elsewhere; withdrawing the connection from a workspace is
  the operation that stops them.

Connections are written from a file or stdin, like every credential. `agent update
--provider-connection`, which earlier CLI versions offered, is gone: the engine
refuses that field with a `400`.

On OSS there is no organization tier and no role: the provider key is an agent
secret, full stop, and another agent answering on the same provider tells you the
provider works, not that this one can reach it.

## A hook names a registered function

`actionConfig.functionName` must already exist in the running engine's registry, namespaced by the plugin that ships it (`<namespace>:<name>`). An unregistered name is refused. Do not guess it:

```bash
npm run polyant -- api GET /api/hook-functions
```

On Enterprise that listing is **scoped to what your organization holds** (installed
or granted), and a name it withholds is refused with the same message as a name that
does not exist — the endpoint deliberately does not confirm which. So a function you
know is installed and cannot bind is a grant question, not a typo (see
`plugin-authoring`).

## Two keys, two mechanisms

Confusing them produces a 403 that neither side can explain alone.

- **Management key** (`pk_<id>_<secret>`, header `X-Polyant-Key`) — org-scoped, carries an explicit permission set. This is what the CLI uses. A key can only do what it was granted.
- **Per-agent runtime key** (header `Authorization: Bearer`) — authenticates traffic *to one agent* on `/v1/chat/completions` and the HTTP channel. The CLI never sends it.

## A 403 has three causes, not two

Authorization is enforced unconditionally — there is no shadow mode, no environment
variable that reduces a permission check to a no-op, and an undeclared route is a
denial like any other. So when a call the CLI makes comes back `403`, work through:

1. **The wrong key for the route** — the two mechanisms above. A route wanting a
   runtime key does not accept your management key, and vice versa.
2. **A permission the key does not hold.** A management key carries an explicit
   permission set, and it can only do what it was granted. Three routes moved
   deliberately and will surprise a key that used to reach them: listing the tool
   registry now wants an organization-read permission rather than a tool-read one,
   listing an organization's plugins (Enterprise) moved off the organization-read floor onto a
   plugin-read permission of its own, and the model listing is scoped to the caller's
   organization — a principal whose
   organization cannot be resolved gets an empty list, not an error, so an
   integration that enumerates models to discover a slug sees `[]`.
3. **Membership, not the token.** An organization is authorized by membership, so a
   user belonging to two organizations reaches an agent in either. Every rejection on
   an organization-addressed route is one indistinguishable Forbidden — deliberately,
   so an unknown slug cannot be used to test what exists. Do not read a `403` as
   proof the thing is there.

**Enterprise** adds a fourth: a permission carries the tier that decides it, so a
workspace-tier permission is decided by the workspace binding. A grant made at the
organization no longer silently overrides it.

None of them covers a **platform-administration** route. Those are gated on the
caller's platform-administrator standing, resolved per request from the user record
rather than from any permission a key can hold, so no management key reaches them at
any grant level and the refusal reads `Current platform administrator standing
required`. On Enterprise, a **personal API token** is refused there too, and for a different reason
— it *is* a human principal, so that sentence does not cover it, but the tier
bypasses all authorization and one of its routes returns a generated password, so a
token in an environment variable would be a bearer credential for the deployment.
That refusal reads `A personal API token cannot act as a platform administrator`,
even when its holder is one.

Reached through `api`, EITHER of those two `403`s is indistinguishable from the
three refusals above and is none of them — but they are distinguishable from each
other, and that is the quickest way to learn which credential the environment is
actually supplying. An organization's own `role` commands (Enterprise) are
unaffected — they administer custom organization roles, which is a different
mechanism.

## Rehearse against production

A production target (`prod: true`) gates every write behind an explicit confirmation and always requires `--yes`. Destructive operations additionally require `--confirm <slug|type|id>`.

`--dry-run` prints the recap and sends nothing. On a production target, run it first — the recap is the last place a wrong workspace is still cheap to notice.

## Verify that it landed

A `0` means the request was accepted, not that the behaviour changed. Close the loop:

- `agent update` checks the instance the engine answers with. The engine ignores a field it does not treat as writable — with a `200` and a fresh `updatedAt` — so a field you asked to change that comes back with its old value exits `1`: the rest of the request was written, and that one field was not. A value the engine normalised (keywords trimmed, a temperature clamped) counts as written.
- `agent checkup <slug> --fail-on broken|warning|note` (**Enterprise**) exits `1` when a live check reaches that severity, so it is a gate on the agent's own health rather than on the command.
- `agent chat <slug> --message …` — one turn through the agent's own chat stream, and the fastest proof that the agent answers at all. Reply text on stdout, steps and tool calls on stderr; `--expect <text>` turns it into a gate that exits `1` when the reply does not contain the text. **It does not authenticate with your management key** — see below.
- `agent show <slug>`, or the matching `… show` for the surface you wrote.
- `monitor events --instance <slug> --follow` while you exercise the agent — the audit log is where a tool call proves itself.
- `monitor status` as the gate in CI. It probes the scheduler too, so a deployment where no scheduled task will start fails it.

### `agent chat` is not a management lane

The path it addresses is an **alias** of the agent's own chat stream, not a route
beside it: both are public to the RBAC layer and both authenticate the same way — a
per-agent runtime key, gated on that agent's `authEnabled` switch. The management key
is never consulted here. Two consequences, and they are opposite:

- Against an agent with `authEnabled` **on**, `agent chat` gets a `401`. The CLI
  holds no runtime key, and there is no flag to give it one. Use the agent's own
  endpoint with `Authorization: Bearer <runtime key>` instead.
- Against an agent with the switch **off**, the turn is admitted by the *absence* of
  authentication, not by your key. It works, but it proves nothing about
  authorization — and it is the same openness that makes that switch dangerous on a
  reachable agent (see `agent-configuration`).

So a `401` from `agent chat` is a statement about the agent's auth switch, not about
your key or your permissions. Do not go looking in the management key's grants.

### `⚠️ The agent is out of service` is a missing credential

The agent's model provider has no credential it can use. The engine returns that
sentence **as the reply** — a normal streamed turn, exit `0`, nothing in `agent logs`,
and `agent show` still reporting `status: active`. Nothing about the failure looks
like a failure, so do not go hunting in the prompt or swapping the model id.

On OSS a provider key is an agent secret, so set it as one — see *A secret is set per
agent* above. On **Enterprise** the credential comes from the connection bound to the
agent's `chat` role, so read `agent provider-roles show <slug>` before anything else.
And note what another agent answering happily on the same provider does *not* prove:
that this agent can reach a credential. On Enterprise the other agent may simply be
bound to a connection this one is not.

### `This assistant is not available right now` is a refusal — **Enterprise**

A different sentence, and a different cause: the engine refused the turn on the
organization's provider decisions. A role the turn needs has no connection bound, its
connection was withdrawn from the agent's workspace or cannot serve it, the
organization accepts only its own connections and the agent's is private, or the
provider or the pinned model is not admitted in that workspace. The reply is vague on
purpose — whoever is chatting can do nothing about it, and naming the policy would leak
configuration to anyone who can message the agent. The reason is in the engine's log
and on the agent's status page in the admin panel. From here, `agent provider-roles
show <slug>` names the role that cannot run and why, and `agent providers <slug>`
says what the agent may run.

## Quick reference

| Situation | Do |
|---|---|
| you need to know what commands exist | `--help --json`, never a list in prose |
| driving the CLI from an agent | branch on the exit code; parse stdout, log stderr |
| any write | supply a workspace — the **slug**, as `api GET /api/me` lists it — and `--yes` |
| a write printed its recap and stopped | it wants `--yes`; that recap was a free dry-run |
| the reply is `⚠️ The agent is out of service` | no provider credential resolves for this agent — its secrets on OSS, `agent provider-roles show` on Enterprise; not the prompt |
| the reply is `This assistant is not available right now` | a provider refusal (Enterprise): an unbound or withdrawn connection, managed-only mode, or an unadmitted provider or model — `agent provider-roles show`, then `agent providers` |
| `agent update` exits `1` | the engine ignored a field it does not treat as writable; the rest was written |
| checking that an agent answers at all | `agent chat <slug> --message …`, `--expect` to make it a gate — only on an agent whose auth switch is off |
| `agent chat` answers `401` | the agent has `authEnabled` on; the CLI sends no runtime key — not a permissions problem |
| the same `3` three times with identical input | stop; it is permanent, read the request |
| a read returned suspiciously little | check stderr for the default-workspace notice |
| enabling one more tool | read the current set, write the whole set |
| setting a prompt section | use the literal key (`01-identity`) |
| route has no command | `api <METHOD> <path>`, remembering the non-`/api` prefixes |
| channel config carries a credential | seed it in the admin panel, then version the non-secret keys |
| configuring the voice channel (Enterprise) | `channels voice status` first; `settings set --dry-run` validates without saving, and a real save of an enabled channel spends ElevenLabs characters |
| setting a tool key, or a provider key on OSS | `agent secrets set <slug> --key <name> --file -`, never a flag |
| giving an agent a provider credential on Enterprise | `agent provider-roles bind` to a connection; a provider key sent as a secret is refused |
| wiring a hook | list `/api/hook-functions` first |
| touching production | `--dry-run`, read the recap, then `--yes` |
| need a CI gate | `monitor status`, not `whoami`; on Enterprise, `agent checkup --fail-on` for one agent |
| a 403 you cannot explain | which key the route wants, then which permission your key holds, then membership |
| you wrote an empty tool selection | that is now "no tools", not "all tools" — it will be honoured |
