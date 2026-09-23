# Community Funnel V2 Authority Kernel

Status: historical custom-funnel contract. New writes retired 2026-09-23; see `docs/product/primitives/funnel.md` for the current entry path. Historical rows and receipts are preserved for audit.

## Irreducible model

Each community has exactly:

- one deterministic default funnel derived from canonical community data;
- one private custom draft;
- one immutable published custom snapshot;
- one explicit live selector: `default` or `custom`.

Canonical lookup fails closed if historical data ever contains more than one
funnel row for a community. It never silently selects one duplicate.

There are no slots, free-form page documents, generated markup, or implicit
publication states in this kernel.

## Canonical content

Custom content is `CommunityFunnelContentV2`:

- headline;
- subheadline;
- exactly three pillars, each with a title and body;
- bounded long-form Markdown.

Polynet, not the content record, owns layout, theme, VSL placement, member
proof, pricing, admission language, and CTAs.

The Markdown grammar rejects raw HTML, links, images, code, and tables. VSLs
are manager-controlled HTTPS URLs limited to YouTube, Vimeo, Loom, and Wistia.

## Authority and transitions

- Manager query: reads private draft, published snapshot, revisions, and live mode.
- Draft save: manager-only and compare-and-swap on `draftRevision`.
- VSL save: manager-only, separate from AI-editable copy, and compare-and-swap.
- Publish: manager-only; copies one exact draft revision into the published snapshot.
- Activation: manager-only; custom requires a published snapshot and the expected published revision.
- Public query: exposes only the currently live snapshot; never exposes draft state.

Publishing does not activate custom. Editing a draft does not mutate the
published snapshot. Selecting default never deletes the custom draft or
published snapshot.

## Compatibility

The existing profile-media editor remains a compatibility adapter. Removing
legacy hero media cannot delete canonical draft or published state. Historical
rows with a published custom snapshot and no selector remain custom-live until
a manager explicitly selects default.

The staging slot/V1 transition completed through a bounded census-first
migration before this strict schema landed. The temporary operator module and
compatibility validators were removed after a second census proved zero
duplicate rows, slot markers, community selectors, and V1 documents.

## Deliberately absent

- any second custom funnel;
- free-form generated markup or layout authority;
- AI control over the VSL, pricing, access, publication, or activation;
- duplicate public or preview renderers.
