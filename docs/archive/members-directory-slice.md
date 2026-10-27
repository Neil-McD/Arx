# Members popup (current)

View all beside the channel People heading opens one themed Members popup.
Search, Auto-join, and join-request review live only in this popup. The sidebar
retains channel-scoped presence and existing profile/DM/settings shortcuts.
The popup shares its roster renderer and authorized readers: omitted channel ID
uses canonical General/community visibility; search uses the bounded directory.
No private-channel grants or private form/workflow context are exposed.

The popup reuses UserAvatar and CommunityMemberSettingsDialog. It focuses search
on open and restores focus on close. Profile/thread detail hides it without
discarding search/scroll; selecting a DM closes it. Viewer/community/channel
changes clear all state. Both themes use existing modal surfaces. No new tables,
mutations, permission model, or Members route are introduced. Staging only.

## Historical standalone page (retired)

The notes below describe the superseded page, not the current navigation contract.

Left navigation order: Agent, Knowledge, Events, Members; builder tools follow the divider.

Member cards and workflow cards/details reuse the channel feed's standard
40px `UserAvatar` holder and presence styling, without surface-local avatar sizing.
The shared member profile panel uses that same holder, including when opened from chat,
scaled to 64px for profile presentation. Only dimensions and initials size change;
shape, image crop, background and framing remain canonical.

Members is a full-width divided list, not a presence sidebar. It retains
the canonical avatar, authorized paginated directory, profile reader, membership
management dialog, and admission controls. Presence annotates a member; it does
not group, hide, or dim the roster. Opening a profile keeps the directory mounted
so search and scroll state survive Back.

Name search walks the existing authorized directory reader, not just loaded UI
rows and not the mention picker (which excludes self and caps candidates).
Each search batch reads at most ten 100-row pages and stops after a page brings
the match count to at least 25. Search further continues its cursor. Partial
results are explicitly labeled; query/viewer/community changes discard stale
responses. It introduces no backend reader, index, or authorization policy.

Limits: this is bounded sequential search, not indexed search. For large
communities an indexed canonical directory is a separate performance slice.
The directory now pages memberships by join order, with the owner once on the
first page. Existing entitlement/block checks filter each member. Presence is
optional activity annotation, never a prerequisite for inclusion; missing
activity remains blank. Versioned cursors restart cached presence pagination
safely. No schema change, backfill, or synthetic presence write is needed.

Auto-join lives beside search on Members for owners/admins, using the
canonical platform selector and existing immediate-save action. It is available
only to authorized managers of currently free communities; enabling it also
approves pending requests through the existing backend flow. Pending state and
errors remain visible. Settings has no duplicate. Pending request review appears
only when relevant. Invitations use the existing left-navigation action only.

The list uses one column at every width. Each row has the canonical avatar,
name and role, with no activity or joined timestamp. The full row opens the existing profile; its
separate manager-only ellipsis opens the existing management dialog. Message
lives in the profile. Search and scroll survive profile Back. Subtle surfaces
and focus/hover states use theme tokens and respect reduced motion.

No private workflow, form, or agent context appears in the directory. Role,
remove, ban, and billing permissions/confirmations remain unchanged.
Release target: staging only.
