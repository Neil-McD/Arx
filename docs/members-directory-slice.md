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
The directory now pages memberships by join order, with the owner once on the
first page. Existing entitlement/block checks filter each member. Presence is
optional activity annotation, never a prerequisite for inclusion; missing
activity remains blank. Versioned cursors restart cached presence pagination
safely. No schema change, backfill, or synthetic presence write is needed.

Auto-join now lives in Settings → Community → Access & Pricing, using the
canonical platform selector and existing immediate-save action. It is available
only to authorized managers of currently free communities; enabling it also
approves pending requests through the existing backend flow. Pending state and
errors remain visible. The roster retains request review, not policy editing.

No private workflow, form, or agent context appears in the directory. Role,
remove, ban, and billing permissions/confirmations remain unchanged.
Release target: staging only.
