# Message media reading V1

## Scope

Community posts/replies and direct messages share link media rendering and PDF
reading. Message content, upload storage, access decisions, and MCP writes are
unchanged. This is a web presentation slice based on production `7dcba7693`.

- YouTube links remain visible in authored text. Up to 12 distinct videos get
  previews in authored order, deduplicated by video ID (first timestamp wins).
  Code blocks and inline code do not become previews. Additional links remain
  usable in the message.
- A responsive grid places two videos together when space permits, stacking on
  narrow screens. Uploaded images continue in two-column rows beyond four;
  uploaded video players also use a responsive grid. The conversation owns
  vertical scrolling; preview groups do not get nested scroll regions.
- Public YouTube titles and channel names load near the viewport through the
  provider's oEmbed endpoint, with a six-second timeout and bounded in-memory
  request cache. Only the canonical video URL is sent, without credentials or
  message text. Provider HTML is never rendered. Failure leaves the thumbnail,
  explicit play button, generic label, and usable original links. Playback
  starts only on click, using the existing embedded player.
- PDF uploads identified by MIME or filename and pasted HTTPS links ending in
  `.pdf` share a document card. Signed query strings are preserved. Extensionless
  pasted URLs remain ordinary links because their file type is unknown.
- Opening a card loads PDF.js and its same-origin worker on demand. The modal
  provides previous/next page, fit width, zoom, selectable text, download, and an
  original-file link. It renders one page at a time and cancels work on changes
  or close. Document scripts/forms are not executed. PDF requests omit cookies.
  Fonts, character maps, and image decoders are served from the same application
  using versioned asset paths and fetched only when needed by a document.
- Inaccessible, password-protected, unsupported, or cross-origin-blocked PDFs
  retain an explicit original-file fallback. The browser does not relay private
  PDFs to an external viewer service or bypass the file host's access policy.

## Verification

`npm test`, `npm run check:web-typecheck`, `npm run build`, and
`npm run check:web-bundle-budget` validate the candidate.

`node scripts/media_reading_browser_proof.mjs` exercises the actual community
message components and DM panel at desktop/mobile sizes, with deterministic
public-media and two-page PDF fixtures. It checks titles, grouping, five images,
click-only playback, lazy PDF loading, text rendering, navigation, zoom,
download, Escape, and inaccessible-document fallback. Screenshots are written
to the printed temporary directory. This proof does not send real messages.

Live YouTube oEmbed/CORS was separately checked against a public video. The
browser proof mocks provider responses for repeatability; it does not certify
every video's availability or permission to embed.
Pass `--live-metadata` to exercise real YouTube title fetching in that proof.

## Release gate

Review this isolated candidate, then verify actual authorized storage URLs and
video metadata in a signed-in staging chat and DM before production release.
Production has not been changed by this implementation. No Convex deployment
or schema migration is required.

The web lockfile also updates pre-existing `browserslist` and `fflate`
transitive dependencies within their declared ranges to clear current audit
advisories. PDF.js is pinned; no new viewer backend or provider account is added.
