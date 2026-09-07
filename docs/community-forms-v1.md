# Community forms: authoring slice

Forms live inside Workflows. Owners and entitled admins author an ordered question
list on one canvas and preview one question at a time. There is no new global tab.

## Contract

- Drafts autosave; incomplete questions are allowed. Failed saves retain local edits.
- Publish validates all questions and creates an immutable revision snapshot.
- Text (short/long) and choice (single/multiple), description and required flag.
- Add, delete and reorder questions; keep at least one question.
- Limits: 30 forms/community, 30 questions/form, 12 options/question.
- Community-scoped cloud records are canonical; no member facts are written.
- Every endpoint uses authenticated community-manager authorization.
- Saves use expected revisions; conflicts never silently overwrite another draft.
- Exact content retries and repeated publication are idempotent.
- Client identity/community changes invalidate pending access; backend rechecks it.

Preview answers exist only in component memory and are never submitted.
Published forms are not delivered to members yet. Assignments, submissions,
submission triggers, agent context consumption, branching, uploads and embeds
are separate slices. Publishing alone never runs an agent or moves a member.

Future requests must pin a published revision; never reinterpret old answers
against a changed draft. Future submissions belong to the exact community,
member and request, not the global profile or shared community memory.

Verification: `npx vitest run convex/communityForms.test.ts`, web and Convex
typechecks, release gate, then browser authoring/preview/publish on staging.
