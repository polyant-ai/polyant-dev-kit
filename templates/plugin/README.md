# Example Polyant plugin

A minimal plugin: one tool, one hook, both tested.

## Use it as a starting point

    cp -r templates/plugin ../my-plugin
    cd ../my-plugin
    npm install
    npm test

Then edit `plugin.json` — `name` and `namespace` decide how your tools are
addressed (`<namespace>:<toolName>`); `displayName` and `description` are how the
panel presents the plugin, one text per locale (`en-US`, `it-IT`). Inside the code
the same split holds: a tool's `description` is what the model reads and stays one
English string, while its `summary` and the `label` and `description` of each
field it asks for are what people read, one text per locale.

## Load it into an agent

This directory needs its **own** `node_modules` (a plugin file resolves imports
from its realpath), so `npm install` here, then point your instance at it:

    PLUGIN_DIRS=/absolute/path/to/my-plugin

Never use a symlink — the loader resolves it to the realpath and the dependencies
go missing. Then enable the tool in the agent's Tools list. On Polyant Enterprise
two steps come first: a Platform Admin grants the plugin to your organization, and
an Organization Admin assigns it to the workspace. Each of those steps is silent
when it is missing: the tool is simply absent.

## What the examples demonstrate

`tools/lookup-reference.tool.ts` — a closed `status` set the prompt can branch on,
errors returned as data instead of thrown, secrets scoped to what the tool
declared, runtime URL validation (strict mode forbids `.url()` in the schema), and
auditing the outcome without the payload.

`hooks/seed-identity.hook.ts` — a hook does not declare its event; it reads
`ctx.event`. It takes identity from the trusted channel state, not from a model
argument.

See the `tool-design`, `plugin-authoring` and `agent-prompt-design` skills in
the `polyant-dev-kit` workspace you copied this template from — they are not
copied along with this directory.
