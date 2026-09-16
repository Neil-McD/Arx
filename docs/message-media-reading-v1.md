# Message media reading V1

## Scope

Community posts/replies and direct messages share link media rendering and PDF
reading. Message content, upload storage, access decisions, and MCP writes are
unchanged. This is a web presentation contract; it does not change server persistence.

- YouTube links remain visible in authored text. Up to 12 distinct videos get
  previews in authored order, deduplicated by video ID (first timestamp wins).
  Code blocks and inline code do not become previews. Additional links remain
  usable in the message.
- A responsive grid places two videos together when space permits, stacking on
  narrow screens. Uploaded images continue in two-column rows beyond four;
  uploaded video players also use a responsive grid. The conversation owns
  vertical scrolling; preview groups do not get nested scroll regions.
- YouTube owns titles, channel identity, branding, and playback controls through
  its official embedded player. Polynet mounts the iframe within 200px of the
  viewport without autoplay and keeps it mounted through scrolling and ordinary
  rerenders. Authored timestamps, inline playback, fullscreen, sandbox and
  referrer policy remain intact. No custom thumbnail, title cache, oEmbed request,
  or extra metadata footer remains.
- YouTube has its own grid: at most two columns, a 360px column threshold, and
  200px minimum player height. Narrow messages stack players. This does not
  change the uploaded-video grid or widen the conversation shell.
  A subtle 8px clipped outer corner radius leaves native player UI intact.
  If the actual container is narrower than YouTube's 200px minimum, show a
  timestamp-preserving YouTube link instead. Resizing below that threshold
  unmounts the player to prevent hidden audio; normal scrolling does not.
- Sent multi-image DMs use the available message width (up to 300px); the
  composer stays compact. Single-image sizing is unchanged.
- PDF uploads identified by MIME or filename and pasted HTTPS links ending in
  `.pdf` share a document card. Signed query strings are preserved. Extensionless
  pasted URLs remain ordinary links because their file type is unknown.
- Opening a card loads PDF.js and its same-origin worker on demand. The modal
  provides grouped previous/next controls, fit width, visible stepped zoom from
  0.75× to 4× fit width (with the existing 16-million-pixel canvas cap), selectable text, download, and an
  original-file link. It renders one page at a time and cancels work on changes
  or close. Document scripts/forms are not executed. PDF requests omit cookies.
  Document loading and individual page rendering each have a 30-second deadline.
  Failure exposes Retry and keeps the original-file link available; Retry starts
  a fresh document load, resets to page one and fit width, and cancels prior work.
  Page navigation starts at the top; zoom does not reset the scroll position.
  Fonts, character maps, and image decoders are served from the same application
  using versioned asset paths and fetched only when needed by a document.
- Inaccessible, password-protected, unsupported, or cross-origin-blocked PDFs
  retain an explicit original-file fallback. The browser does not relay private
  PDFs to an external viewer service or bypass the file host's access policy.
- The native modal remains inside its owning message/DM host in the DOM while
  the browser's top layer prevents clipping. Reader interactions do not dismiss
  the conversation. Escape closes only the reader and returns focus to its card;
  subsequent Escape/outside clicks retain normal DM dismissal behavior.
  The host also checks for an owned open modal before handling Escape, because
  disabling the focused last-page Next button can move focus to the page body.

## Verification and release

`npm run release:gate` includes the required deterministic browser proof:
`npm run check:media-reading-browser-proof`. Install the matching browser with
`npx playwright install chromium`; CI uses `--with-deps`. A missing browser fails
the gate rather than skipping it. CI retains screenshots with release evidence.

The proof exercises actual community message components and the real DM host,
with fixture-only data and synthetic public-media responses. It covers desktop
and narrow layouts, light/dark themes, native-player dimensions, multiple images,
lazy PDF loading, text selection layers, page navigation, 4× zoom, download,
scroll, Escape/focus ownership, failure/timeout retry, cancellation and reopening.
A 20-video history checks deferred mounting and player identity across rerenders
and scrolling. It sends no messages and accesses no real DM data.

Provider responses are mocked for deterministic CI. This is not proof of real
YouTube playback or every video's embedding permissions. Run
`node scripts/media_reading_browser_proof.mjs --serve` for browser review with
the approved public YouTube examples. Validate native provider controls/playback
and authorized PDF storage URLs on signed-in staging before an authorized
production release. No schema migration or Convex deployment is required.
