import { defineHook } from "@polyant-ai/plugin-sdk";

/**
 * A hook does NOT declare its own event — there is no `event` field in the spec.
 * The event -> function binding lives in the agent's configuration, so one hook
 * function can be wired to several events. Read `ctx.event` and branch.
 *
 * Returning nothing means observe-only: this hook writes state and lets the turn
 * proceed. State writes are commit-on-success, so a cancelled turn leaves no trace.
 */
export default defineHook({
  name: "seedChannelIdentity",
  description:
    "Copies the trusted channel identity into conversation state at the start of a " +
    "conversation, so tools can read it instead of trusting a model-supplied argument.",
  summary: {
    "en-US": "Remembers who is writing at the start of each conversation.",
    "it-IT": "All'inizio di ogni conversazione memorizza chi sta scrivendo.",
  },
  handler: async (ctx) => {
    if (ctx.event !== "conversation_start") return;

    // The runtime seeds this server-side. It is the injection-resistant source of
    // identity — unlike anything the model puts in a tool argument.
    const identity = ctx.state.channel;
    if (!identity) return;

    ctx.state.set("contactChannelType", identity.type);
    ctx.state.set("contactChannelId", identity.id);
    if (identity.userName) ctx.state.set("contactName", identity.userName);

    ctx.audit.log({ action: "seedChannelIdentity", success: true, output: identity.type });
  },
});
