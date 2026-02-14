import type { ThreadLane, ThreadStorageMode } from "../threadSidebarSelectors";
import {
  assertAllowedThreadServiceDomain,
  resolveThreadServiceDomain,
  type ThreadServiceDomain,
} from "./domainResolver";
import type { ThreadService, ThreadServiceThread } from "./types";

export class ThreadServiceRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThreadServiceRouterError";
  }
}

type ThreadServiceLookup = {
  findThreadById: (threadId: string) => ThreadServiceThread | null;
};

type ThreadServiceRouterConfig = ThreadServiceLookup & {
  services: ThreadService[];
};

function toServiceKey(domain: ThreadServiceDomain): string {
  return `${domain.threadLane}:${domain.storageMode}`;
}

export class ThreadServiceRouter {
  private readonly serviceByKey: Map<string, ThreadService>;
  private readonly findThreadById: ThreadServiceLookup["findThreadById"];

  constructor(config: ThreadServiceRouterConfig) {
    this.findThreadById = config.findThreadById;
    this.serviceByKey = new Map<string, ThreadService>();
    for (const service of config.services) {
      const domain = assertAllowedThreadServiceDomain(
        { threadLane: service.threadLane, storageMode: service.storageMode },
        { source: "service_registration" },
      );
      this.serviceByKey.set(toServiceKey(domain), service);
    }
  }

  resolveByThread(thread: Pick<ThreadServiceThread, "id" | "thread_lane" | "storage_mode" | "engine_id">): ThreadService {
    const domain = assertAllowedThreadServiceDomain(
      resolveThreadServiceDomain({
        threadLane: thread.thread_lane,
        storageMode: thread.storage_mode,
        engineId: thread.engine_id,
      }),
      { source: "thread_record", threadId: thread.id },
    );
    const service = this.serviceByKey.get(toServiceKey(domain));
    if (service) return service;
    throw new ThreadServiceRouterError(
      `No ThreadService registered for ${domain.threadLane}/${domain.storageMode} thread_id=${thread.id}`,
    );
  }

  resolveByThreadId(threadId: string): ThreadService {
    const thread = this.findThreadById(threadId);
    if (!thread) {
      throw new ThreadServiceRouterError(
        `Cannot route thread_id=${threadId}: thread domain unknown (hydrate thread first).`,
      );
    }
    return this.resolveByThread(thread);
  }

  resolveByLane(lane: ThreadLane, storageMode: ThreadStorageMode): ThreadService {
    const domain = assertAllowedThreadServiceDomain(
      resolveThreadServiceDomain({ threadLane: lane, storageMode }),
      { source: "lane_selector" },
    );
    const service = this.serviceByKey.get(toServiceKey(domain));
    if (service) return service;
    throw new ThreadServiceRouterError(
      `No ThreadService registered for ${domain.threadLane}/${domain.storageMode}`,
    );
  }
}
