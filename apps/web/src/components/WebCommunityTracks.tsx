import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowDown, ArrowUp, BadgeCheck, Check, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  COMMUNITY_MAIN_TRACK_KEY,
  type CommunityTrackRule,
  type CommunityTrackStageDefinition,
  type CommunityTrackView,
} from "../../../../shared/communityLessonTracks";
import {
  fetchCloudCommunityLessonTracks,
  saveCloudCommunityLessonTrack,
  setCloudCommunityLessonTrackArchived,
  type CommunityBuilderTrack,
  type CommunityBuilderTracks,
} from "../../../../shared/cloudCommunityLessonTracksGateway";
import type { CommunityResource } from "./communityResourcesContracts";
import "./WebCommunityTracks.css";

// Knowledge → Roadmap with skill tracks. One track shows
// the Roadmap board as before; several get a calm home: a Continue card, the
// member's tracks, and "Coming up" for tracks a checkpoint will open. The
// board itself is the Roadmap's own (WebCommunityLessonBoard), handed one
// track's lessons at a time.

/** One track's lessons in the lesson fields the board groups by. */
export function communityTrackResources(resources: readonly CommunityResource[], track: CommunityTrackView): CommunityResource[] {
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  return track.stages.flatMap((stage) => stage.steps.flatMap((step, index) => {
    const resource = byId.get(step.resource_id);
    if (!resource) return [];
    return [{
      ...resource,
      lesson: { ...(resource.lesson ?? {}), stage: stage.name, stage_order: stage.position, order: index + 1, gate: step.checkpoint || undefined },
    }];
  }));
}

/**
 * A track's stages after a Roadmap board save (rename, move or add), for every
 * track but the main one: each update puts its lesson in that stage at that
 * order; stages keep their order, with new ones placed by stageOrder.
 */
export function communityTrackStagesAfterBoardSave(
  stages: readonly CommunityTrackStageDefinition[],
  updates: ReadonlyArray<{ resourceId: string; stage: string; stageOrder?: number; order?: number }>,
): CommunityTrackStageDefinition[] {
  const moved = new Map(updates.map((update) => [update.resourceId, update]));
  const checkpoint = new Map(stages.flatMap((stage) => stage.steps).map((step) => [step.resource_id, step.checkpoint]));
  const rows = new Map<string, { position: number; steps: Array<{ id: string; order: number }> }>();
  stages.forEach((stage, index) => rows.set(stage.name, {
    position: index + 1,
    steps: stage.steps.filter((step) => !moved.has(step.resource_id)).map((step, at) => ({ id: step.resource_id, order: at + 1 })),
  }));
  for (const update of updates) {
    const row = rows.get(update.stage) ?? { position: update.stageOrder ?? rows.size + 1, steps: [] };
    if (update.stageOrder !== undefined) row.position = update.stageOrder;
    row.steps.push({ id: update.resourceId, order: update.order ?? row.steps.length + 1 });
    rows.set(update.stage, row);
  }
  return [...rows.entries()]
    .sort(([, left], [, right]) => left.position - right.position)
    .map(([name, row]) => ({
      name,
      steps: row.steps.sort((left, right) => left.order - right.order)
        .map((step) => ({ resource_id: step.id, ...(checkpoint.get(step.id) ? { checkpoint: true } : {}) })),
    }))
    .filter((stage) => stage.steps.length > 0);
}

/** The track a member most likely wants: the one they're in, else the first open one. */
export function communityContinueTrack(tracks: readonly CommunityTrackView[]) {
  return tracks.find((track) => track.status === "in_progress" && track.next)
    ?? tracks.find((track) => track.open && track.next)
    ?? null;
}

const ACTION_LABEL: Record<CommunityTrackView["status"], string> = { locked: "Locked", open: "Start", in_progress: "Continue", done: "Review" };

/** Buying a sold track: its price, and moving the member up to the offer that includes it. */
export type CommunityTrackOfferAccess = {
  priceFor: (offerKey: string) => string | null;
  upgrade: (offerKey: string) => void;
  busy: boolean;
  note: string | null;
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function formatTrackMinutes(total: number) {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function trackFacts(track: CommunityTrackView) {
  return [
    plural(track.stages.length, "module"),
    plural(track.step_count, "lesson"),
    track.minutes ? `about ${formatTrackMinutes(track.minutes)}` : null,
  ].filter(Boolean).join(" · ");
}

/**
 * The route cover: one dot per section along a dotted path, done sections
 * filled, the one the member is on ringed, the finish a check. Drawn in
 * currentColor so it takes the community's colour (or white on a filled panel).
 */
function TrackRoute({ track, width = 220, height = 96 }: { track: CommunityTrackView; width?: number; height?: number }) {
  const sections = track.stages.length ? track.stages : [{ done_count: 0, step_count: 1, locked: false }];
  // Long tracks sample their sections so the dots stay apart.
  const count = Math.min(sections.length, 9);
  const pick = (index: number) => sections[Math.round((index * (sections.length - 1)) / Math.max(count - 1, 1))];
  const pad = 14;
  const slots = Math.max(count, 2);
  const points = Array.from({ length: slots }, (_, index) => ({
    x: pad + ((width - pad * 2) * index) / (slots - 1),
    // Up, over and down again, like a trail: low, middle, high, middle…
    y: [height - pad - 4, height / 2, pad + 4, height / 2][index % 4],
  }));
  const path = points.reduce((d: string, point, index) => {
    if (index === 0) return `M${point.x} ${point.y}`;
    const before = points[index - 1];
    const mid = (point.x - before.x) / 2;
    return `${d} C${before.x + mid} ${before.y} ${point.x - mid} ${point.y} ${point.x} ${point.y}`;
  }, "");
  const currentAt = Array.from({ length: count }, (_, index) => pick(index)).findIndex((stage) => stage.done_count < stage.step_count && !stage.locked);
  const allDone = track.status === "done";
  return (
    <svg className="track-route" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" />
      {points.slice(0, count).map((point, index) => {
        const stage = pick(index);
        const done = stage.step_count > 0 && stage.done_count >= stage.step_count;
        const last = index === count - 1 && count > 1;
        if (last && (allDone || done)) {
          return (
            <g key={index}>
              <circle cx={point.x} cy={point.y} r="10" fill="currentColor" />
              <path d={`M${point.x - 4.5} ${point.y}l3 3 6-6.5`} fill="none" stroke="var(--track-route-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        }
        if (done) return <circle key={index} cx={point.x} cy={point.y} r="7.5" fill="currentColor" />;
        if (index === currentAt) return <circle key={index} cx={point.x} cy={point.y} r="9" fill="var(--track-route-ink)" stroke="currentColor" strokeWidth="3.5" />;
        return <circle key={index} cx={point.x} cy={point.y} r="6" fill="var(--track-route-ink)" stroke="currentColor" strokeWidth="2" />;
      })}
    </svg>
  );
}

function TrackDiagram() {
  return (
    <svg className="track-route" viewBox="0 0 200 110" width="200" height="110" aria-hidden="true">
      <rect x="10" y="12" width="56" height="34" rx="6" fill="var(--track-route-ink)" stroke="currentColor" strokeWidth="2" />
      <rect x="134" y="12" width="56" height="34" rx="6" fill="var(--track-route-ink)" stroke="currentColor" strokeWidth="2" />
      <rect x="72" y="64" width="56" height="34" rx="6" fill="currentColor" />
      <path d="M66 29h68M38 46v18c0 8 6 12 14 12h20M162 46v18c0 8-6 12-14 12h-20" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="100" cy="81" r="6" fill="var(--track-route-ink)" />
    </svg>
  );
}

function TrackTerminal() {
  return (
    <svg className="track-route" viewBox="0 0 200 110" width="200" height="110" aria-hidden="true">
      <rect x="24" y="10" width="152" height="90" rx="10" fill="var(--track-route-ink)" stroke="currentColor" strokeWidth="2" />
      <path d="M24 30h152" stroke="currentColor" strokeWidth="2" />
      <circle cx="38" cy="20" r="3" fill="currentColor" />
      <circle cx="50" cy="20" r="3" fill="currentColor" />
      <path d="M44 52l14 10-14 10M68 74h34" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A track's cover: the owner's image, else the built-in art they picked, in the community's colours. */
export function TrackArt({ track, size = "card" }: { track: CommunityTrackView; size?: "card" | "hero" }) {
  if (track.cover_url) return <img className="track-art-image" src={track.cover_url} alt="" />;
  if (track.cover_style === "diagram") return <TrackDiagram />;
  if (track.cover_style === "terminal") return <TrackTerminal />;
  return size === "hero" ? <TrackRoute track={track} width={420} height={150} /> : <TrackRoute track={track} />;
}

function TrackCard({ track, onOpen, onEdit }: { track: CommunityTrackView; onOpen: () => void; onEdit?: () => void }) {
  const percent = track.step_count ? Math.round((track.done_count / track.step_count) * 100) : 0;
  return (
    <li className="track-card" data-status={track.status}>
      <button type="button" className="track-card-main" onClick={onOpen}>
        <span className="track-card-art" data-style={track.cover_url ? "image" : track.cover_style}>
          <TrackArt track={track} />
          {track.key === COMMUNITY_MAIN_TRACK_KEY ? <span className="track-card-badge">Core track</span> : null}
        </span>
        <span className="track-card-body">
          <strong>{track.title}</strong>
          {track.summary ? <span className="track-card-summary">{track.summary}</span> : null}
          <span className="track-card-meta">
            {track.status === "in_progress" ? `${track.done_count} of ${track.step_count} lessons done` : trackFacts(track)}
          </span>
          {track.status === "in_progress" ? <span className="track-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span> : null}
          <span className="track-card-action">
            {track.status === "done" ? <Check size={15} aria-hidden="true" /> : null}
            {ACTION_LABEL[track.status]} <ArrowRight size={15} aria-hidden="true" />
          </span>
        </span>
      </button>
      {onEdit ? <button type="button" className="track-card-edit" onClick={onEdit} aria-label={`Edit ${track.title}`}><Pencil size={14} /></button> : null}
    </li>
  );
}

/** A track the member can't start yet: earned by progress, or added to their plan. */
function TrackLockCard({ track, offer, onOpen, onEdit }: {
  track: CommunityTrackView; offer?: CommunityTrackOfferAccess | null; onOpen: () => void; onEdit?: () => void;
}) {
  const price = track.paid ? offer?.priceFor(track.paid.offer) ?? null : null;
  const left = track.opens_progress ? track.opens_progress.total - track.opens_progress.done : 0;
  return (
    <li className="track-card track-lock-card" data-kind={track.paid ? "paid" : "earned"}>
      <button type="button" className="track-card-main" onClick={onOpen}>
        <span className="track-lock-art" aria-hidden="true">{track.paid ? <BadgeCheck size={34} /> : <Lock size={26} />}</span>
        <span className="track-card-body">
          <span className="track-lock-title">
            <strong>{track.title}</strong>
            {track.paid ? <span className="track-lock-tag">Add-on</span> : null}
          </span>
          <span className="track-card-summary">{track.paid ? track.summary ?? `Part of ${track.paid.offer_name}.` : `${track.opens_reason}.`}</span>
          <span className="track-card-action">
            {track.paid
              ? <>See what's inside{price ? ` · ${price}` : ""} <ArrowRight size={15} aria-hidden="true" /></>
              : left > 0 ? `${plural(left, "lesson")} to go` : "See what's inside"}
          </span>
        </span>
      </button>
      {onEdit ? <button type="button" className="track-card-edit" onClick={onEdit} aria-label={`Edit ${track.title}`}><Pencil size={14} /></button> : null}
    </li>
  );
}

/** Several tracks: pick up where you left off, your tracks, and what to unlock next. */
export function WebCommunityTrackHome(props: {
  tracks: readonly CommunityTrackView[];
  onOpenTrack: (key: string) => void;
  canManage?: boolean;
  onNewTrack?: () => void;
  onEditTrack?: (key: string) => void;
  offer?: CommunityTrackOfferAccess | null;
}) {
  const current = communityContinueTrack(props.tracks);
  const yours = props.tracks.filter((track) => track.open);
  const coming = props.tracks.filter((track) => !track.open);
  const edit = props.canManage && props.onEditTrack ? props.onEditTrack : undefined;
  const percent = current?.step_count ? Math.round((current.done_count / current.step_count) * 100) : 0;
  return (
    <div className="track-home">
      {current?.next ? (
        <button type="button" className="track-continue" onClick={() => props.onOpenTrack(current.key)}>
          <span className="track-continue-art"><TrackArt track={current} size="hero" /></span>
          <span className="track-continue-body">
            <small>{current.status === "in_progress" ? "Pick up where you left off" : "Start here"}</small>
            <strong>{current.title}</strong>
            <span className="track-continue-next">Next: <b>{current.next.title}</b> · {current.next.stage}</span>
            <span className="track-continue-foot">
              <span className="track-continue-progress">
                <span className="track-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
                <em>{current.done_count} of {current.step_count} lessons{current.minutes ? ` · about ${formatTrackMinutes(current.minutes)} in all` : ""}</em>
              </span>
              <span className="track-continue-go">{current.status === "in_progress" ? "Continue" : "Start"} <ArrowRight size={16} /></span>
            </span>
          </span>
        </button>
      ) : null}
      <section className="track-group" aria-label="Your tracks">
        <div className="track-group-head">
          <h2>Your tracks</h2>
          <span className="track-group-note">{yours.length > 1 ? `${yours.length} open · start any of them` : null}</span>
          {props.canManage && props.onNewTrack ? (
            <button type="button" className="track-new" onClick={props.onNewTrack}><Plus size={14} /> New track</button>
          ) : null}
        </div>
        <ul className="track-grid">
          {yours.map((track) => (
            <TrackCard key={track.key} track={track} onOpen={() => props.onOpenTrack(track.key)} onEdit={edit ? () => edit(track.key) : undefined} />
          ))}
        </ul>
      </section>
      {coming.length ? (
        <section className="track-group" aria-label="Unlock next">
          <div className="track-group-head">
            <h2>Unlock next</h2>
            <span className="track-group-note">{coming.some((track) => track.paid) ? "Earn them, or add them to your plan" : "Each one opens as you go"}</span>
          </div>
          <ul className="track-grid track-grid-wide">
            {coming.map((track) => (
              <TrackLockCard key={track.key} track={track} offer={props.offer} onOpen={() => props.onOpenTrack(track.key)} onEdit={edit ? () => edit(track.key) : undefined} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The top of a track's page: back to all tracks, the picker, and the hero
 * that sells it (badge, title, promise, what's in it, the cover), then what
 * members will be able to do and who it's for. A sold track the member hasn't
 * added shows its price, Add to my plan and the free first lesson instead.
 */
export function WebCommunityTrackHeader(props: {
  tracks: readonly CommunityTrackView[];
  track: CommunityTrackView;
  onPick: (key: string) => void;
  onHome: () => void;
  onEdit?: () => void;
  onNewTrack?: () => void;
  offer?: CommunityTrackOfferAccess | null;
  onPreview?: () => void;
}) {
  const { track, offer } = props;
  const paid = !track.open ? track.paid : null;
  const price = paid ? offer?.priceFor(paid.offer) ?? null : null;
  const checkpoints = track.stages.flatMap((stage) => stage.steps).filter((step) => step.checkpoint).length;
  const first = track.stages[0]?.name;
  const last = track.stages.length > 1 ? track.stages[track.stages.length - 1].name : null;
  return (
    <div className="track-header">
      {props.tracks.length > 1 ? (
        <nav className="track-picker" aria-label="Tracks">
          <button type="button" className="track-picker-home" onClick={props.onHome}><ArrowLeft size={14} /> All tracks</button>
          {props.tracks.map((candidate) => (
            <button key={candidate.key} type="button" aria-current={candidate.key === track.key ? "true" : undefined} onClick={() => props.onPick(candidate.key)}>
              {candidate.open ? null : <Lock size={12} aria-label="Locked" />}
              {candidate.title}
            </button>
          ))}
        </nav>
      ) : null}
      <section className="track-hero" data-paid={paid ? "" : undefined}>
        <div className="track-hero-copy">
          <span className="track-hero-badge">
            {paid ? `Add-on · ${paid.offer_name}` : track.key === COMMUNITY_MAIN_TRACK_KEY ? "Core track" : "Skill track"}
          </span>
          <h2>{track.title}</h2>
          {track.summary ? <p className="track-hero-promise">{track.summary}</p> : null}
          <p className="track-hero-facts">
            <span><b>{track.stages.length}</b> {track.stages.length === 1 ? "module" : "modules"}</span>
            <span><b>{track.step_count}</b> {track.step_count === 1 ? "lesson" : "lessons"}</span>
            {track.minutes ? <span>about <b>{formatTrackMinutes(track.minutes)}</b></span> : null}
            {checkpoints ? <span><b>{checkpoints}</b> {checkpoints === 1 ? "checkpoint" : "checkpoints"}</span> : null}
          </p>
          {paid ? (
            <div className="track-hero-buy">
              <button type="button" className="track-buy" disabled={!offer || offer.busy} onClick={() => offer?.upgrade(paid.offer)}>
                {offer?.busy ? "Adding…" : `Add to my plan${price ? ` · ${price}` : ""}`}
              </button>
              {paid.preview && props.onPreview ? (
                <button type="button" className="track-preview" onClick={props.onPreview}>Try the first lesson free</button>
              ) : null}
            </div>
          ) : null}
          {paid ? (
            <p className="track-hero-small" role={offer?.note ? "status" : undefined}>
              {offer?.note ?? `It moves you up to ${paid.offer_name}, which includes this track.`}
            </p>
          ) : null}
          {props.onEdit || props.onNewTrack ? (
            <span className="track-title-actions">
              {props.onEdit ? <button type="button" className="track-title-edit" onClick={props.onEdit}><Pencil size={14} /> Edit track</button> : null}
              {props.onNewTrack ? <button type="button" className="track-title-edit" onClick={props.onNewTrack}><Plus size={14} /> New track</button> : null}
            </span>
          ) : null}
        </div>
        <div className="track-hero-art" data-style={track.cover_url ? "image" : track.cover_style}>
          {!track.cover_url ? <span className="track-hero-art-label">{track.cover_style === "route" ? "Your route" : null}</span> : null}
          <TrackArt track={track} size="hero" />
          {!track.cover_url && track.cover_style === "route" && first ? (
            <span className="track-hero-art-ends"><span>{first}</span>{last ? <span>{last}</span> : null}</span>
          ) : null}
        </div>
      </section>
      {track.outcomes.length ? (
        <section className="track-outcomes" aria-label="What you'll be able to do">
          <h3>What you'll be able to do</h3>
          <ul>
            {track.outcomes.map((line) => (
              <li key={line}><span className="track-outcome-check" aria-hidden="true"><Check size={14} /></span>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {track.audience ? (
        <p className="track-audience"><b>Who it's for</b>{track.audience}</p>
      ) : null}
    </div>
  );
}

/** A track progress opens: how far the member is, the lesson to do next, and what's inside. */
export function WebCommunityTrackLocked({ track, onGoTo }: { track: CommunityTrackView; onGoTo?: (resourceId: string) => void }) {
  const progress = track.opens_progress;
  const left = progress ? progress.total - progress.done : 0;
  return (
    <div className="track-locked">
      <div className="track-locked-card">
        <span className="track-lock-chip"><Lock size={13} /> Opens by progress</span>
        <p className="track-locked-reason">{track.opens_reason}.</p>
        {progress ? (
          <>
            <span className="track-bar" aria-hidden="true"><i style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }} /></span>
            <span className="track-locked-left">{left > 0 ? `You're ${plural(left, "lesson")} away` : "Almost there"}</span>
          </>
        ) : null}
        {progress?.next && onGoTo ? (
          <button type="button" className="track-buy" onClick={() => onGoTo(progress.next!.resource_id)}>
            Go to the next lesson <ArrowRight size={16} />
          </button>
        ) : null}
      </div>
      <h3 className="track-locked-heading">What's inside</h3>
      <ol className="track-locked-stages">
        {track.stages.map((stage) => (
          <li key={stage.name}>
            <span className="track-locked-dot">{stage.position}</span>
            <span><strong>{stage.name}</strong><em>{plural(stage.step_count, "lesson")}</em></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Below a track's board: the tracks its checkpoints open. */
export function WebCommunityTrackOpens(props: { track: CommunityTrackView; tracks: readonly CommunityTrackView[]; onOpenTrack: (key: string) => void }) {
  const targets = props.track.opens_tracks
    .map((link) => ({ link, target: props.tracks.find((candidate) => candidate.key === link.track) }))
    .filter((entry): entry is { link: typeof entry.link; target: CommunityTrackView } => Boolean(entry.target));
  if (!targets.length) return null;
  const titleOf = (resourceId: string) => props.track.stages.flatMap((stage) => stage.steps).find((step) => step.resource_id === resourceId)?.title;
  return (
    <section className="track-opens" aria-label="What this track opens">
      <h3>Finishing this track opens</h3>
      <ul>
        {targets.map(({ link, target }) => (
          <li key={`${link.resource_id}:${target.key}`} data-open={target.open ? "" : undefined}>
            <button type="button" onClick={() => props.onOpenTrack(target.key)}>
              <span className="track-opens-plus" aria-hidden="true">{target.open ? <Check size={16} /> : <Plus size={16} />}</span>
              <span>
                <strong>{target.title}</strong>
                <em>{target.open ? `Open now · ${plural(target.step_count, "lesson")}` : <>After “{titleOf(link.resource_id) ?? "a checkpoint"}”</>}</em>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- owner editing ----------

type RuleType = Exclude<CommunityTrackRule["type"], "offer">;
type Access = "everyone" | "earn" | "buy";
const RULE_LABEL: Record<RuleType, string> = {
  after_checkpoint: "After a lesson is done",
  after_track: "After a track is finished",
  workflow_stage: "When they reach a Workflow stage",
  client_property: "When a member property is",
};

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "track";

function blankRule(type: RuleType, data: CommunityBuilderTracks, selfKey: string): CommunityTrackRule {
  if (type === "after_track") return { type, track: data.tracks.find((track) => track.key !== selfKey)?.key ?? "" };
  if (type === "workflow_stage") return { type, milestone_key: data.workflow_stages[0]?.key ?? "" };
  if (type === "client_property") return { type, property: data.client_properties[0]?.key ?? "", equals: "" };
  return { type, resource_id: data.lessons[0]?.id ?? "" };
}

/** The editor's draft as a member's card sees it: counts from its modules, nothing done yet. */
function previewOf(draft: CommunityBuilderTrack, data: CommunityBuilderTracks): CommunityTrackView {
  const stages = draft.stages.filter((stage) => stage.steps.length > 0);
  const lessonTitle = new Map(data.lessons.map((lesson) => [lesson.id, lesson.title]));
  return {
    key: draft.key || "new", title: draft.title.trim() || "Your track", summary: draft.summary?.trim() || null,
    cover_url: draft.cover_url?.trim() || null, cover_style: draft.cover_style ?? "route", outcomes: draft.outcomes ?? [],
    audience: draft.audience ?? null, order: draft.order, show: draft.show, derived: Boolean(draft.derived), open: true, status: "open",
    opens_reason: null, opens_when: draft.opens_when, step_count: stages.reduce((sum, stage) => sum + stage.steps.length, 0), done_count: 0,
    minutes: null, next: null, paid: null, opens_progress: null, opens_tracks: [],
    stages: stages.map((stage, index) => ({
      name: stage.name, position: index + 1, step_count: stage.steps.length, done_count: 0, locked: false, blocked_by: null,
      steps: stage.steps.map((step) => ({ resource_id: step.resource_id, ref: `resource:${step.resource_id}`, title: lessonTitle.get(step.resource_id) ?? "",
        checkpoint: Boolean(step.checkpoint), done: false, locked: false })),
    })),
  };
}

/**
 * Create or change a track: its title, what opens it, and (for every track but
 * the main roadmap, whose stages are edited right on the board) its stages and
 * steps. Saves the whole track, the same save the agent's community.track.save makes.
 */
export function WebCommunityTrackEditor<SessionT>(props: {
  session: SessionT;
  communityId: string;
  trackKey: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<CommunityBuilderTracks | null>(null);
  const [draft, setDraft] = useState<CommunityBuilderTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isNew = props.trackKey === null;

  useEffect(() => {
    let cancelled = false;
    fetchCloudCommunityLessonTracks({ session: props.session, communityId: props.communityId })
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        const existing = loaded.tracks.find((track) => track.key === props.trackKey);
        setDraft(existing ?? {
          key: "", title: "", summary: "", order: loaded.tracks.length, show: "always", opens_when: [],
          stages: [{ name: "Module 1", steps: [] }], revision: 0, derived: false,
        });
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Tracks are unavailable."); });
    return () => { cancelled = true; };
  }, [props.session, props.communityId, props.trackKey]);

  const lessonTitle = useMemo(() => new Map((data?.lessons ?? []).map((lesson) => [lesson.id, lesson.title])), [data]);
  const [outcomesText, setOutcomesText] = useState<string | null>(null);
  if (!data || !draft) {
    return (
      <div className="track-editor-backdrop" role="dialog" aria-modal="true" aria-label="Edit track">
        <div className="track-editor"><p>{error ?? "Loading…"}</p><button type="button" onClick={props.onClose}>Close</button></div>
      </div>
    );
  }
  const isMain = draft.key === COMMUNITY_MAIN_TRACK_KEY;
  const offerRule = draft.opens_when.find((rule): rule is Extract<CommunityTrackRule, { type: "offer" }> => rule.type === "offer") ?? null;
  const access: Access = offerRule ? "buy" : draft.opens_when.length ? "earn" : "everyone";
  const saleOffers = (data.offers ?? []).filter((offer) => !offer.is_base);
  const outcomes = (outcomesText ?? (draft.outcomes ?? []).join("\n")).split("\n").map((line) => line.trim()).filter(Boolean);
  const setAccess = (next: Access) => {
    if (next === access) return;
    if (next === "everyone") update({ opens_when: [] });
    if (next === "earn") update({ opens_when: [blankRule("after_checkpoint", data, draft.key)] });
    if (next === "buy") update({ opens_when: [{ type: "offer", offer: saleOffers[0]?.key ?? "" }] });
  };
  const editsStages = !isMain || !draft.derived;
  const update = (patch: Partial<CommunityBuilderTrack>) => setDraft({ ...draft, ...patch });
  const setStages = (stages: CommunityTrackStageDefinition[]) => update({ stages });
  const setRule = (index: number, rule: CommunityTrackRule) => update({ opens_when: draft.opens_when.map((current, i) => (i === index ? rule : current)) });
  const used = new Set(draft.stages.flatMap((stage) => stage.steps.map((step) => step.resource_id)));
  const move = <T,>(rows: T[], from: number, to: number) => {
    if (to < 0 || to >= rows.length) return rows;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    return next;
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const key = isNew ? `${slug(draft.title)}${data.tracks.some((track) => track.key === slug(draft.title)) ? `-${Date.now() % 1000}` : ""}` : draft.key;
    try {
      await saveCloudCommunityLessonTrack({
        session: props.session, communityId: props.communityId, key, expectedRevision: draft.revision,
        title: draft.title, summary: draft.summary ?? null, show: draft.show, opensWhen: draft.opens_when,
        coverUrl: draft.cover_url?.trim() || null, coverStyle: draft.cover_style ?? "route", outcomes, audience: draft.audience ?? null,
        // The main roadmap keeps reading its stages from the lessons until it has its own.
        stages: isMain && draft.derived ? [] : draft.stages.filter((stage) => stage.steps.length > 0),
      });
      props.onSaved();
      props.onClose();
    } catch (caught: any) {
      const problems: string[] | undefined = caught?.data?.problems;
      setError(problems?.join(" ") ?? (caught?.data?.code === "track_revision_conflict"
        ? "Someone changed this track since you opened it. Close and open it again."
        : caught instanceof Error ? caught.message : "The track couldn't be saved."));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    setSaving(true);
    try {
      await setCloudCommunityLessonTrackArchived({ session: props.session, communityId: props.communityId, key: draft.key, archived: true });
      props.onSaved();
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The track couldn't be archived.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="track-editor-backdrop" role="dialog" aria-modal="true" aria-label={isNew ? "New track" : `Edit ${draft.title}`}>
      <form className="track-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="track-editor-columns">
        <div className="track-editor-fields">
        <header>
          <h2>{isNew ? "New track" : "Edit track"}</h2>
          <button type="button" className="track-editor-close" onClick={props.onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <label className="track-field">
          <span>Title</span>
          <input id="track-title" autoFocus={isNew} value={draft.title} onChange={(event) => update({ title: event.target.value })} placeholder="Content Employee" required maxLength={120} />
        </label>
        <label className="track-field">
          <span>The promise <em>one line: what they walk away with</em></span>
          <input id="track-summary" value={draft.summary ?? ""} onChange={(event) => update({ summary: event.target.value })} maxLength={600}
            placeholder="From install to an AI Employee that runs on its own." />
        </label>
        <div className="track-field">
          <span>Cover</span>
          <div className="track-cover-picker" role="radiogroup" aria-label="Cover">
            {(["route", "diagram", "terminal"] as const).map((style) => (
              <button key={style} type="button" role="radio" aria-checked={!draft.cover_url && (draft.cover_style ?? "route") === style}
                className="track-cover-choice" data-style={style} onClick={() => update({ cover_style: style, cover_url: null })}>
                <span className="track-cover-swatch" aria-hidden="true"><TrackArt track={{ ...previewOf(draft, data), cover_url: null, cover_style: style }} /></span>
                {style === "route" ? "Route" : style === "diagram" ? "Diagram" : "Terminal"}
              </button>
            ))}
          </div>
          <input aria-label="Cover image link" value={draft.cover_url ?? ""} onChange={(event) => update({ cover_url: event.target.value })}
            placeholder="Or paste an image link (https://…)" />
          <em className="track-hint">Built-in covers use your community's colours. The route draws one dot per module.</em>
        </div>
        <label className="track-field">
          <span>What they'll be able to do <em>one per line, up to 6</em></span>
          <textarea rows={4} value={outcomesText ?? (draft.outcomes ?? []).join("\n")} onChange={(event) => setOutcomesText(event.target.value)}
            placeholder={"Install the plugin and connect your workspace\nBuild a skill and run it once on real data"} />
          {outcomes.length > 6 ? <em className="track-error">Keep it to 6. Members read the first ones most.</em> : null}
        </label>
        <label className="track-field">
          <span>Who it's for <em>optional</em></span>
          <input value={draft.audience ?? ""} onChange={(event) => update({ audience: event.target.value })} maxLength={300} placeholder="Owners who…" />
        </label>

        <fieldset className="track-fieldset">
          <legend>Who can start it</legend>
          <label className="track-access">
            <input type="radio" name="track-access" checked={access === "everyone"} onChange={() => setAccess("everyone")} />
            <span><strong>Every member</strong><em>Open from day one</em></span>
          </label>
          <label className="track-access">
            <input type="radio" name="track-access" checked={access === "earn"} onChange={() => setAccess("earn")} />
            <span><strong>Members who earn it</strong><em>After a lesson, another track, a Workflow stage or a member property</em></span>
          </label>
          <label className="track-access">
            <input type="radio" name="track-access" checked={access === "buy"} onChange={() => setAccess("buy")} disabled={isMain} />
            <span><strong>Members who buy it</strong><em>{isMain ? "Your main roadmap stays with the membership" : "Through an Offer. The first lesson stays free as a preview"}</em></span>
          </label>
          {access === "buy" ? (
            saleOffers.length ? (
              <label className="track-rule-offer">
                <span>Offer</span>
                <select aria-label="Offer" value={offerRule?.offer ?? ""} onChange={(event) => update({ opens_when: [{ type: "offer", offer: event.target.value }] })}>
                  {saleOffers.map((offer) => <option key={offer.key} value={offer.key}>{offer.name}</option>)}
                </select>
                <em className="track-hint">Members on this offer, or a higher one, get in. Everyone else sees the price and Add to my plan.</em>
              </label>
            ) : (
              <p className="track-hint">You sell one offer so far. Add a higher one in Settings › Offers, then pick it here.</p>
            )
          ) : null}
          {access === "earn" ? draft.opens_when.map((rule, index) => rule.type === "offer" ? null : (
            <div className="track-rule" key={index}>
              <select aria-label="Rule" value={rule.type} onChange={(event) => setRule(index, blankRule(event.target.value as RuleType, data, draft.key))}>
                {(Object.keys(RULE_LABEL) as RuleType[]).map((type) => <option key={type} value={type}>{RULE_LABEL[type]}</option>)}
              </select>
              {rule.type === "after_checkpoint" ? (
                <select aria-label="Lesson" value={rule.resource_id} onChange={(event) => setRule(index, { ...rule, resource_id: event.target.value })}>
                  {data.lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
                </select>
              ) : rule.type === "after_track" ? (
                <select aria-label="Track" value={rule.track} onChange={(event) => setRule(index, { ...rule, track: event.target.value })}>
                  {data.tracks.filter((track) => track.key !== draft.key).map((track) => <option key={track.key} value={track.key}>{track.title}</option>)}
                </select>
              ) : rule.type === "workflow_stage" ? (
                <select aria-label="Workflow stage" value={rule.milestone_key} onChange={(event) => setRule(index, { ...rule, milestone_key: event.target.value })}>
                  {data.workflow_stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.name}</option>)}
                </select>
              ) : (
                <span className="track-rule-pair">
                  <select aria-label="Member property" value={rule.property} onChange={(event) => setRule(index, { ...rule, property: event.target.value })}>
                    {data.client_properties.map((property) => <option key={property.key} value={property.key}>{property.name}</option>)}
                  </select>
                  <input aria-label="Value" value={String(rule.equals)} onChange={(event) => setRule(index, { ...rule, equals: event.target.value })} />
                </span>
              )}
              <button type="button" className="track-icon" aria-label="Remove rule" onClick={() => update({ opens_when: draft.opens_when.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
            </div>
          )) : null}
          {access === "earn" ? (
            <button type="button" className="track-add" onClick={() => update({ opens_when: [...draft.opens_when, blankRule("after_checkpoint", data, draft.key)] })}>
              <Plus size={14} /> Add a rule
            </button>
          ) : null}
          {access !== "everyone" ? <label className="track-check">
            <input type="checkbox" checked={draft.show === "when_open"} onChange={(event) => update({ show: event.target.checked ? "when_open" : "always" })} />
            Hide it until it opens (otherwise members see it under "Unlock next")
          </label> : null}
        </fieldset>

        {editsStages ? (
          <fieldset className="track-fieldset">
            <legend>Modules and lessons</legend>
            {draft.stages.map((stage, stageIndex) => (
              <div className="track-stage" key={stageIndex}>
                <div className="track-stage-head">
                  <span className="track-stage-number">{stageIndex + 1}</span>
                  <input aria-label="Module name" value={stage.name} onChange={(event) => setStages(draft.stages.map((current, i) => (i === stageIndex ? { ...current, name: event.target.value } : current)))} />
                  <button type="button" className="track-icon" aria-label="Move stage up" onClick={() => setStages(move(draft.stages, stageIndex, stageIndex - 1))}><ArrowUp size={14} /></button>
                  <button type="button" className="track-icon" aria-label="Move stage down" onClick={() => setStages(move(draft.stages, stageIndex, stageIndex + 1))}><ArrowDown size={14} /></button>
                  <button type="button" className="track-icon" aria-label="Remove stage" onClick={() => setStages(draft.stages.filter((_, i) => i !== stageIndex))}><Trash2 size={14} /></button>
                </div>
                <ol className="track-steps">
                  {stage.steps.map((step, stepIndex) => {
                    const setSteps = (steps: typeof stage.steps) => setStages(draft.stages.map((current, i) => (i === stageIndex ? { ...current, steps } : current)));
                    return (
                      <li key={step.resource_id}>
                        <span className="track-step-title">{lessonTitle.get(step.resource_id) ?? "Missing lesson"}</span>
                        <label className="track-step-check">
                          <input type="checkbox" checked={Boolean(step.checkpoint)}
                            onChange={(event) => setSteps(stage.steps.map((current, i) => (i === stepIndex ? { ...current, checkpoint: event.target.checked || undefined } : current)))} />
                          Checkpoint
                        </label>
                        <button type="button" className="track-icon" aria-label="Move up" onClick={() => setSteps(move(stage.steps, stepIndex, stepIndex - 1))}><ArrowUp size={14} /></button>
                        <button type="button" className="track-icon" aria-label="Move down" onClick={() => setSteps(move(stage.steps, stepIndex, stepIndex + 1))}><ArrowDown size={14} /></button>
                        <button type="button" className="track-icon" aria-label="Remove step" onClick={() => setSteps(stage.steps.filter((_, i) => i !== stepIndex))}><Trash2 size={14} /></button>
                      </li>
                    );
                  })}
                </ol>
                <select
                  className="track-add-lesson"
                  aria-label="Add a lesson"
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) return;
                    setStages(draft.stages.map((current, i) => (i === stageIndex ? { ...current, steps: [...current.steps, { resource_id: event.target.value }] } : current)));
                  }}
                >
                  <option value="">+ Add a lesson from the library…</option>
                  {data.lessons.filter((lesson) => !used.has(lesson.id)).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
                </select>
              </div>
            ))}
            <button type="button" className="track-add" onClick={() => setStages([...draft.stages, { name: `Module ${draft.stages.length + 1}`, steps: [] }])}>
              <Plus size={14} /> Add a module
            </button>
            <p className="track-hint">A lesson can be in several tracks. Members who finished it in one track have it done in all of them.</p>
          </fieldset>
        ) : (
          <p className="track-hint">This is your main roadmap. Edit its stages and lessons right on the board.</p>
        )}

        </div>
        <aside className="track-editor-preview" aria-label="How members see it">
          <span className="track-editor-preview-label">Live card</span>
          <ul className="track-grid"><TrackCard track={{ ...previewOf(draft, data), outcomes }} onOpen={() => {}} /></ul>
          <span className="track-hint">Lessons, modules and minutes are counted for you. Your agent can fill all of this too.</span>
        </aside>
        </div>
        {error ? <p className="track-error" role="alert">{error}</p> : null}
        <footer>
          {!isNew && !isMain ? <button type="button" className="track-archive" onClick={() => void archive()} disabled={saving}>Archive track</button> : <span />}
          <span className="track-footer-actions">
            <button type="button" onClick={props.onClose}>Cancel</button>
            <button type="submit" className="track-save" disabled={saving || !draft.title.trim()}>{saving ? "Saving…" : "Save track"}</button>
          </span>
        </footer>
      </form>
    </div>
  );
}
