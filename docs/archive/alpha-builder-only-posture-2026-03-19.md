## Alpha Builder-Only Posture

> Historical evidence only. This note describes the March 2026 alpha builder-only posture and is not current release truth. Current release truth lives in `docs/alpha-release-workflow.md`.

Date: 2026-03-19

This is a temporary alpha-testing posture change, not a product-direction reversal.

### Product truth for alpha

- One live community: Neil's community
- Public upgrade path: Free -> Builder
- Architect stays in code and internal testing, but is hidden from normal alpha upgrade UI
- Community creation is internal-only during alpha

### UI changes

- The left-rail community creation CTA is repurposed to `Become a Builder`
- The upgrade modal is simplified to only show `Free` and `Builder`
- Architect remains available only through internal/dev controls

### Backend truth

- `community:createCommunity` is blocked for everyone except the creator allowlist
- This keeps the backend honest even if an old client path or direct mutation call tries to create a community

### Why

Alpha only needs to prove:

1. users can use Polynet
2. users can upgrade to Builder
3. paid Builder access unlocks the real workbench/workspace layer

Everything else adds scope and ambiguity before Stripe-backed alpha billing is live.
