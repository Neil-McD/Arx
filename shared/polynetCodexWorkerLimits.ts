// Concurrency caps for PolyNet Codex worker turns. Concurrent runs on the
// same project share the one project sandbox (and its volume), so these caps
// bound parallel agents per workspace and per user — not sandbox count.
export const POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT = 5;

// Each admitted run occupies one active Daytona-hosted Codex runtime target.
// Keep this conservative until the direct Daytona scheduler is proven live.
export const POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT = 10;

// A single user can occupy at most the deployment pool in this staging slice.
export const POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT = 10;

// A run counts against admission while it is still "running" and started
// within this window. This is a zombie-accounting backstop, not an active
// agent-turn timeout; Codex turns have no product hard cap by default.
export const POLYNET_CODEX_WORKER_ACTIVE_RUN_WINDOW_MS = 20 * 60 * 1000;
