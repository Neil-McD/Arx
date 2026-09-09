type Section = "shared" | "private";
export type CommunityPage = { page: unknown[]; isDone: boolean; continueCursor: string | null };

// Shared reactive pagination lifecycle. A changed ancestor invalidates later
// pages before publication. Errors publish unknown, never stale private rows.
export function subscribeCommunityPages<Page extends CommunityPage>(params: {
  watch: (section: Section, cursor: string | null) => {
    localQueryResult: () => Page | undefined;
    onUpdate: (callback: () => void) => () => void;
  };
  onUpdate: (pages: Page[], isComplete: boolean) => void;
  onError?: (error: unknown) => void;
  sections?: Section[];
  maxPages?: number;
}): (() => void) & { loadMore: () => void } {
  type Slot = { active: boolean; stop?: () => void; fingerprint?: string; value?: Page };
  const slots: Slot[] = [];
  let closed = false;
  let maxPages = params.maxPages ?? Infinity;
  let pendingNext: (() => void) | undefined;
  const sections = params.sections ?? ["shared", "private"];
  const trim = (index: number) => {
    for (const slot of slots.splice(index)) { slot.active = false; slot.stop?.(); }
  };
  const load = (section: Section, cursor: string | null) => {
    if (closed) return;
    const index = slots.length;
    const slot: Slot = { active: true }; slots.push(slot);
    const publish = () => {
      if (closed || !slot.active) return;
      try {
        const result = watch.localQueryResult();
        if (result === undefined) return;
        if (!Array.isArray(result.page) || typeof result.isDone !== "boolean") throw new Error("community_page_invalid");
        if (!result.isDone && (!result.continueCursor || result.continueCursor === cursor)) throw new Error("community_channel_cursor_invalid");
        const fingerprint = JSON.stringify(result);
        if (slot.fingerprint === fingerprint) return;
        slot.fingerprint = fingerprint; slot.value = result;
        trim(index + 1);
        pendingNext = undefined;
        const nextSection = sections[sections.indexOf(section) + 1];
        params.onUpdate(slots.flatMap(s => s.value ? [s.value] : []), result.isDone && !nextSection);
        if (slots.length >= maxPages) {
          if (!result.isDone) pendingNext = () => load(section, result.continueCursor);
          else if (nextSection) pendingNext = () => load(nextSection, null);
          return;
        }
        if (!result.isDone) load(section, result.continueCursor);
        else if (nextSection) load(nextSection, null);
      } catch (error) {
        pendingNext = undefined;
        trim(index + 1); slot.value = undefined; slot.fingerprint = undefined;
        params.onUpdate([], false); params.onError?.(error);
      }
    };
    let watch: ReturnType<typeof params.watch>;
    try { watch = params.watch(section, cursor); }
    catch (error) { params.onUpdate([], false); params.onError?.(error); return; }
    slot.stop = watch.onUpdate(publish);
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
