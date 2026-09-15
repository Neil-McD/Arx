export const watches: any[] = [];
export const memoryWatches: any[] = [];
export function createCloudCommunityChatLiveClient() {
  return { authSubject: 'fixture', close() {}, client: { watchQuery(_query: unknown, args: any) {
    const watch: any = { args, value: undefined, stopped: false };
    watches.push(watch);
    return { localQueryResult() { if (watch.error) throw watch.error; return watch.value; }, onUpdate(cb: () => void) { watch.update = cb; return () => { watch.stopped = true; }; } };
  } } };
}
export function createCloudCommunityPolynetLiveClient() { return { close() {} }; }
export function subscribeCloudCommunityPolynetOverview(params: any) {
  memoryWatches.push(params); return () => {};
}
export function publish(watch: any, names = ['Ada', 'Bea'], next: string | null = null) {
  watch.value = { page: names.map(name => ({ user_id: name, membership_id: name, role: 'member', profile: { display_name: name }, last_seen_at: null, active_until: null })), agents: [], isDone: next === null, continueCursor: next };
  watch.update();
}
