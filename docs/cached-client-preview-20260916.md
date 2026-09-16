# Production client compatibility preview

Temporary acceptance branch based on production 496e06f42b6b4117b56c544fff75fc52e70c4716. Application source and auth handlers are unchanged. Only this document, the deployment guard, and vercel.json differ. Do not merge this branch into main or staging.

GitHub-triggered preview builds are admitted only for polynet-staging, this branch, and preview environment. Build assertions require quick-porcupine-949 and the existing auth bridge. Shared staging and production aliases remain unchanged. No Convex deployment is part of this web build.

Acceptance target: Forms Release Acceptance Sep15. Sign in normally, then test production attachment upload/send against the candidate backend. Browser failures and simulated failures must be reported separately.
