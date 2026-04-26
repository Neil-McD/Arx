# Product Docs Search Contract

This contract defines the searchable product documentation directory used by the
web docs surface and future agent documentation tools.

## Purpose

Product docs must be readable by humans and easy for agents to retrieve without
injecting the full corpus into every prompt.

The canonical source remains the Markdown files listed in
`docs/product/manifest.json`. Generated files are derived artifacts.

## Generated Artifacts

- `docs/product/generated/index.json`: canonical searchable directory.
- `docs/product/llms.txt`: compact LLM entrypoint and directory.
- `docs/product/llms-full.txt`: full concatenated product documentation for
  offline ingestion and debugging.

Run `npm run generate:product-docs-index` after editing product docs.
Run `npm run check:product-docs-index-proof` before release.

## Index Shape

Each indexed document includes:

- `id`: stable document id from the manifest.
- `slug`: stable lookup key, such as `primitives/community`.
- `title`, `section`, `summary`, `audience`, `status`, `source`: manifest
  metadata.
- `search`: curated retrieval metadata from the manifest, including aliases,
  keywords, queries, related slugs, and an optional page boost.
- `frontmatter`: parsed source frontmatter for auditability.
- `content`: frontmatter-stripped Markdown content.
- `headings`: extracted headings in source order.
- `keywords`: deterministic search terms from metadata, curated search
  metadata, and headings.
- `chunks`: heading-based retrieval units.
- `word_count`: full document word count.
- `search_text`: normalized text for simple lexical search.

Each chunk includes:

- `id`: stable chunk id in the form `<slug>#<heading>`.
- `slug`: parent document slug.
- `heading`: chunk heading when one exists.
- `level`: heading level when one exists.
- `text`: chunk Markdown.
- `word_count`: chunk word count.
- `search_text`: normalized text for lexical search.

## Retrieval Rules

Future documentation tools should expose two operations first:

1. `search_product_docs(query, filters?)`
   Returns ranked snippets with `slug`, `title`, `section`, `chunk_id`,
   `heading`, and a short excerpt.
2. `get_product_doc(slug, section?)`
   Returns one full document, or one heading section when requested.

Default search responses should be small. The tool should return enough context
to choose the next lookup, not the entire docs corpus.

## Ranking Baseline

The first implementation should be deterministic lexical search:

- exact slug/title matches rank highest;
- exact curated query and alias matches rank alongside slug/title matches;
- title, summary, section, and heading matches rank above body matches;
- curated aliases, keywords, and queries rank above body matches;
- common terms across many docs contribute less than rare terms;
- chunk matches rank above full-document fallback matches;
- return top five results by default.

Vector search may be added later, but it should not replace the deterministic
directory contract.

## Invariants

- Every manifest source must exist.
- Every manifest source must contain frontmatter.
- Every manifest slug must be unique.
- Every indexed document must have at least one retrievable chunk.
- Generated files must be reproducible from source docs.
- The web docs surface must read from the generated directory, not a separate
  hand-maintained document map.
