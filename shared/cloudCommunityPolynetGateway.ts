import type { ConvexReactClient } from "convex/react";

import { api } from "../convex/_generated/api";
import { resolveAuthSubject, resolveConvexRuntimeToken } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import {
  createAuthenticatedConvexRealtimeClient,
  type ConvexRealtimeAuthState,
  type ConvexRealtimeEnsureSession,
} from "./convexRealtimeAuth";

type CloudCommunityPolynetGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityPolynetOverviewNode = {
  id: string;
  lineage_id: string;
  kind: "community" | "directory_node" | "resource_node";
  community_id?: string;
  node_id?: string;
  type: string;
  label: string | null;
  title?: string | null;
  status?: string;
  confidence?: number;
  evidence_strength?: string;
  staleness_score?: number;
  retrieval_usefulness_score?: number;
  outcome_impact_score?: number;
  updated_at?: string;
  created_at?: string;
};

export type CloudCommunityPolynetOverviewEdge = {
  id: string;
  kind: "directory_edge" | "resource_edge";
  edge_id: string;
  from: string;
  to: string;
  type: string;
  confidence: number;
  updated_at: string;
};

export type CloudCommunityPolynetOverviewRun = {
  id: string;
  status: string;
  activity_state: string;
  trigger_type: string;
  heartbeat_id: string | null;
  wake_reason: string | null;
  stop_reason: string | null;
  tool_step_count: number;
  applied_change_request_count: number;
  started_at: string | null;
  finished_at: string | null;
};

export type CloudCommunityPolynetOverview = {
  community: {
    id: string;
    name: string;
    slug: string;
  };
  viewer: {
    is_manager: boolean;
  };
  agent: {
    key: "community_agent";
    status: string;
    activity_state: string;
    last_run_at: string | null;
    last_run_status: string | null;
    last_wake_reason: string | null;
    recent_actions_summary: {
      applied: number;
    };
    recent_runs: CloudCommunityPolynetOverviewRun[];
  };
  graph: {
    root_node_id: string;
    nodes: CloudCommunityPolynetOverviewNode[];
    edges: CloudCommunityPolynetOverviewEdge[];
    node_limit: number;
    edge_limit: number;
    has_more_nodes: boolean;
    has_more_edges: boolean;
  };
  memory: {
    total_visible_nodes: number;
    learned_node_count: number;
    source_node_count: number;
    counts_by_type: Record<string, number>;
    counts_by_status: Record<string, number>;
    stale_count: number;
    contested_count: number;
    node_counts_are_lower_bound: boolean;
    edge_counts_are_lower_bound: boolean;
  };
};

export type CloudCommunityPolynetLiveClient = {
  client: ConvexReactClient;
  authSubject: string;
  close: () => void;
};

function coerceCommunityPolynetOverview(payload: unknown): CloudCommunityPolynetOverview | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as CloudCommunityPolynetOverview;
}

function resolveSessionRuntimeToken(sessionRaw: unknown): string {
  return String(resolveConvexRuntimeToken((sessionRaw ?? null) as any) ?? "").trim();
}

export function createCloudCommunityPolynetLiveClient<SessionT>(
  params: CloudCommunityPolynetGatewayParams<SessionT> & {
    ensureSession?: ConvexRealtimeEnsureSession<SessionT>;
  },
): CloudCommunityPolynetLiveClient {
  const authSubject = resolveAuthSubject(params.session as any);
  if (!authSubject) throw new Error("convex_auth_subject_required");
  if (!resolveSessionRuntimeToken(params.session)) throw new Error("convex_identity_token_required");

  const authState: ConvexRealtimeAuthState<SessionT> = {
    sessionRef: { current: params.session },
    ensureSessionRef: { current: params.ensureSession },
  };
  const realtimeClient = createAuthenticatedConvexRealtimeClient({
    convexUrl: requireConvexUrl(),
    authState,
    source: "community_polynet_live",
  });
  return {
    client: realtimeClient.client,
    authSubject,
    close: realtimeClient.close,
  };
}

export function subscribeCloudCommunityPolynetOverview(params: {
  liveClient: CloudCommunityPolynetLiveClient;
  communityId: string;
  nodeLimit?: number;
  onUpdate: (overview: CloudCommunityPolynetOverview) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const watch = params.liveClient.client.watchQuery(
    api.communityIntelligenceDirectory.getCommunityPolynetOverview,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
      ...(typeof params.nodeLimit === "number" ? { nodeLimit: params.nodeLimit } : {}),
    } as any,
  );
  const publish = () => {
    try {
      const overview = coerceCommunityPolynetOverview(watch.localQueryResult());
      if (overview) params.onUpdate(overview);
    } catch (error) {
      params.onError?.(error);
    }
  };
  publish();
  return watch.onUpdate(publish);
}

export async function fetchCloudCommunityPolynetOverview<SessionT>(
  params: CloudCommunityPolynetGatewayParams<SessionT> & {
    communityId: string;
    nodeLimit?: number;
  },
): Promise<CloudCommunityPolynetOverview | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityIntelligenceDirectory:getCommunityPolynetOverview" as any, {
    authSubject,
    communityId: params.communityId,
    ...(typeof params.nodeLimit === "number" ? { nodeLimit: params.nodeLimit } : {}),
  });
  return coerceCommunityPolynetOverview(payload);
}
