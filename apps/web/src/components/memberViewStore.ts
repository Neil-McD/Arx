import { useEffect, useSyncExternalStore } from "react";

// "View as member": an owner's look at a page as members see it. The page that can show it (today the Knowledge page) offers
// it while mounted, and the top bar's button switches it, next to Display and
// your picture. Where the top bar isn't drawn (narrow screens), the page
// shows its own button instead.
type MemberViewState = { offered: boolean; on: boolean; inTopBar: boolean };

let state: MemberViewState = { offered: false, on: false, inTopBar: false };
const listeners = new Set<() => void>();

function update(next: Partial<MemberViewState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMemberView(): MemberViewState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function setMemberViewOn(on: boolean) {
  update({ on });
}

/** A page offers member view while it is mounted and the viewer can manage it. */
export function useOfferMemberView(offered: boolean) {
  useEffect(() => {
    if (!offered) return undefined;
    update({ offered: true });
    return () => update({ offered: false, on: false });
  }, [offered]);
}

/** The top bar's button says it is showing, so the page drops its own. */
export function useMemberViewInTopBar(shown: boolean) {
  useEffect(() => {
    if (!shown) return undefined;
    update({ inTopBar: true });
    return () => update({ inTopBar: false });
  }, [shown]);
}
