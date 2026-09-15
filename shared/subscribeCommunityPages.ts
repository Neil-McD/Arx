type Section = "shared" | "private";
export type CommunityPage = { page: unknown[]; isDone: boolean; continueCursor: string | null };

// Shared reactive pagination lifecycle. A changed ancestor invalidates later
// pages before publication. Errors publish unknown, never stale private rows.
export function subscribeCommunityPages<Page extends CommunityPage>(params: {
  watch: (section: Section, cursor: string | null) => {
    localQueryResult: () => Page | undefined;
    onUpdate: (callback: () => void) => () => void;
  };
  onUpdate: (pages: Page[], isComplete: boolean, isRebuilding?: boolean) => void;
  onError?: (error: unknown) => void;
  sections?: Section[];
  maxPages?: number;
  // Roster-only opt-in: unchanged continuations retain independently authorized
  // page watches. Errors terminate the chain until its owner explicitly retries.
  preserveStablePages?: boolean;
}): (() => void) & { loadMore: () => void } {
  type Slot = { section: Section; active: boolean; stop?: () => void; fingerprint?: string; value?: Page };
  const slots: Slot[] = [];
  let closed = false;
  let maxPages = params.maxPages ?? Infinity;
  let rebuildDepth = 0;
  let pendingNext: (() => void) | undefined;
  const sections = params.sections ?? ["shared", "private"];
  const trim = (index: number) => {
    for (const slot of slots.splice(index)) { slot.active = false; slot.stop?.(); }
  };
  const emit = () => {
    const tail = slots.at(-1);
    const complete = Boolean(tail?.value?.isDone && sections.indexOf(tail.section) === sections.length - 1 && slots.every(s => s.value));
    const pages = slots.flatMap(s => s.value ? [s.value] : []);
    if (complete || pages.length >= rebuildDepth) rebuildDepth = 0;
    params.onUpdate(pages, complete, rebuildDepth > 0);
  };
  const fail = (error: unknown, index: number) => {
    pendingNext = undefined;
    if (params.preserveStablePages) { closed = true; trim(0); }
    else { trim(index + 1); if (slots[index]) { slots[index].value = undefined; slots[index].fingerprint = undefined; } }
    params.onUpdate([], false, false); params.onError?.(error);
  };
  const load = (section: Section, cursor: string | null) => {
    if (closed) return;
    const index = slots.length;
    const slot: Slot = { section, active: true }; slots.push(slot);
    const publish = () => {
      if (closed || !slot.active) return;
      try {
        const result = watch.localQueryResult();
        if (result === undefined) return;
        if (!Array.isArray(result.page) || typeof result.isDone !== "boolean") throw new Error("community_page_invalid");
        if (!result.isDone && (!result.continueCursor || result.continueCursor === cursor)) throw new Error("community_channel_cursor_invalid");
        const fingerprint = JSON.stringify(result);
        if (slot.fingerprint === fingerprint) return;
        const previous = slot.value;
        const stable = params.preserveStablePages && previous && previous.isDone === result.isDone && previous.continueCursor === result.continueCursor;
        slot.fingerprint = fingerprint; slot.value = result;
        if (stable) { emit(); return; }
        if (params.preserveStablePages && slots.length > index + 1) rebuildDepth = Math.max(rebuildDepth, slots.length);
        trim(index + 1);
        pendingNext = undefined;
        const nextSection = sections[sections.indexOf(section) + 1];
        emit();
        if (slots.length >= maxPages) {
          if (!result.isDone) pendingNext = () => load(section, result.continueCursor);
          else if (nextSection) pendingNext = () => load(nextSection, null);
          return;
        }
        if (!result.isDone) load(section, result.continueCursor);
        else if (nextSection) load(nextSection, null);
      } catch (error) {
        fail(error, index);
      }
    };
    let watch: ReturnType<typeof params.watch>;
    try { watch = params.watch(section, cursor); }
    catch (error) { fail(error, index); return; }
    slot.stop = watch.onUpdate(publish);
    if (!slot.active) slot.stop?.();
    publish();
  };
  if (sections[0]) load(sections[0], null);
  return Object.assign(() => { closed = true; pendingNext = undefined; trim(0); }, {
    loadMore: () => {
      if (closed || !pendingNext) return;
      const next = pendingNext;
      pendingNext = undefined;
      maxPages += 1;
      next();
    },
  });
}
