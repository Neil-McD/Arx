export const COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE = 25;
export const COMMUNITY_DIRECTORY_MAX_PAGE_SIZE = 100;

export type CommunityDirectoryWindowPage<RowT> = {
  rows: RowT[];
  totalCount: number | null;
  continueCursor: string | null;
  isDone: boolean;
};

export async function loadCommunityDirectoryWindow<RowT>(params: {
  targetRowCount: number;
  loadPage: (request: {
    cursor: string | null;
    pageSize: number;
  }) => Promise<CommunityDirectoryWindowPage<RowT>>;
  getRowKey: (row: RowT) => string;
  isCurrent?: () => boolean;
}): Promise<CommunityDirectoryWindowPage<RowT> | null> {
  const targetRowCount = Math.max(
    COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE,
    Math.floor(Number(params.targetRowCount) || 0),
  );
  const rows: RowT[] = [];
  const seenRowKeys = new Set<string>();
  const requestedCursors = new Set<string>();
  let cursor: string | null = null;
  let totalCount: number | null = null;
  let isDone = false;

  while (rows.length < targetRowCount && !isDone) {
    if (params.isCurrent?.() === false) return null;
    const cursorKey = cursor ?? "__first_page__";
    if (requestedCursors.has(cursorKey)) {
      throw new Error("community_directory_cursor_stalled");
    }
    requestedCursors.add(cursorKey);

    const remainingRows = targetRowCount - rows.length;
    const page = await params.loadPage({
      cursor,
      pageSize: Math.min(
        COMMUNITY_DIRECTORY_MAX_PAGE_SIZE,
        Math.max(2, remainingRows),
      ),
    });
    if (params.isCurrent?.() === false) return null;

    for (const row of page.rows) {
      const rowKey = params.getRowKey(row).trim();
      if (!rowKey || seenRowKeys.has(rowKey)) continue;
      seenRowKeys.add(rowKey);
      rows.push(row);
    }
    if (page.totalCount !== null) totalCount = page.totalCount;
    cursor = page.continueCursor;
    isDone = page.isDone || !cursor;
  }

  return {
    rows,
    totalCount,
    continueCursor: cursor,
    isDone,
  };
}
