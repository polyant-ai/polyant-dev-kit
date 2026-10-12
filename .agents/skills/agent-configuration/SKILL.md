---
name: agent-configuration
description: Use when an agent's behaviour should change but the change does not belong in the prompt — memory, knowledge, conversation state, tool-result replay, thinking, caching, datetime injection, debug capture, embeddings, speech-to-text, A2A exposure, or GDPR opt-out. Use when you are about to write a prompt instruction for something a per-agent switch already does. Complements agent-prompt-design (where a behaviour lives).
---

# Agent configuration

Every agent carries per-agent switches that change how the runtime builds its turn.
They are invisible in the prompt, and anyone who does not know they exist will
write prompt instructions for behaviour a boolean already provides — or will spend
a day debugging a symptom one of them caused.

Read this before writing a prompt rule about *what the agent knows* or *what it
remembers*: that is usually a switch, not a sentence.

## The switches

| Switch | Default | What it changes |
|---|---|---|
| `memoryEnabled` | on | Facts are extracted from conversations and recalled semantically. Off means the agent starts every conversation with no long-term recall |
| `memoryScope` | `agent` | How wide that recall reaches: `agent` is one pool shared by every conversation, `conversation` is a pool per conversation. A flip does not migrate what is already stored — existing memories stay under the key they were written with, so it changes what NEW turns can recall, not what the agent already knows. The engine stores a third value but refuses it on the write path, so only these two can be set |
| `knowledgeEnabled` | off | Enables the knowledge base. Required before any document upload — an upload against a knowledge-disabled agent is a 400 |
| `toolResultsInHistoryEnabled` | off | By default cross-turn history is **text only**: a prior turn's tool output is invisible next turn unless the reply text echoed it. Turn this on when the agent keeps re-calling a tool it already called |
| `stateInPromptEnabled` | off | Renders the conversation state into the prompt read-only. Leave off unless the agent must *reason about* state; state is primarily tool-to-tool |
| `datetimeInjectionEnabled` | on | Injects the current datetime. Turn it off for a deterministic agent — but then never write a prompt rule that depends on "today" |
| `thinkingEnabled` + `thinkingLevel` | off / `medium` | Extended reasoning. `thinkingLevel` accepts `low` `medium` `high` `xhigh` `max`, clamped per model — a level the model does not support is reduced, not rejected. `thinkingLevel` is set separately — unlike the rest of this table, it does not travel in the export/import bundle |
| `temperature` | unset | Unset uses the model default. Set 0 for reproducible turns |
| `cacheEnabled` + `cacheTtl` | on / `1h` | Prompt caching. See the caveat below — it is not free |
| `governanceHistoryTurns` (Enterprise) | 10 | How many prior turns the semantic governance gates see when judging the latest message |
| `debugEnabled` | off | Persists the exact LLM request per turn. Heavy, and PII at rest. See the caveat |
| `sttProvider` | `openai` | Speech-to-text provider for voice messages: `openai`, `aws`, `deepgram`, or `disabled`. Set it explicitly — an unrecognised or unset value used to fall back silently to Whisper, so an operator who wanted voice turned off had no way to say so. `disabled` makes the agent reply that voice messages are not supported and ask the sender to write instead |
| `embeddingProvider` + `embeddingDim` | derived / 1024 | The embedder, chosen **independently** of the chat model. A new agent inherits the provider from its chat provider (Bedrock chat → Bedrock embedder, everything else → OpenAI) at 1024 dimensions; only older agents sit at 1536. `embeddingDim` cannot be patched. See the caveat — changing the provider is destructive |
| `authEnabled` | off | See the caveat — off means the agent's runtime routes are open |
| `a2aEnabled` | off | Exposes the agent over the Agent2Agent protocol — an agent card for discovery and a JSON-RPC endpoint. Off by default, and off means a `404` that does not reveal the agent exists. See the caveat |
| `langsmithEnabled` + `langsmithProject` | off / unset | Per-agent LangSmith tracing. The API key is a secret, not a field here |
| `optoutEnabled`, `optoutStopKeywords`, `optoutResumeKeywords`, `optoutClosingMessage`, `optoutResumeMessage` | off / `["STOP"]` / `["START"]` / unset | GDPR STOP/START keyword handling, enforced deterministically by the runtime, never by the model |
| `optoutInjectPromptHint` | **on** | Whether the keywords are described to the model as context. On by default, and informational only — turning it off changes what the model knows, never what the runtime enforces |

## Caveats worth knowing before you flip something

**`authEnabled: false` means the agent is open.** The runtime routes
(`/v1/chat/completions`, `chat/stream`, the HTTP channel) return before reading any
header: no token required, no token validated, any value accepted. This is a
deliberate mode, not a bug — but never leave it on an agent reachable from the
internet.

**`a2aEnabled` and `authEnabled` compound.** Turning A2A on publishes two routes.
Discovery — the agent card — is **unauthenticated by design**: anything that can
reach the host can read what the agent is and what it claims to do. The JSON-RPC
endpoint authenticates the same way the agent's other runtime routes do, which means
it is governed by `authEnabled`. So A2A on plus auth off is an agent anyone can
*drive*, not merely describe. The engine logs a warning once per agent when it finds
that combination; treat the warning as the last line of defence, not the control.

**Changing `embeddingProvider` deletes data.** Vectors from different providers
live in incompatible spaces and are not converted. Switching wipes **all memories
and the entire knowledge base**, in one transaction. The API rejects the change
unless you explicitly confirm it, in the same request: `agent update <slug> --set
embeddingProvider=<provider> --set confirmWipe=true`. Export the knowledge base
first: it re-imports and re-embeds. Memories do not come back — they were
extracted, not authored.

`embeddingProvider` and `embeddingDim` must be compatible, or the agent lands in a
stranded state that reports as healthy while nothing works. Bedrock's embedder is
1024-only.

**Prompt caching has a write premium.** Caching pays off when a written prefix is
read again inside the TTL. On a low-traffic agent with single-turn conversations it
is a **net loss**. It pays on busy, multi-turn, or tool-heavy agents. Note the
switch only does something where the runtime injects cache markers: some providers
cache automatically and the switch is cosmetic there.

**`debugEnabled` is retroactive-blind.** It persists the full system prompt, the
messages array and the tool definitions per turn. Turning it on does not backfill:
a turn generated while it was off has no debug payload, forever. Turn it on, then
generate the turn, then read it. And turn it back off — it is PII at rest.

**Enterprise: an enabled output-side governance gate forces the turn non-streamed.** Blocking
or redacting an answer is impossible once tokens are on the wire, so the runtime
buffers the whole turn instead. The reply arrives all at once. A semantic gate adds
up to ~15s to the input path, and fails open on timeout.

**`toolResultsInHistoryEnabled` is unit-tested, not live-validated.** Validate it
against your own provider before relying on it in production.

## Not every per-agent setting is one of these booleans

The table above is the agent's own record. More surfaces are configured **per
agent**, each behind its own route, and none of them is reachable by editing a field
above. Know they exist before you conclude a behaviour has no home:

| Surface | What it configures | Where it is covered |
|---|---|---|
| **Skills** | the procedural knowledge the agent can load on demand, its version pin, its env values | `agent-skills` |
| **MCP servers** | external Model Context Protocol servers whose tools the agent equips, each with its own URL, auth mode and enabled flag | `tool-design`, `plugin-authoring` |
| **Event sources** | an inbound webhook, and the definitions that decide what a matched payload means | — |
| **Scheduled tasks** | a prompt sent to the agent on a cron, an interval, or once, with an optional outbound channel | — |
| **Retention** (Enterprise) | scheduled deletion of the agent's conversational data past N days, and whether the governance record survives it | — |
| **Voice channel** (Enterprise) | how the agent sounds on the phone: voice, speech recognition, wait lines and wait sound, what the voice does while each tool runs, and overrides of the language pack's prompts and word lists | `cli-workflows` |

An agent can create a scheduled task for itself, so an unexplained turn with no user
behind it is worth checking there before you go looking in the prompt.

## Prompt or switch?

If the desired change is about **what the agent has access to** — memory,
documents, prior tool output, the current time, its own state — it is a switch.
Writing it as a prompt instruction cannot work: the prompt cannot grant access it
does not have.

If it is about **how the agent behaves with what it has**, it is a prompt (or a
tool — see agent-prompt-design).

| Anti-pattern | What to do instead |
|---|---|
| "Remember what the user told you earlier" in the prompt | enable `memoryEnabled` |
| "You already called that tool, use its result" | enable `toolResultsInHistoryEnabled` |
| "Today is..." maintained by hand in the prompt | enable `datetimeInjectionEnabled` |
| "Consult the manual before answering" with no knowledge base | enable `knowledgeEnabled` and upload the document |
| "Never reply to a user who wrote STOP" | configure the opt-out fields — the runtime enforces it deterministically, and a model is the wrong enforcer for a legal obligation |
| Raising `temperature` to make replies "less repetitive" | fix the prompt: repetition is usually a prompt that restates itself |
| A prompt line telling the agent it cannot handle voice notes | set `sttProvider` to `disabled` — the runtime answers, and no transcription is attempted |

See also: `agent-prompt-design` (the per-agent switch is the sixth home in the where-does-this-live flowchart), `agent-prompt-writing` (don't restate in prose what a switch already provides), `agent-skills` (knowledge the agent loads on demand — assigned per agent, not a field on it).
