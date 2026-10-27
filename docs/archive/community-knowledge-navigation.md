# Community Knowledge navigation

Knowledge is the navigation label for the existing resources route. Existing
course and lesson URLs remain valid. The default view is Resources; Graph
reuses CommunityMemoryGraph and the authorized community overview gateway.
Switching views retains the mounted resource editor so unsaved work is not lost.
Opening a different course returns to Resources. Changing communities remounts
Knowledge and resets its selection.

The graph controller is mounted by Knowledge and fetches/subscribes only while
Graph is selected and community access allows it. Leaving Graph disposes the
subscription. No memory schema, visibility policy, or private member/workflow
context changes are part of this UI move.

Members uses the existing members destination on desktop and mobile, including
existing member visibility, pagination, profiles, and manager-only controls.
Profile selection uses the canonical profile renderer and authorized context
gateway; profile state resets when the viewer or community changes.
Channels no longer reserve a permanent members/memory sidebar, including during
loading. Explicit thread replies and profile drawers remain.

The optional two-pane workspace is a separate slice. This change introduces
neither a window manager nor another Agent entry point.
