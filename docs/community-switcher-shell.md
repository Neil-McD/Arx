# Community workspace switcher (staging)

Desktop community workspaces use the identity header to switch communities.
The switcher consumes the existing ordered community list, attention map, and
selection handler. It does not create a second membership or agent-context store.
Discover and Create use their existing actions. Account settings lives beside
the invite action in the navigation footer; community settings remains in the header.

The desktop workspace no longer renders or reserves a separate community rail.
Discover, global settings, and mobile retain their existing rail/navigation.
Banner media retains its canonical framing renderer, with a taller desktop
identity area that contracts on short screens. No-banner communities remain compact.
The right rail and optional panels retain their existing state and ownership.

Acceptance: test switching with unsaved-change protection, unread indication,
search, keyboard/outside dismissal, Discover/Create/account navigation, both
themes, compact navigation, and optional right-panel layout on staging.
