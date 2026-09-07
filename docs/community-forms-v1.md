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
Publishing alone never runs an agent or moves a member.

## Member delivery

- `request_form` assigns the current published version to a member. Existing
  contribution/time triggers can invoke it; it is not an automatic entry action.
- Identity is workflow + membership activation + milestone visit + automation.
  Repeated contributions/retries reuse the request, even after submission.
- One private sidebar entry, below community identity/banner and above channels,
  opens the oldest pending request. Other pending requests remain selectable.
- Cloud answers autosave with revision checks. A submit validates and freezes them.
- `form_submitted` currently supports `move_member` only. Submission and movement
  share one transaction; no synthetic channel source or agent destination is invented.
- Milestone movement cancels unfinished requests. Stale/revoked visits fail closed
  on reads and writes. Historical submitted answers remain available to managers.
- Owners/admins read submitted responses in the member dossier. Answers are not
  exported to shared memory, global profile, or agent prompts.
- Dark/light use existing semantic tokens; mobile reuses the same navigation slot.

Agent consumption, private-channel cards, branching, uploads, reminders and embeds
remain separate slices. Optional questions may be skipped; progress counts actual
answered questions, not achievement of the member's outcome.

Requests pin a published revision; never reinterpret old answers
against a changed draft. Future submissions belong to the exact community,
member and request, not the global profile or shared community memory.

Verification: `npx vitest run convex/communityForms.test.ts`, web and Convex
typechecks, release gate, then browser authoring/preview/publish on staging.
