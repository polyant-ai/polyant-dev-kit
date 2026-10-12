import { describe, it, expect } from "vitest";
import hook from "./seed-identity.hook.js";
import type {
  HookContext,
  HookEvent,
  ConversationStateApi,
  ChannelStateIdentity,
} from "@polyant-ai/plugin-sdk";

/**
 * A ConversationStateApi backed by a plain object, so tests can assert on
 * what actually landed in state instead of on mock call arguments.
 */
function fakeState(channel?: ChannelStateIdentity): ConversationStateApi {
  const data: Record<string, unknown> = {};
  return {
    get: (key) => data[key],
    set: (key, value) => {
      data[key] = value;
    },
    getAll: () => ({ ...data }),
    delete: (key) => {
      delete data[key];
    },
    channel,
  };
}

// HookContext requires `conversation` and `secrets` (unlike ToolContext, where
// they are optional) — see hooks.ts. Every field below is filled in so the
// fake is a real HookContext, not a partial cast.
function context(event: HookEvent, channel?: ChannelStateIdentity): HookContext {
  return {
    event,
    payload: {
      instance: { slug: "test" },
      conversation: { id: "conv-1" },
      channel: { type: channel?.type ?? "web", id: channel?.id ?? "user-1" },
      user: { name: "Test User" },
      message: { text: "hello" },
    },
    conversation: { getRecentMessages: async () => [] },
    state: fakeState(channel),
    secrets: {},
    instance: { slug: "test", flags: {} },
    ai: { chat: async () => "" },
    audit: { log: () => {} },
  };
}

describe("seedChannelIdentity", () => {
  it("does nothing on a non-matching event", async () => {
    const ctx = context("message_received", { type: "whatsapp", id: "+1555" });
    await hook.handler(ctx);
    expect(ctx.state.getAll()).toEqual({});
  });

  it("does nothing when no channel identity is present", async () => {
    const ctx = context("conversation_start", undefined);
    await hook.handler(ctx);
    expect(ctx.state.getAll()).toEqual({});
  });

  it("writes the channel type and id on a matching event with an identity", async () => {
    const ctx = context("conversation_start", { type: "whatsapp", id: "+1555" });
    await hook.handler(ctx);
    expect(ctx.state.getAll()).toEqual({
      contactChannelType: "whatsapp",
      contactChannelId: "+1555",
    });
  });

  it("also writes contactName when userName is present", async () => {
    const ctx = context("conversation_start", {
      type: "telegram",
      id: "123",
      userName: "Ada",
    });
    await hook.handler(ctx);
    expect(ctx.state.getAll()).toEqual({
      contactChannelType: "telegram",
      contactChannelId: "123",
      contactName: "Ada",
    });
  });
});
