import type { ThreadLane, ThreadStorageMode } from "../threadSidebarSelectors";

export type ThreadServiceMessageInput = {
  threadId: string;
  role: "user" | "assistant";
  contentJson: string;
};

export type ThreadServiceSendTurnInput = {
  threadId: string;
  input: string;
  userContentJson: string;
  cwd?: string | null;
  supabaseUrl?: string | null;
  supabaseAnonKey?: string | null;
  supabaseAccessToken?: string;
};

export type ThreadServiceSetLensInput = {
  threadId: string;
  communityId: string | null;
  expectedContextVersion?: number | null;
};

export type ThreadServiceCreateInput = {
  threadId: string;
  title: string | null;
  engineId: string;
  modelId: string | null;
  threadLane: ThreadLane;
  storageMode: ThreadStorageMode;
  projectId: string | null;
  communityId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ThreadServiceSetEngineInput = {
  threadId: string;
  engineId: string;
  modelId: string | null;
};

export type ThreadServiceThread = {
  id: string;
  title: string | null;
  engine_id: string;
  model_id: string | null;
  thread_lane: ThreadLane;
  storage_mode: ThreadStorageMode;
  project_id: string | null;
  community_id: string | null;
  context_version?: number | null;
  workspace_path?: string | null;
  created_at: number;
  updated_at: number;
  last_event_at?: number | null;
  last_seq?: number | null;
};

export interface ThreadService {
  readonly threadLane: ThreadLane;
  readonly storageMode: ThreadStorageMode;

  listThreads(): Promise<ThreadServiceThread[]>;
  getThread(threadId: string): Promise<ThreadServiceThread | null>;
  createThread(input: ThreadServiceCreateInput): Promise<ThreadServiceThread | null>;
  deleteThread(threadId: string): Promise<void>;
  setThreadLens(input: ThreadServiceSetLensInput): Promise<ThreadServiceThread | null>;
  addMessage(input: ThreadServiceMessageInput): Promise<void>;
  sendTurn(input: ThreadServiceSendTurnInput): Promise<void>;
  setThreadTitle(threadId: string, title: string): Promise<void>;
  setThreadEngine?(input: ThreadServiceSetEngineInput): Promise<ThreadServiceThread | null>;
}
