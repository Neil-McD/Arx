# Community forms: authoring slice

Forms live inside Workflows. Owners and entitled admins author an ordered question
list on one canvas and preview one question at a time. There is no new global tab.

Workflows uses one persistent Workflows / Integrations / Forms selector built on
the canonical platform tab primitive. The `section` query parameter selects Forms
or Integrations; absence selects the board. Integrations is explicitly unavailable,
not a connection catalog. Form-editor tab changes flush pending edits and remain
in Forms on failure. Published-form loading failures are visible and retryable.

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
- Save and publish failures retain separate retry operations. An uncertain publish
  response is retried against the saved revision, never represented as a failed save.
- Publish validation selects the first invalid question and focuses its field,
  using the same validation rules as the server. Form-name failures focus the name.
- Client identity/community changes invalidate pending access; backend rechecks it.

Preview answers exist only in component memory and are never submitted.
Publishing alone never runs an agent or moves a member.

## Member delivery

- Admission is capped at 12 pending requests in the member's current activation
  and milestone visit, including requests issued by subsequently removed rules.
  Exact assignment retries are resolved before the capacity check. A full queue
  records `form_pending_limit_reached` without writing a new request or blocking
  independent completion. Previous visits/activations do not consume capacity.
- Pending reads use an exact visit/status index and 12-row pages. Current clients
  offer Load more for pre-existing overflow; legacy clients receive the first page.
  Realtime changes invalidate later loaded pages instead of mixing visits.
- Advancement invalidates the old visit atomically and cancels its first 25
  pending requests in the same transaction. Existing scheduler continuations
  drain only that exact visit in 25-row batches. Submitted answers and next-visit
  requests are untouched; cancelled drafts retain their saved answers.
  This is not a global historical-row purge or a new worker system.

- `request_form` assigns the current published version to a member. Existing
  contribution/time triggers can invoke it; it is not an automatic entry action.
- Identity is workflow + membership activation + milestone visit + automation.
  Repeated contributions/retries reuse the request, even after submission.
- One private sidebar entry, below community identity/banner and above channels,
  opens the oldest pending request. Other pending requests remain selectable.
- Cloud answers autosave with revision checks. A submit validates and freezes them.
- Background saves do not disable answer fields. A single in-flight save retains
  its snapshot; newer edits remain dirty and save afterward. Navigation/submit
  briefly lock editing. Failures pause saving until explicit retry or reload.
- Retry preserves the exact failed payload and operation (including Submit),
  using existing server idempotency. No second save queue or persistence is added.
- `form_submitted` supports one `move_member` requirement and one `prompt_agent`
  action per form and milestone. Movement waits for all requirements and remains
  transactional. Agent actions bind the exact submitted
  request to the existing queue and assigned private service channel. No synthetic
  channel source or timer is invented; delivery failure does not discard answers.
- Admission requires the current milestone visit. Once admitted, a form response
  can publish after milestone movement or completion; the exact run, submitted
  request, original action and membership activation remain authoritative. The
  current action must remain unchanged, the agent enabled, and the private service
  audience and context snapshot valid at publication. Movement grants no new
  actions or tools. The agent action is matched by its run key, not by counting
  all form-triggered rules. Timer semantics are unchanged.
- Milestone movement cancels unfinished requests. Stale/revoked visits fail closed
  on reads and writes. Historical submitted answers remain available to managers.
- Owners/admins read submitted responses in the member dossier. Answers are not
  exported to shared memory, global profile, or ordinary channel-agent prompts.
  Scheduled and form-submission workflow actions may use bounded form evidence under the
  member-and-managers disclosure boundary below.
- Dark/light use existing semantic tokens; mobile reuses the same navigation slot.

Private-channel cards, branching, uploads, reminders and embeds
remain separate slices. Optional questions may be skipped; progress counts actual
answered questions, not achievement of the member's outcome.

Requests pin a published revision; never reinterpret old answers
against a changed draft. Future submissions belong to the exact community,
member and request, not the global profile or shared community memory.

Verification: `npx vitest run convex/communityForms.test.ts`, web and Convex
typechecks, release gate, then browser authoring/preview/publish on staging.
`node scripts/form_builder_browser_qa.mjs` exercises the actual builder with
synthetic transport: question targeting/focus, uncertain publication retries,
slow saves/newer edits, leave/reopen, save failures, conflicts, and preview isolation.
It does not replace the live staging authoring check.

Member runner regressions: `npx vitest run scripts/member_form_save.test.ts`
and `node scripts/member_form_browser_qa.mjs`. The browser proof renders the
actual component at 390px with canonical themes and synthetic transport to test
slow saves, newer edits, resume, validation, exact submit retry, and focus.
It is not a live-cloud canary or a physical-phone keyboard test.
## Private workflow evidence

Builder response reads request completeness metadata from the same endpoint
(`includeCompleteness: true`): rows, scan truncation, and unavailable-record count.
The legacy array response remains only for already-open clients during rollout.
The UI distinguishes no submissions in the current membership activation from
an incomplete or unverifiable view. It never interprets an incomplete empty
page as proof that no responses exist. Full answers retain their current shape.

The milestone editor warns when evaluation and movement use the same form:
if that submission satisfies all conditions, advancement may cancel the queued
assessment. This is guidance only; saved rules and execution remain unchanged.

Submitted requests are also a read-only projection in the builder dossier and
lease-authorized internal workflow context. `communityFormEvidenceCore.ts` is
the common validated reader for this projection and builder responses.
It checks active membership, exact community/workflow/form-version ownership,
answer validity, and current membership activation. Earlier milestones remain
historical evidence; pending/cancelled requests and previous activations do not.

The reader scans at most 50 submitted assignments plus one lookahead, ordered
by request creation (not submission time). Context includes at most five verified
submissions, 1,000 characters per answer value, and 12,000 characters across
form names, question labels and answers, with an 8,000-character serialized
evidence cap (including references and JSON escaping). Choice indices resolve against the
pinned version. Source/version/visit references accompany answers. Truncation
and unverifiable records are explicit; an empty projection is not proof that no
older evidence exists. Builder responses retain the existing full-answer shape
within the same bounded validated scan.

This is contextual data, never trusted instructions or deterministic completion
proof. Reading it does not authorize disclosure to a channel. No member-facing
profile, self-context, or ordinary channel-agent payload gains these
answers. Authorized builder native/MCP reads use the private path below.
No facts or Markdown copies are persisted; submitted forms can satisfy a completion
requirement and independently request a bounded private agent response.

## Form-aware scheduled actions

Existing `milestone_elapsed` -> `prompt_agent` execution composes approved member
orientation and submitted-form evidence. It does not read builder-private facts,
the full dossier, internal prompts, or conversation history. No new wake or tool
is introduced. Captured context includes exact request/version/answer references.

When forms are present, generation requires an assigned restricted service room
whose current readable audience is the member and community managers, plus the
community agent. Canonical channel capabilities remain authoritative. The bounded
audience inspection fails closed beyond 200 grant rows. Ordinary multi-member
rooms without form evidence retain the existing scheduled-message behavior.

Snapshot recording and final publication recheck the audience and context;
expired leases, changed evidence, reassignment, or an extra client block delivery.
A form-informed publication requires its matching durable context snapshot.
Retries retain the existing serve-request identity and duplicate protection.
Answers are untrusted historical statements, not instructions or completion proof.

This fence governs generation and publication time. Later channel invitations
still grant access to existing room history under normal channel policy; builders
must not repurpose client rooms as shared rooms containing confidential history.
Published messages may be read by agents acting with those users' canonical
channel access. This slice does not create separate per-message secrecy.

Tests in `communityAgentTimedWorkflow.test.ts` use synthetic forms and stub final
provider text. They prove prompt composition, receipts and publication fencing,
not live model quality. A controlled staging canary remains a separate release gate.
# Builder-agent response retrieval

Authorized personal agents and official MCP clients discover private member workflow
context through `polynet_list` at `/communities/<slug>/builder/workflow-members/`.
Pages contain at most 50 membership identities and an explicit `next_cursor`.
Names are not unique selectors: use the returned membership document path, and
clarify ambiguous names. `polynet_read` reuses the UI dossier resolver and checks
current owner/admin authority and active subject membership on each read.

The generated document includes canonical form/version evidence and explicit
truncation/unavailable-record indicators. No new persisted context, form-answer
copies, or response-management page exists. Community agents cannot access this
private subtree even when sponsored by an owner. Submitted answers are untrusted
evidence, not instructions or proof of goal completion; reading them does not
authorize publishing them to a shared channel.

## Workflow activity explanations

Member detail and authorized dossier Markdown explain failed form/channel/agent
actions using validated linked receipts and allowlisted error codes. Unknown
failures explicitly leave partial work uncertain; missing links do not establish
failure or delivery. A recorded workflow-context change is presented as “No longer
applicable,” separate from failed, queued, or running. These are read-only
projections: no retry button, automatic repair, replay, or new execution state.
Changing configuration does not replay a historical action.
