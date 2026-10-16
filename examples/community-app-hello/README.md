# Hello, community: a minimal Polynet community app

One static HTML file that shows the whole app contract:

1. Polynet opens the app in its community's **Apps** tab, in an iframe on the
   app's own origin.
2. The app posts `{ type: "polynet:session:request" }` to its parent.
3. Polynet replies, only to the app's registered origin, with
   `{ type: "polynet:session", version: 1, token, expires_at, community_slug, api_url }`.
4. The app calls `POST api_url` with `Authorization: Bearer <token>` and
   `{ "tool": "polynet_list" | "polynet_read" | "polynet_search" | "polynet_write" | "polynet_call", "input": {...} }`.

Calls act for the signed-in member, only inside that community, never with
founder authority, and only with the verbs the founder allowed when registering
the app. Sessions last 15 minutes; ask again for a fresh one.

## Try it on staging

```bash
python3 -m http.server 5179 --directory examples/community-app-hello
```

Then, as a founder on staging, open your community's **Apps** tab, register an
app with origin `http://localhost:5179`, and open it.

The full contract is in
[`docs/canonical-platform-operation-contract-v1.md`](../../docs/canonical-platform-operation-contract-v1.md)
under "Community apps".
