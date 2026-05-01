import type { AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import type {
  OperatorBuilderRecord,
  OperatorEventRecord,
  OperatorMonetizationSnapshot,
  OperatorOverviewSnapshot,
  OperatorRange,
  OperatorRiskItem,
} from "./operatorTypes";

async function withOperatorAuth(session: AuthSessionLike) {
  requireConvexUrl();
  return await bootstrapConvexAuthenticatedClient(session);
}

export async function loadOperatorOverviewCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
}): Promise<OperatorOverviewSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:getOperatorOverview" as any, {
    authSubject,
    range: params.range ?? "30d",
  })) as OperatorOverviewSnapshot;
}

export async function loadOperatorBuildersCanonical(params: {
  session: AuthSessionLike;
  query?: string;
  limit?: number;
}): Promise<OperatorBuilderRecord[]> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:listOperatorBuilders" as any, {
    authSubject,
    query: params.query,
    limit: params.limit ?? 25,
  })) as OperatorBuilderRecord[];
}

export async function loadOperatorMonetizationCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
}): Promise<OperatorMonetizationSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:getOperatorMonetization" as any, {
    authSubject,
    range: params.range ?? "30d",
  })) as OperatorMonetizationSnapshot;
}

export async function loadOperatorRisksCanonical(params: {
  session: AuthSessionLike;
  limit?: number;
}): Promise<OperatorRiskItem[]> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:listOperatorRisks" as any, {
    authSubject,
    limit: params.limit ?? 25,
  })) as OperatorRiskItem[];
}

export async function loadOperatorEventsCanonical(params: {
  session: AuthSessionLike;
  eventType?: string;
  limit?: number;
}): Promise<OperatorEventRecord[]> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:listOperatorEvents" as any, {
    authSubject,
    eventType: params.eventType,
    limit: params.limit ?? 25,
  })) as OperatorEventRecord[];
}
