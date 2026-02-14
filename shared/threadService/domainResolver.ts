import {
  normalizeThreadLane,
  normalizeThreadStorageMode,
  type ThreadLane,
  type ThreadStorageMode,
} from "../threadSidebarSelectors";

export type ThreadServiceDomain = {
  threadLane: ThreadLane;
  storageMode: ThreadStorageMode;
};

type ResolveThreadServiceDomainInput = {
  threadLane?: unknown;
  storageMode?: unknown;
  engineId?: string | null;
};

const ALLOWED_THREAD_DOMAINS = new Set<string>(["chat:cloud", "agent:local"]);

function domainKey(domain: ThreadServiceDomain): string {
  return `${domain.threadLane}:${domain.storageMode}`;
}

export function isAllowedThreadServiceDomain(domain: ThreadServiceDomain): boolean {
  return ALLOWED_THREAD_DOMAINS.has(domainKey(domain));
}

export function resolveThreadServiceDomain(input: ResolveThreadServiceDomainInput): ThreadServiceDomain {
  const threadLane = normalizeThreadLane(input.threadLane, input.engineId);
  const storageMode = normalizeThreadStorageMode(input.storageMode, threadLane, input.engineId);
  return { threadLane, storageMode };
}

export function assertAllowedThreadServiceDomain(
  domain: ThreadServiceDomain,
  context: { threadId?: string; source: string },
): ThreadServiceDomain {
  if (isAllowedThreadServiceDomain(domain)) return domain;
  const suffix = context.threadId ? ` thread_id=${context.threadId}` : "";
  throw new Error(
    `Unsupported thread domain ${domain.threadLane}/${domain.storageMode} from ${context.source}.${suffix}`,
  );
}
