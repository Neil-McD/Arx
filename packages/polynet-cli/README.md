# @polynet/cli

Put your community's site live on Polynet.

```bash
cd my-site
npx @polynet/cli deploy --community <your-community-slug>
```

- Your site is a folder of static files with an `index.html` (HTML, CSS,
  JavaScript, images). It talks to Polynet through `/__polynet/sdk.js`; the
  guide for building one is at `https://<slug>.polynet.page/__polynet/llms.txt`.
- The first run opens your browser to sign in with Polynet. You must be the
  community's owner or an admin. The community is saved in `polynet.json`, so
  later deploys are just `npx @polynet/cli deploy`.
- Only changed files upload. The site is live at `https://<slug>.polynet.page`.
- `polynet logout` forgets your sign-in (kept in `~/.polynet/auth.json`).

Limits: static files only, up to 50 MB and 2,000 files.
