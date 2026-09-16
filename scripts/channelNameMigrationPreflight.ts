export type ChannelNameInspection = {
  channelId: string; communityId: string; status: string; normalizedName: string | null; needsBackfill: boolean;
};
// Feed complete pages from inspectChannelNamesInternal; no channel names leave
// the summary. Rerun after migration because pages are not a global snapshot.
export function summarizeChannelNamePreflight(rows: ChannelNameInspection[], complete: boolean) {
  const seen = new Set<string>(), groups = new Map<string, string[]>();
  const invalid: string[] = [], duplicateRows: string[] = [];
  let needsBackfill = 0, activeNeedsBackfill = 0;
  for (const row of rows) {
    if (seen.has(row.channelId)) { duplicateRows.push(row.channelId); continue; }
    seen.add(row.channelId);
    if (row.normalizedName === null) invalid.push(row.channelId);
    if (row.needsBackfill) { needsBackfill++; if (row.status === "active") activeNeedsBackfill++; }
    if (row.status !== "active" || row.normalizedName === null) continue;
    const key = JSON.stringify([row.communityId, row.normalizedName]);
    const ids = groups.get(key) ?? []; ids.push(row.channelId); groups.set(key, ids);
  }
  const collisions = [...groups.values()].filter(ids => ids.length > 1);
  return { complete, scanned: seen.size, needsBackfill, activeNeedsBackfill, invalid, collisions, duplicateRows,
    safeToBackfill: complete && !invalid.length && !collisions.length && !duplicateRows.length,
    readyForEnforcement: complete && !invalid.length && !collisions.length && !duplicateRows.length && needsBackfill === 0 };
}
