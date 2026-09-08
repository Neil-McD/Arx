import { useCallback, useEffect, useRef, useState } from "react";
import { listCloudCommunityDirectoryPage } from "../../../../shared/cloudCommunityDirectoryGateway";
import { searchCommunityDirectoryBatch } from "../../../../shared/communityDirectorySearch";
import type { CommunityDirectoryMember } from "../../../../shared/communityTypes";
import type { WebCommunityChatPanelProps } from "../components/WebCommunityChatPanel";

export function useWebMemberDirectorySearch(chat: WebCommunityChatPanelProps, query: string) {
  const [result, setResult] = useState<{ key: string; rows: CommunityDirectoryMember[]; cursor: string | null; error: string | null }>({ key: "", rows: [], cursor: null, error: null });
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const key = JSON.stringify([chat.sessionUserId, chat.activeCommunity?.id, query.trim()]);
  const run = useCallback(async (cursor: string | null, append: boolean, sequence: number) => {
    if (!chat.session || !chat.activeCommunity?.id || busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const batch = await searchCommunityDirectoryBatch({
        query, cursor, isCurrent: () => generation.current === sequence,
        loadPage: nextCursor => listCloudCommunityDirectoryPage({ session: chat.session!, communityId: chat.activeCommunity!.id!, cursor: nextCursor, pageSize: 100 }),
      });
      if (!batch || generation.current !== sequence) return;
      setResult(previous => ({ key, rows: [...new Map([...(append ? previous.rows : []), ...batch.rows].map(row => [row.id, row])).values()], cursor: batch.cursor, error: null }));
    } catch {
      if (generation.current === sequence) setResult(previous => ({ key, rows: append ? previous.rows : [], cursor, error: "Could not search members. Try again." }));
    } finally {
      if (generation.current === sequence) { busy.current = false; setLoading(false); }
    }
  }, [chat.session, chat.activeCommunity?.id, key, query]);
  useEffect(() => {
    const sequence = ++generation.current;
    busy.current = false;
    setLoading(Boolean(query.trim()));
    if (!query.trim()) return;
    const timer = setTimeout(() => void run(null, false, sequence), 250);
    return () => { clearTimeout(timer); generation.current += 1; busy.current = false; };
  }, [run, query]);
  const current = result.key === key;
  return { rows: current ? result.rows : [], loading, error: current ? result.error : null,
    hasMore: current && Boolean(result.cursor),
    loadMore: () => void run(current ? result.cursor : null, current, generation.current) };
}
