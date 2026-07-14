import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityPolynetGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityPolynetOverviewNode = {
  id: string;
  kind: "community" | "forming_memory" | "directory_node";
  community_id?: string;
  node_id?: string;
  type: string;
  label: string;
  title?: string;
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
  kind: "directory_edge";
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
  candidate_proposal_count: number;
  accepted_change_request_count: number;
  rejected_change_request_count: number;
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
      proposed: number;
      accepted: number;
      rejected: number;
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
    forming_node_limit: number;
    has_more_forming_nodes: boolean;
  };
  memory: {
    total_visible_nodes: number;
    counts_by_type: Record<string, number>;
    counts_by_status: Record<string, number>;
    stale_count: number;
    contested_count: number;
    node_counts_are_lower_bound: boolean;
    edge_counts_are_lower_bound: boolean;
  };
};

export async function fetchCloudCommunityPolynetOverview<SessionT>(
  params: CloudCommunityPolynetGatewayParams<SessionT> & {
    communityId: string;
    nodeLimit?: number;
  },
): Promise<CloudCommunityPolynetOverview | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityPolynetOverview" as any, {
    authSubject,
    communityId: params.communityId,
    ...(typeof params.nodeLimit === "number" ? { nodeLimit: params.nodeLimit } : {}),
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as CloudCommunityPolynetOverview;
}
