# Remaining Lane Commit Plan (MVP worktree)

Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/mvp`
Date: `2026-02-07`

## Current dirty files

- `apps/web/src/App.tsx`
- `apps/web/src/supabase.ts`
- `src-tauri/src/main.rs`
- `src/index.css`

## Goal

Ship remaining work in isolated commits so harness/runtime correctness is never mixed with web auth/data or UI styling.

## Lane A — Harness/runtime correctness

Files:

- `src-tauri/src/main.rs`

Suggested commit:

```bash
cd /Users/neilmcdevitt/code/arx/.worktrees/mvp
git add src-tauri/src/main.rs
git commit -m "Refactor turn command core and keep submit/send path behavior"
```

Validation (required before/after commit):

```bash
cd /Users/neilmcdevitt/code/arx/.worktrees/mvp
bash scripts/harness_failure_matrix_check.sh
cd /Users/neilmcdevitt/code/arx/.worktrees/mvp/src-tauri
cargo test -q
```

## Lane B — Web auth/profile/data behavior

Files:

- `apps/web/src/supabase.ts`
- `apps/web/src/App.tsx` (only related hunks)

Suggested commit flow:

```bash
cd /Users/neilmcdevitt/code/arx/.worktrees/mvp
git add apps/web/src/supabase.ts
git add -p apps/web/src/App.tsx
git commit -m "Harden web OAuth parsing and scope profile draft storage by user"
```

Validation:

```bash
cd /Users/neilmcdevitt/code/arx/.worktrees/mvp
npm run build
```

## Lane C — Desktop styling/UI polish

Files:

- `src/index.css`
- `src/App.tsx` (only UI wiring hunks if needed)

Suggested commit flow:

```bash
cd /Users/neilmcdevitt/code/arx/.worktrees/mvp
git add src/index.css
git add -p src/App.tsx
git commit -m "Refine tool activity presentation and inline group styling"
```

Validation:

```bash
cd /Users/neilmcdevitt/code/arx/.worktrees/mvp
npm run build
```

## Final integration gate

```bash
cd /Users/neilmcdevitt/code/arx/.worktrees/mvp
bash scripts/harness_failure_matrix_check.sh
cd /Users/neilmcdevitt/code/arx/.worktrees/mvp/src-tauri
cargo test -q
```

Manual (with `VITE_ARP_CLIENT=1`):

- Thread list loads.
- Thread create + workspace metadata update.
- Send prompt streams and persists final assistant message.
- Tool approval approve/deny both work.
- Cancel in-flight run returns to idle cleanly.
- Thread switch/back keeps messages and tool cards consistent.
- App restart does not duplicate rows.
