# Members directory

Members is a full-width community directory, not a presence sidebar. It retains
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
The existing directory is presence-backed; completeness for never-present
members remains an existing reader concern, not solved by this UI change.
Auto-join remains available because Settings does not yet expose that policy.
Do not remove it until its canonical control has been relocated.

No private workflow, form, or agent context appears in the directory. Role,
remove, ban, and billing permissions/confirmations remain unchanged.
Release target: staging only.
