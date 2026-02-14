import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { RuntimeClient } from "../../runtime/arp/client";
import type { SessionResume, TurnRecord } from "../../runtime/arp/types";
import type { ThreadService } from "../../../shared/threadService";

type UseDesktopThreadMetaLoadersArgs = {
  runtimeClient: RuntimeClient;
  resolveThreadServiceForThreadId: (threadId: string) => ThreadService;
  setTurnsByAssistantEventId: Dispatch<SetStateAction<Record<string, TurnRecord>>>;
  setSessionResume: Dispatch<SetStateAction<SessionResume | null>>;
};

export function useDesktopThreadMetaLoaders(args: UseDesktopThreadMetaLoadersArgs) {
  const {
    runtimeClient,
    resolveThreadServiceForThreadId,
    setTurnsByAssistantEventId,
    setSessionResume,
  } = args;

  const loadTurns = useCallback(
    async (sessionId: string) => {
      const service = resolveThreadServiceForThreadId(sessionId);
      if (service.storageMode === "cloud") {
        setTurnsByAssistantEventId({});
        return;
      }
      try {
        const turns = await runtimeClient.listTurns(sessionId, 500);
        const map: Record<string, TurnRecord> = {};
        for (const turn of turns) {
          if (turn.assistant_event_id) {
            map[turn.assistant_event_id] = turn;
          }
        }
        setTurnsByAssistantEventId(map);
      } catch (error) {
        console.error(error);
        setTurnsByAssistantEventId({});
      }
    },
    [resolveThreadServiceForThreadId, runtimeClient, setTurnsByAssistantEventId],
  );

  const loadSessionResume = useCallback(
    async (sessionId: string) => {
      const service = resolveThreadServiceForThreadId(sessionId);
      if (service.storageMode === "cloud") {
        setSessionResume(null);
        return;
      }
      try {
        const data = await runtimeClient.getSessionResume(sessionId);
        setSessionResume(data);
      } catch (error) {
        console.error(error);
      }
    },
    [resolveThreadServiceForThreadId, runtimeClient, setSessionResume],
  );

  return {
    loadTurns,
    loadSessionResume,
  };
}
