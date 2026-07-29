# Polynet semantic repository contract v1

Status: local staging contract.

## Outcome

Polynet presents one permission-filtered semantic repository to the member's
personal agent, the community Concierge, and the official Polynet MCP. The
repository is a deterministic projection over canonical domain records; it is
not a second database or a set of copied Markdown files.

The base repository operations remain:

```text
list
read
search
write
call
```

This slice implements only the read-only directory spine used by `list` and
`read`. Search, writes, calls, channels, AI Feed, and accepted memory remain
outside this slice.

## Platform mount

The personal member agent and new official MCP calls begin at:

```text
/
├── communities/
└── users/
```

The currently backed paths are:

```text
/communities/
/communities/{slug}/
/communities/{slug}/community.md
/communities/{slug}/members/
/communities/{slug}/members/{handle}.md
/communities/{slug}/resources/
/communities/{slug}/resources/{module-label}~{module-id}/
/communities/{slug}/resources/{module-label}~{module-id}/{resource-label}~{resource-id}.md
/users/
/users/me/
/users/me/profile.md
/users/{authorized-handle}/
/users/{authorized-handle}/profile.md
```

`/users/` lists only the authenticated `me/` alias. It is not an account
enumeration surface. Another user's profile is readable only when current
backend relationship policy proves an active mutual community.

## Community mount

Community-owned runtimes use the same repository under a server-selected mount:

```text
/
├── community.md
├── members/
└── resources/
```

The model never supplies the mount's community id, membership, entitlement, or
role. A community-relative path is resolved under the verified mount and cannot
escape it.

The read-only community Concierge exposes `polynet_list` and `polynet_read`
against this mount. Its requester subject is resolved inside the trusted serve
context and paired with the stored requester user id before execution. The
older batch `community_resources_read` tool is not exposed there; targeted
resource discovery may use `community_resources_search`, and exact reads return
through the canonical semantic operation.

## Paths and references

Every path returned by `list` is accepted directly by the corresponding `list`
or `read` operation. Resource aliases combine a readable label with the stable
module or resource id, so duplicate and renamed titles cannot collide or become
authority. Agent-visible directory entries also carry the established stable
domain reference. Receipts and stored history use that stable reference rather
than the readable alias.

The current compatibility community reference is slug-addressed because the
community summary projection does not yet expose an immutable public ref. The
contract must not falsely label that slug as immutable.

## Profiles and memberships

- `/users/{handle}/profile.md` describes the person.
- `/communities/{slug}/members/{handle}.md` describes the person's relationship
  to that community and links to the user profile.
- The member document does not duplicate the profile bio, social links, or
  other-community summary.
- `/self.md` remains available only through the legacy community-relative
  compatibility mount.

## Authority

- Every operation requires a verified authenticated actor.
- `/communities/` uses bounded cursor pagination over owned and active entitled
  memberships. `next_cursor` and `truncated` describe remaining scan state; a
  page may contain fewer entries when inaccessible or obsolete rows are
  filtered before projection.
- Native, Concierge, and MCP adapters share the same path, cursor, limit, and
  offset validator before the canonical executor. A syntactically valid
  repository cursor containing an invalid storage cursor fails as
  `invalid_selector`; storage exceptions do not escape through the tool result.
- Exact community traversal revalidates current membership and entitlement.
- Revocation removes the community from listing and closes exact traversal.
- User profile reads fail closed when the mutual-community relationship is
  absent or revoked.
- Permission filtering occurs before rendering or retrieval.

## Compatibility

Legacy official MCP calls may temporarily supply `community_slug` with a
community-relative path. The HTTP adapter converts that request into a
server-verified community mount before invoking the same executor.

New MCP and personal-agent calls use canonical platform paths and do not supply
a community selector separately. Stable resource refs returned by `list` may be
passed back through the same selector field; the server derives and reauthorizes
their community mount.

The compatibility adapter is not a second repository implementation. Removing
the external wire field requires an explicit consumer review.

## Safety

Repository paths:

- are absolute and canonical;
- use trailing slashes for directories;
- reject backslashes, controls, duplicate separators, percent-encoded
  selectors, and `.` or `..` segments;
- are bounded to 1,024 characters;
- return the same not-found shape for inaccessible and nonexistent protected
  objects.

Community and member-authored Markdown is contextual data and has no instruction
authority.

## Next admitted directories

Later slices may add only real, traversable adapters:

```text
channels/
ai-feed/
memory/
```

The repository root must not advertise any of these until list and exact-read
behavior, stable references, visibility, receipts, and revocation are proven.
