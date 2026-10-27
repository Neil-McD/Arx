# Licensing

Polynet is open source, in two layers.

## The platform: AGPL-3.0

Everything in this repository is licensed under the
[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`), except
the parts listed below. That covers the Convex backend (`convex/`, `shared/`),
Polynet Studio (`apps/web/`), the community edge (`infra/`), and the scripts
and docs that come with them.

In plain words: you can read, run, change and share it. If you run a modified
version as a service for other people, you must offer them your source code
under the same license.

## What builders use: MIT

These parts are licensed under the [MIT License](packages/polynet-cli/LICENSE),
so a community's site, its AI agent and its tools never carry AGPL obligations:

- `packages/` — the Polynet CLI (`@polynet/cli`), its site checks, and the
  agent guide and skills it installs into a site folder.
- `infra/community-edge/dispatch/src/sdk.ts`, `ui.ts` and `llms.ts` — the SDK
  (`/__polynet/sdk.js`), the account shell (`/__polynet/ui.js`) and the builder
  guide (`/llms.txt`) that every community site loads. See
  [`LICENSE-MIT`](infra/community-edge/dispatch/src/LICENSE-MIT).

A community's own site, built on these, belongs to its founder under whatever
license they choose.

## Not covered

- **Polynet brand assets**: the Polynet name, logo and favicons
  (`apps/web/public/favicon*`, `apps/web/public/landing-polynet/`) are not
  licensed under the AGPL or MIT. See [TRADEMARK.md](TRADEMARK.md).
- **Third-party marks**, such as the app logos in `apps/web/public/app-logos/`,
  belong to their owners and are used only to identify those services.

## Commercial licenses

If the AGPL doesn't work for your organization, a commercial license is
available. Contact the maintainer, [@Neil-McD](https://github.com/Neil-McD).

## Contributions

Contributions are accepted under the [Contributor License Agreement](CLA.md),
which keeps both layers above and the commercial option possible.

## The name

The code is open; the Polynet name and logo are not. See
[TRADEMARK.md](TRADEMARK.md).
