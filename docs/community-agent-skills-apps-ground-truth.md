## Community Agent Ground Truth

Date: 2026-04-13

This document freezes the irreducible alpha model for the community agent surface.

### Irreducible truth

There are only 3 real things:

- `Policy`: who can use what in a community
- `Behavior`: how the agent should operate
- `Capability`: what the agent can actually do

For the current alpha slice:

- `Workspace` is the active behavior/config surface
- `Apps` is the active capability surface
- `Skills` are now real package attachments, injected on demand

### User-facing truth

The current community owner/admin flow should stay simple:

1. open `AI Agent -> Apps`
2. connect a remote MCP app
3. Polynet validates it and discovers tools
4. Polynet mounts it to the current community
5. open `AI Agent -> Skills`
6. attach reusable skill packages to the current community
7. that community now carries mounted tools plus attached skills as part of its lens

Moderators and members do not manage this surface.

### System truth

The system underneath stays split even though the UX stays simple:

- `DeveloperApp`
- `AppConnection`
- `AppToolSnapshot`
- `CommunityAppMount`
- `SkillPackage`
- `CommunitySkillAttachment`

This is required for reliability and security.

### Non-negotiables

- the platform harness stays fixed
- secrets/auth do not live in community config
- apps are validated before mount
- community app access fails closed
- mounted tool inventory is explicit
- skill packages are injected only when selected, not dumped into every turn
- skill packages are separate from app login/connection state in the current alpha
- every future tool call must be auditable

### Deferred

These are not part of the current truthful alpha system:

- skills marketplace/discovery
- CLI app mounts from the community UI
- multiple transport choices
- OAuth app onboarding
- broad implicit skill matching
