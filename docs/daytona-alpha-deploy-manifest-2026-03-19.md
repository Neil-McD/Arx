# Daytona Alpha Deploy Manifest

## Canonical Source

- Preserve branch: `codex/daytona-freeze-20260319`
- Deploy-prep branch: `codex/daytona-deploy-prep-20260319`
- Frozen source commit: `713e19eb3aa54d0fb6bf1c76630d9a1ec9ee6e4a`
- Frozen tag: `daytona-freeze-2026-03-19`
- Raw local backup: `/Users/neilmcdevitt/code/daytona-raw-backup-20260319-114702`
- Source local backup: `/Users/neilmcdevitt/code/daytona-source-freeze-20260319-114702`

Deploy only from `713e19eb3aa54d0fb6bf1c76630d9a1ec9ee6e4a` or an explicitly named follow-up release candidate branched from it.

## Scope

This manifest is for the web-native Daytona alpha only.

Included:
- auth and verified actor resolution
- runtime turns
- community chat
- community resources
- community AI feed
- community settings
- public funnel
- discover
- personal memory for Builder and Architect

Not expanded for this alpha:
- personal memory for free users
- real Stripe checkout, billing portal, payouts, or revenue reporting

## Deploy Targets

### Backend

- Platform: Convex
- Functions root: `convex/`
- Config file: `convex.json`
- Deploy command:

```bash
cd /Users/neilmcdevitt/code/arx/.worktrees/daytona
npm run convex:deploy
```

### Frontend

- Platform: Vercel
- Root directory: `apps/web`
- Build command: `npm run build`
- Output directory: `dist`
- Rewrites config: `apps/web/vercel.json`

## Environment Matrix

### Required for Core Alpha

Set these for the deployed environment before alpha smoke testing:

- `VITE_CONVEX_URL`
- `ARX_DB_KEY`
- `ARX_AUTH_AUTHORIZE_URL`
- `ARX_AUTH_TOKEN_URL`
- `ARX_AUTH_CLIENT_ID`
- `ARX_AUTH_JWT_ISSUER`
- `ARX_AUTH_JWT_JWKS_URL`
- `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT=false`
- `VITE_PUBLIC_APP_URL`

Strongly recommended:

- `ARX_AUTH_SCOPE=openid profile email offline_access`
- `ARX_AUTH_JWT_ALGORITHM=RS256`

Optional auth/provider values if your identity provider needs them:

- `ARX_AUTH_CLIENT_SECRET`
- `ARX_AUTH_AUDIENCE`
- `ARX_AUTH_PROVIDER_QUERY_KEY`
- `ARX_AUTH_LOGOUT_URL`
- `ARX_AUTH_MAGIC_LINK_URL`
- `ARX_AUTH_JWT_AUDIENCE`
- `VITE_CONVEX_PUBLIC_KEY`
- `VITE_AUTH_JWT_ISSUER`
- `VITE_AUTH_REDIRECT_URL`

### Optional Capability Env

Only configure these if you want the capability live in alpha.

#### Daytona workspace tools

- `DAYTONA_API_KEY`
- `DAYTONA_API_URL`
- `DAYTONA_ORG_ID`
- `DAYTONA_TARGET`
- `DAYTONA_SNAPSHOT`
- `DAYTONA_AUTO_STOP_INTERVAL_MINUTES`
- `DAYTONA_AUTO_DELETE_INTERVAL_MINUTES`

If these are missing, workspace tools should be treated as unavailable.

#### Archive retrieval / embeddings

- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `GEMINI_EMBEDDING_MODEL` optional

If these are missing, archive retrieval should degrade gracefully.

#### Runtime provider fallback

- `OPENROUTER_API_KEY`
- `ARX_OPENROUTER_REFERER` optional
- `ARX_PLATFORM_DEFAULT_MODEL` optional
- `ARX_PUBLIC_MODEL_MAP_JSON` optional
- `ARX_PLATFORM_MODEL_MAP_JSON` optional

#### Voice

- `ARX_VOICE_TRANSCRIBE_ENABLED`
- `ARX_VOICE_PRIMARY_MODEL`
- `ARX_VOICE_FALLBACK_MODEL`
- `OPENAI_API_KEY` or `ARX_VOICE_PRIMARY_API_KEY`
- `GROQ_API_KEY` or `ARX_VOICE_FALLBACK_API_KEY`
- `ARX_VOICE_FALLBACK_ENDPOINT` optional

### Not Live Yet

Keep these staged, absent, or explicitly non-authoritative until real Stripe is wired:

- billing portal
- payouts onboarding
- revenue reporting
- provider-backed subscription status claims

Stripe-related envs may exist locally, but they are not part of the current alpha truth.

## Auth Redirect Truth

Before alpha sign-in testing:

- add the production web origin to the auth provider allowlist
- add the exact callback/bridge URL if your provider needs an explicit redirect
- add preview domains only if preview auth is required

Minimum production origin to allow:

- `https://<your-vercel-domain>`

## Required Verification Before Deploy

Run from the frozen snapshot:

```bash
cd /Users/neilmcdevitt/code/arx/.worktrees/daytona
npm run convex:codegen
npm run check:gate-parity
npm run check:runtime-turn-contract-guard
cd apps/web && npm run build
```

## Deployment Order

1. Confirm the target source is still `713e19eb3aa54d0fb6bf1c76630d9a1ec9ee6e4a`.
2. Fill Convex production env.
3. Deploy Convex.
4. Fill Vercel production env.
5. Deploy the web app from the same source snapshot.
6. Confirm auth redirect allowlists are correct.
7. Run the live smoke pass.

## Live Smoke Pass

### Core

1. Anonymous public chat works.
2. Sign-in works on the live domain.
3. Authenticated free user can access normal web and community surfaces.
4. Discover loads.
5. Public funnel loads.

### Community

1. Community chat loads and sends.
2. Community resources load.
3. Community AI feed loads and reacts.
4. Community settings load with honest billing posture.
5. Create-community gating behaves correctly.

### Memory

1. Personal memory loads for Builder/Architect.
2. Personal memory create/pin/delete works.
3. Free users are not incorrectly shown personal memory access.

### Optional Capability Checks

Only run if configured:

- workspace tools if Daytona env is present
- archive retrieval if Gemini env is present
- voice if voice env is present

### Negative Checks

These should not appear as live:

- fake billing portal
- fake payouts onboarding
- fake revenue charts
- free-tier personal memory

## Deployment Record

After deploy, record:

- frontend URL
- Convex deployment name or URL
- deployed commit SHA
- deployment date/time
- smoke pass result
- enabled optional capabilities
- known staged systems

## Release Rule

If a blocker appears:

1. branch from `713e19eb3aa54d0fb6bf1c76630d9a1ec9ee6e4a`
2. fix only the blocker
3. rerun verification
4. deploy the new SHA
5. keep `daytona-freeze-2026-03-19` untouched as the original preserved snapshot
