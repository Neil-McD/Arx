# Polynet plugin for ChatGPT and Codex

The package OpenAI's plugin directory takes: one remote MCP server
(`https://www.polynet.ai/runtime/mcp`, OAuth through AuthKit with a client
ID metadata document), the listing text, icons, and the review test cases.
No skills and no hooks.

Build the ZIP (files at the ZIP's root):

```
cd plugins/openai/polynet && zip -r -X ../polynet-openai.zip plugin.json mcp.json assets
```

Upload it at platform.openai.com → Plugins → "Upload new or existing plugin".
Outside the ZIP, the dashboard asks for the reviewer login and the domain
token, which `apps/web/public/.well-known/openai-apps-challenge` serves.

The test cases use the Unlisted demo community "Harbor Run Club" on
production. Keep its people, posts and events matching what the cases expect,
and set Jordan Lee back to member after each review run.
