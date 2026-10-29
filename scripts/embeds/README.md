# Course embeds

Tools for bringing the interactive parts of an existing course page into Polynet
as live embeds (```polynet-embed blocks), with a still and written-out text for
places embeds can't run. Any founder can point them at their own page.

1. `node extract-embeds.mjs <config.json> [page.html] [outDir]` cuts each widget
   out of a self-contained page into its own HTML file. The original script runs
   unchanged; everything but the widget is hidden; storage is made safe for a
   sandboxed frame and saves through `polynetEmbed`; colours and fonts follow the
   community theme (`--pn-*`). Writes `manifest.json`.
2. `node render-stills.mjs <config.json> <embedsDir> <stillsDir> [data.json]`
   renders each embed sandboxed, saves a still per widget, and can dump the
   page's widget data. Needs `playwright-core` (or `playwright`) and Chrome.
3. `python xray_lessons.py <lessons dir> <data.json> <manifest.json>` is the
   Business X-Ray example of rewriting lessons: an embed block per widget, then
   the widget's content as plain text.
4. `python details_to_lesson.py ...` gathers a page's collapsible "go deeper"
   sections into one lesson.

`xray.config.json` is the config for the Business X-Ray course page. Course
content stays on the founder's machine; nothing here contains it.
