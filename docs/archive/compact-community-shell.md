# Community shell resizing

Desktop uses the production shell's continuous sidebar width:
`clamp(168px, 20vw, 420px)`. The community rail and navigation remain visible
through the 900px range; no additional navigation toolbar or alternate state
replaces the page. At 720px and below the existing desktop icon-navigation
rules apply. Dedicated mobile routes retain their separate mobile shell.

The channel roster remains visible beside desktop chat, like production. Its
People/back presentation applies only at viewport widths up to 640px, not when
the desktop chat area becomes narrow because the sidebar is present. Thread and
profile drawer overlays retain their existing content-width behavior.

The obsolete 900px container-query shell, navigation disclosure state, and
main-content-hiding drawer override are removed. The current channel roster,
member popup, Agent page, DM overlay and workflow board remain unchanged.
Resizing must not remount pages or clear drafts. Workflow lane overflow remains
owned by the board; member-list overflow remains owned by each lane.

Acceptance: compare staging and production at matching browser zoom and widths
above/below 900px, 720px and 640px. Check channel navigation, thread/profile back,
Agent plus DMs, and Workflows. Verify draft continuity through resize and keep
both themes and dedicated mobile routes usable. No backend changes.
