# acme — an example agent

A worked example of the shape this directory takes. Copy it to `agents/<your-slug>/`,
change the contents, and delete this file. Nothing here is applied automatically:
each file is applied by the command shown beside it.

The layout is a convention, not a contract — the CLI only ever reads the file you
name with `--file`. Keeping one file per writable surface is what makes a change
reviewable in a pull request.

## What applies what

| File | Command |
|---|---|
| `prompts/<key>.md` | `agent prompt set acme --section <key> --file agents/acme/prompts/<key>.md` |
| `hooks/<name>.json` | `agent hooks add acme --file agents/acme/hooks/<name>.json` |
| `channels/<type>.json` | `agent channels set acme <type> --file agents/acme/channels/<type>.json` |
| `secrets.example` | nothing — it is a checklist of key *names*, never values. See *Setting a secret* below |

Prefix every command with the CLI and a scope, e.g.
`npm run polyant -- --context engineering agent prompt set …`. A write needs an
organization and a workspace; see `.claude/skills/cli-workflows/SKILL.md`.

## The filename is not the section key

`--section` matches the section's **literal key**, so the file is named after it:
`01-identity.md` is applied with `--section 01-identity`. Passing `identity` finds
nothing, and the CLI tells you which keys the agent actually declares.

List them before writing:

    npm run polyant -- --context engineering agent prompt show acme

## Setting a secret

One value per call, read from stdin and never from a flag:

```bash
read -rs -p "value: " SECRET && echo
printf %s "$SECRET" | npm run polyant -- --context engineering --yes \
  agent secrets set acme --key tavily_api_key --file -
unset SECRET
```

- **`read -rs`** does not echo, and the value never becomes an argument — so it stays
  out of your shell history and out of `ps`.
- **`--file -`** reads stdin. There is no flag that takes the value inline, and that
  is deliberate.
- The recap names the key and reports the value's **length** and where it came from,
  never the value — so confirming out loud is safe.

Then check what is missing without revealing what is set:

```bash
npm run polyant -- --context engineering agent secrets show acme
```

It lists every key the agent **declares**, each with a `configured` flag.
`--configured-only` narrows it to what exists.

Removing one is destructive and needs both flags: `agent secrets unset acme --key
tavily_api_key --yes --confirm tavily_api_key`. It refuses a key that is not
configured, a typo included — worth knowing, because the engine answers `200` either
way, so without that check a typo would report success while the real secret sat
untouched.

Two constraints from the engine: the key must match `^[a-z0-9_]+$` and be at most 64
characters, and the value at most 8 KiB. The write needs `agent.secret:write`, which
is Admin-grade — a Member-scoped key can neither set a secret nor read which keys
exist.

**The model provider's key is a secret on OSS only.** On Polyant Enterprise 1.3.0
it lives in a connection that the agent's `chat` role is bound to (`agent
provider-roles`, see the `cli-workflows` skill), and `agent secrets set` refuses it.

**A missing provider key does not look like an error.** The agent replies
`⚠️ The agent is out of service` as a normal turn: exit `0`, nothing in `agent logs`,
`status: active`. If you see that sentence, come back here rather than editing the
prompt.

## Hooks name a registered function

`actionConfig.functionName` must be a function the running engine has registered,
namespaced by the plugin that ships it (`<namespace>:<name>` — the example plugin's
`plugin.json` sets `namespace: "example"`, so its hook registers as
`example:seedChannelIdentity`). An unregistered name is refused with a 400.

Do not guess it — list what the instance actually has:

    npm run polyant -- --context engineering api GET /api/hook-functions

## Channel files hold no credentials — and do not need to

`channels/http.json` is the **bare config object** the CLI wraps as
`{ config, enabled }`. The engine merges it onto the stored config rather than
replacing it: it starts from what is stored, overlays the keys your file supplies,
then validates the result.

That is what makes a versioned channel file workable. Seed the credential **once**
in the admin panel, and from then on a file holding only the non-secret keys applies
cleanly — the stored `botToken` survives the merge. `channels/http.json` needs no
seeding at all, because the HTTP channel with `sync-response` outbound has no secret
in its config.

Two things the merge does not do: it never deletes a key (to drop one, remove the
channel and set it again), and it skips a value that arrives masked, so replaying a
`channels show` output cannot overwrite a real secret with dots.

Never put the credential in the file. For a genuine one-off, pipe it through
`--file -` instead of committing it — which is also why the CLI accepts this config
only from a file or stdin, never an inline flag where it would land in shell history.
