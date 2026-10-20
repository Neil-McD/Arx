# @polynet/cli

Put your community's site live on Polynet.

> Preview: until Polynet's production release, deploys go to Polynet's staging
> environment. Start at https://polynet.page.

```bash
npx @polynet/cli create my-site --community <your-community-slug>   # a complete starter site
cd my-site                                                          # make it yours: theme.css, content.js
npx @polynet/cli deploy
```

- Your site is a folder of static files with an `index.html` (HTML, CSS,
  JavaScript, images). It talks to Polynet through `/__polynet/sdk.js`; the
  guide for building one is at `https://<slug>.polynet.page/__polynet/llms.txt`.
- The first run opens your browser to sign in with Polynet. You must be the
  community's owner or an admin. The community is saved in `polynet.json`, so
  later deploys are just `npx @polynet/cli deploy`.
- Only changed files upload. The site is live at `https://<slug>.polynet.page`.
- Building with an AI agent? `create` puts `AGENTS.md`, `CLAUDE.md` and
  Polynet's skills (build-site, design, accessibility, sdk, deploy-verify) in
  the folder, under `.agents/skills` and `.claude/skills`. Open the folder in
  Claude Code, Codex or Cursor and say what you want. `polynet skills` adds or
  updates them in any site folder.
- `polynet check` checks the site: the Polynet shell on every page and the
  accessibility basics (language, title, zoom, image alt text, named buttons
  and links). `deploy` runs it first and stops on errors.
- Agent guides, `polynet.json`, dotfiles and `node_modules` are never uploaded.
- `polynet logout` forgets your sign-in (kept in `~/.polynet/auth.json`).

Limits: static files only, up to 50 MB and 2,000 files.
