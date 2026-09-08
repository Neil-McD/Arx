import type { CommunityDirectoryMember } from "./communityTypes";

// Search beyond the visible roster without an unbounded download. Each batch
// continues the same authorized directory cursor and can be cancelled.
export async function searchCommunityDirectoryBatch(params: {
  query: string;
  cursor: string | null;
  isCurrent: () => boolean;
  loadPage: (cursor: string | null) => Promise<{
    rows: CommunityDirectoryMember[];
    continueCursor: string | null;
    isDone: boolean;
  }>;
}) {
  const query = params.query.trim().toLocaleLowerCase();
  let cursor = params.cursor;
  const rows = new Map<string, CommunityDirectoryMember>();
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    if (!params.isCurrent()) return null;
    const page = await params.loadPage(cursor);
    if (!params.isCurrent()) return null;
    for (const row of page.rows) {
      if ((row.display_name ?? "").toLocaleLowerCase().includes(query)) rows.set(row.id, row);
    }
    if (page.isDone) return { rows: [...rows.values()], cursor: null };
    if (!page.continueCursor || page.continueCursor === cursor) throw new Error("Member search could not continue. Try again.");
    cursor = page.continueCursor;
    if (rows.size >= 25) break;
  }
  return { rows: [...rows.values()], cursor };
}
