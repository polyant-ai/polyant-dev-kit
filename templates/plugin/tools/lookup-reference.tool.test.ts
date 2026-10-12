import { describe, it, expect, vi, afterEach } from "vitest";
import tool from "./lookup-reference.tool.js";
import type { ToolContext } from "@polyant-ai/plugin-sdk";

// Fully-typed fake context, matching the pattern in the hook test
// (seed-identity.hook.test.ts) instead of `as never`, which would disable the
// only type-level guard this template has.
//
// `artifacts` is the one member the engine always mounts (SDK 1.9), so the type
// requires it. This tool hands no file to another tool, so the fake refuses.
const context = (secrets: Record<string, string>): ToolContext => ({
  instanceId: "test" as ToolContext["instanceId"],
  secrets,
  audit: { log: vi.fn() },
  artifacts: {
    put: async () => {
      throw new Error("lookupReference stores no artifact");
    },
    take: async () => null,
  },
});

const input = { reference: "abc", includeArchived: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupReference", () => {
  it("returns an error result when the secrets are not configured", async () => {
    const result = await tool.execute(input, context({}));
    expect(result).toEqual({
      status: "error",
      message: "example_api_key or example_base_url is not configured",
    });
  });

  it("rejects a non-https base url without calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await tool.execute(
      input,
      context({ example_api_key: "k", example_base_url: "http://insecure.test" }),
    );
    expect(result).toMatchObject({ status: "error" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns not_found on a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, ok: false }));
    const result = await tool.execute(
      input,
      context({ example_api_key: "k", example_base_url: "https://api.test" }),
    );
    expect(result).toEqual({ status: "not_found" });
  });

  it("returns found with the record on a 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ id: "abc" }) }),
    );
    const result = await tool.execute(
      input,
      context({ example_api_key: "k", example_base_url: "https://api.test" }),
    );
    expect(result).toEqual({ status: "found", record: { id: "abc" } });
  });

  it("never throws when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await tool.execute(
      input,
      context({ example_api_key: "k", example_base_url: "https://api.test" }),
    );
    expect(result).toMatchObject({ status: "error" });
  });

  it("serializes parameters to JSON Schema at load, with nullable fields still required", () => {
    expect(tool.inputSchema).toMatchObject({
      type: "object",
      properties: { reference: { type: "string" } },
    });
    expect(tool.inputSchema.required).toContain("reference");
    expect(tool.inputSchema.required).toContain("includeArchived");
  });
});
