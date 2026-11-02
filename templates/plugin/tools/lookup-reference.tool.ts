import { z } from "zod";
import { defineTool } from "@polyant-ai/plugin-sdk";

/**
 * Static schema. It may not read `ctx` — it is serialized to JSON Schema at
 * module load. Strict-mode rules apply (see the tool-design skill):
 *   no .optional()  -> use .nullable(), treat null as absent in execute
 *   no .url()       -> validate the shape at runtime, return an error result
 *   no .default()   -> apply the default in execute
 */
const parameters = z.object({
  reference: z.string().min(1).describe("Identifier to look up in the external system"),
  includeArchived: z
    .boolean()
    .nullable()
    .describe("Include archived records. null means false"),
});

type Input = z.infer<typeof parameters>;

export default defineTool({
  name: "lookupReference",
  description:
    "Look up an identifier in the external system. Returns status 'found' with the " +
    "record, 'not_found' if the identifier does not exist, or 'error' if the lookup " +
    "could not be performed.",
  // `description` above is for the model and stays one English string. `summary`
  // and the field labels are for the people configuring the agent: one text per locale.
  summary: {
    "en-US": "Looks up an identifier in the external system.",
    "it-IT": "Cerca un identificativo nel sistema esterno.",
  },
  // An id the panel names in every locale (crm, email, files, data, …), not text.
  category: "data",
  requiredSecrets: [
    {
      key: "example_api_key",
      type: "text",
      label: { "en-US": "Example API key", "it-IT": "Chiave API di Example" },
      description: {
        "en-US": "Key of the Example account the lookups run as.",
        "it-IT": "Chiave dell'account Example con cui vengono fatte le ricerche.",
      },
    },
    // sensitive:false so the admin panel shows it in clear — it is config, not a credential
    {
      key: "example_base_url",
      type: "text",
      sensitive: false,
      label: { "en-US": "Example base URL", "it-IT": "URL base di Example" },
    },
  ],
  parameters,
  execute: async (input: Input, ctx) => {
    const startedAt = Date.now();

    // ctx.secrets is scoped to the keys declared above. An undeclared key is absent.
    const apiKey = ctx.secrets?.example_api_key;
    const baseUrl = ctx.secrets?.example_base_url;

    // Errors are returned as DATA, never thrown. A throw takes away the model's
    // ability to decide whether to retry, ask the user, or degrade.
    if (!apiKey || !baseUrl) {
      return { status: "error", message: "example_api_key or example_base_url is not configured" };
    }
    if (!baseUrl.startsWith("https://")) {
      return { status: "error", message: "example_base_url must start with https://" };
    }

    const includeArchived = input.includeArchived ?? false;
    const url = `${baseUrl}/records/${encodeURIComponent(input.reference)}?archived=${includeArchived}`;

    try {
      // ctx.abortSignal stops the call when nobody waits for it any more. It is
      // absent on engines before 1.3.4, and fetch ignores an undefined signal.
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: ctx.abortSignal,
      });

      if (response.status === 404) {
        // Audit the outcome, never the payload: a record can carry PII.
        ctx.audit.log({
          action: "lookupReference",
          success: true,
          output: "not_found",
          durationMs: Date.now() - startedAt,
        });
        return { status: "not_found" };
      }

      if (!response.ok) {
        ctx.audit.log({
          action: "lookupReference",
          success: false,
          error: `http_${response.status}`,
          durationMs: Date.now() - startedAt,
        });
        return { status: "error", message: `The external system responded ${response.status}` };
      }

      const record = (await response.json()) as Record<string, unknown>;
      ctx.audit.log({
        action: "lookupReference",
        success: true,
        output: "found",
        durationMs: Date.now() - startedAt,
      });
      return { status: "found", record };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.audit.log({
        action: "lookupReference",
        success: false,
        error: message,
        durationMs: Date.now() - startedAt,
      });
      return { status: "error", message: `The external system is unreachable: ${message}` };
    }
  },
});
