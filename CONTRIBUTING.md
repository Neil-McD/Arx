# Contributing to Polynet

Thanks for helping. Polynet is small and moves fast, so a few rules keep it
simple.

## Before you start

- **Open an issue first** for anything bigger than a small fix, so we can agree
  on the approach before you write code.
- **Security problems** go through [SECURITY.md](SECURITY.md), never a public
  issue.
- Read [AGENTS.md](AGENTS.md): it is the product and architecture contract
  for everyone working in this repository, people and AI agents alike.

## Making a change

1. Fork the repository and branch from `main`.
2. Keep the change small and focused: one pull request, one topic.
3. Run the release gate locally and make sure it passes:

   ```bash
   npm ci
   npm run release:gate -- --mode=local
   ```

4. Fill in every section of the pull request template.
5. Sign the [Contributor License Agreement](CLA.md) when the CLA bot asks: reply
   to its comment with the sign phrase, once, on your first pull request.

## Review

Every pull request needs green CI (`Release Gate`, `Secret Scan`) and a review.
Changes to sign-in and sessions, billing, payouts, memberships and
entitlements, MCP access, or data migrations also need the maintainer's
explicit approval.

## License

Your contributions are licensed as described in [LICENSING.md](LICENSING.md):
AGPL-3.0 for the platform, MIT for the CLI, SDK and builder tools.

By participating, you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
