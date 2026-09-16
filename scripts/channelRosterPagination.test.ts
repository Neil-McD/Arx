import { expect, test } from 'vitest';
import { subscribeCommunityPages, type CommunityPage } from '../shared/subscribeCommunityPages';

function fixture(preserveStablePages = true) {
  const watches: Array<{ cursor: string | null; value?: CommunityPage; error?: Error; update?: () => void; stopped: boolean }> = [];
  let pages: CommunityPage[] = [], complete = false, rebuilding = false;
  const stop = subscribeCommunityPages({ sections: ['shared'], maxPages: 3, preserveStablePages,
    watch: (_section, cursor) => {
      const w: typeof watches[number] = { cursor, stopped: false }; watches.push(w);
      return { localQueryResult() { if (w.error) throw w.error; return w.value; }, onUpdate(cb) { w.update = cb; return () => { w.stopped = true; }; } };
    },
    onUpdate(p, done, pending) { pages = p; complete = done; rebuilding = Boolean(pending); },
  });
  const send = (index: number, rows: unknown[], next: string | null) => {
    watches[index].value = { page: rows, isDone: next === null, continueCursor: next }; watches[index].update?.();
  };
  send(0, ['Ada'], 'b'); send(1, ['Bea'], 'c'); send(2, ['Cora'], null);
  return { watches, send, stop, read: () => ({ rows: pages.flatMap(p => p.page), complete, rebuilding }) };
}

test('100 first-page presence updates retain all three watches and later rows', () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) f.send(0, [{ name: 'Ada', lastSeen: i }], 'b');
  expect(f.watches).toHaveLength(3);
  expect(f.watches.every(w => !w.stopped)).toBe(true);
  expect(f.read()).toEqual({ rows: [{ name: 'Ada', lastSeen: 99 }, 'Bea', 'Cora'], complete: true, rebuilding: false });
  f.stop(); expect(f.watches.every(w => w.stopped)).toBe(true);
});

test('changed boundary removes invalid descendants, rebuilds only the suffix, ignores old responses', () => {
  const f = fixture();
  f.send(1, ['Bea', 'New join'], 'new-c');
  expect(f.read()).toEqual({ rows: ['Ada', 'Bea', 'New join'], complete: false, rebuilding: true });
  expect(f.watches[0].stopped).toBe(false);
  expect(f.watches[2].stopped).toBe(true);
  expect(f.watches[3].cursor).toBe('new-c');
  f.send(2, ['OLD PRIVATE'], null);
  expect(f.read().rows).not.toContain('OLD PRIVATE');
  f.send(3, ['Cora'], null);
  expect(f.read()).toEqual({ rows: ['Ada', 'Bea', 'New join', 'Cora'], complete: true, rebuilding: false });
  f.stop();
});

test('authoritative removal with unchanged boundary updates only its page', () => {
  const f = fixture(); f.send(1, [], 'c');
  expect(f.read().rows).toEqual(['Ada', 'Cora']);
  expect(f.watches).toHaveLength(3); f.stop();
});

test('a page denial terminates every watch; another page cannot resurrect private rows', () => {
  const f = fixture(); f.watches[1].error = new Error('access denied'); f.watches[1].update?.();
  expect(f.read().rows).toEqual([]);
  expect(f.watches.every(w => w.stopped)).toBe(true);
  f.send(0, ['late Ada'], 'b'); f.send(2, ['late Cora'], null); f.stop.loadMore();
  expect(f.read().rows).toEqual([]); expect(f.watches).toHaveLength(3);
});

test('scope cleanup ignores late updates and stops all three watches', () => {
  const f = fixture(); f.stop(); const before = f.read();
  f.send(0, ['other channel'], 'b'); expect(f.read()).toEqual(before);
  expect(f.watches.every(w => w.stopped)).toBe(true);
});

test('other consumers keep the conservative ancestor-invalidation behavior', () => {
  const f = fixture(false); f.send(0, ['Ada updated'], 'b');
  expect(f.watches[1].stopped).toBe(true); expect(f.watches[2].stopped).toBe(true);
  expect(f.read().rows).toEqual(['Ada updated']); f.stop();
});

test('stable update during suffix rebuild keeps pending work and correct completion state', () => {
  const f = fixture(); f.send(1, ['Bea'], 'new-c');
  f.send(0, ['Ada updated'], 'b');
  expect(f.watches).toHaveLength(4);
  expect(f.read().rebuilding).toBe(true); expect(f.read().complete).toBe(false);
  f.send(3, ['Cora'], null);
  expect(f.read()).toEqual({ rows: ['Ada updated', 'Bea', 'Cora'], complete: true, rebuilding: false });
  f.stop();
});

test('a now-terminal ancestor stops descendants and ends rebuilding', () => {
  const f = fixture(); f.send(0, ['Only remaining member'], null);
  expect(f.read()).toEqual({ rows: ['Only remaining member'], complete: true, rebuilding: false });
  expect(f.watches.slice(1).every(w => w.stopped)).toBe(true); f.stop();
});
