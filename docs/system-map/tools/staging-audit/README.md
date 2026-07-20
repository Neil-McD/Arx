# Read-only staging shape audit

These files are Convex inline-query modules. They are not deployed and expose no mutation/action or provider/network capability. Each query:

- runs only through `npx convex run --inline-query` against explicit deployment `quick-porcupine-949`;
- uses bounded `take(limit + 1)` reads and reports truncation;
- aggregates in the query and returns no row IDs, user/community identifiers, text content, credentials, tokens, URLs, or raw personal data;
- may return workflow/status labels and aggregate staging financial totals;
- records its query version and row caps.

Invocation pattern:

```bash
npx convex run \
  --deployment quick-porcupine-949 \
  --inline-query "$(<docs/system-map/tools/staging-audit/identity-access.mjs)" \
  --typecheck disable \
  --codegen disable
```

Do not add `--push`, `--prod`, an action/mutation name, or a production selector. Results belong in a commit/deployment-addressed evidence document, never in generated source or product state.
