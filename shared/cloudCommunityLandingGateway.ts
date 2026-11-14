// The community landing page's calls (convex/communityLanding.ts): read the
// page signed in or out, join or ask to, withdraw a request, start a paid
// checkout (signed out too: cash first), finish it, and count a visit.
import {
  bootstrapConvexAuthenticatedClient,
  createConvexClient,
} from "./convexAuthenticatedClient";

export type CommunityLandingPlan = {
  billing_period: "monthly" | "annual" | string;
  name: string;
  label: string;
  price: string;
  plan: string | null;
  title: string;
  includes: string[];
};

export type CommunityLandingViewer = {
  state: "member" | "pending" | "denied" | "blocked" | "visitor";
  can_request_again: boolean;
  reapply_at: string | null;
  setup_required: boolean;
};

export type CommunityLandingPage = {
  ok: true;
  community: {
    slug: string;
    name: string;
    one_liner: string | null;
    about: string | null;
    member_count: number;
    avatar_url: string | null;
    banner_url: string | null;
    courses: Array<{ title: string; summary: string | null; lessons: number }>;
  };
  gate: "join" | "request_access" | "checkout" | string;
  available: boolean;
  action_label: string;
  plans: CommunityLandingPlan[];
  viewer: CommunityLandingViewer | null;
  terms_url: string | null;
  privacy_url: string | null;
  listed: boolean;
  is_owner: boolean;
  signed_in: boolean;
  host: { name: string; avatar_url: string | null; bio: string | null } | null;
  events: Array<{ title: string; starts_at: string; place: string | null; repeats: string | null }>;
  guide: { notes: number } | null;
  app: { name: string; url: string; host: string } | null;
};

async function clientFor(session: unknown | null) {
  if (!session) return { client: createConvexClient(), authSubject: undefined as string | undefined };
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return { client, authSubject: authSubject ?? undefined };
}

export async function fetchCommunityLanding(session: unknown | null, communitySlug: string): Promise<CommunityLandingPage | null> {
  const { client, authSubject } = await clientFor(session);
  const page = (await client.query("communityLanding:getCommunityLandingPage" as any, {
    communitySlug, ...(authSubject ? { authSubject } : {}),
  })) as CommunityLandingPage | { ok: false };
  return page && page.ok ? page : null;
}

export async function joinCommunityFromLanding(session: unknown, communitySlug: string): Promise<{ outcome?: string }> {
  const { client, authSubject } = await clientFor(session);
  return (await client.mutation("communityLanding:joinCommunityFromLanding" as any, { communitySlug, authSubject })) as { outcome?: string };
}

export async function cancelCommunityJoinRequestFromLanding(session: unknown, communitySlug: string): Promise<void> {
  const { client, authSubject } = await clientFor(session);
  await client.mutation("communityLanding:cancelCommunityJoinRequestFromLanding" as any, { communitySlug, authSubject });
}

export async function startCommunityLandingCheckout(
  session: unknown | null,
  params: { communitySlug: string; billingPeriod: "monthly" | "annual"; plan: string | null },
): Promise<{ checkout_url: string; session_id: string; buyer_secret: string | null }> {
  // Signed out (cash first): through the app's own server function, which
  // limits each visitor's checkouts (api/community-checkout.js).
  if (!session) {
    const response = await fetch("/api/community-checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ communitySlug: params.communitySlug, billingPeriod: params.billingPeriod, plan: params.plan }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok: true; checkout_url: string; session_id: string; buyer_secret: string }
      | { ok: false; code?: string }
      | null;
    if (!payload || !payload.ok) throw new Error((payload && "code" in payload && payload.code) || "join_unavailable");
    return { checkout_url: payload.checkout_url, session_id: payload.session_id, buyer_secret: payload.buyer_secret };
  }
  const { client, authSubject } = await clientFor(session);
  return (await client.action("communityLanding:startCommunityLandingCheckout" as any, {
    communitySlug: params.communitySlug,
    billingPeriod: params.billingPeriod,
    ...(params.plan ? { plan: params.plan } : {}),
    ...(authSubject ? { authSubject } : {}),
  })) as { checkout_url: string; session_id: string; buyer_secret: string | null };
}

export async function finishCommunityLandingCheckout(
  session: unknown,
  params: { communitySlug: string; sessionId: string; buyerSecret: string | null },
): Promise<{ status: "joined" | "pending" | "expired" | "not_found" }> {
  const { client, authSubject } = await clientFor(session);
  return (await client.action("communityLanding:finishCommunityLandingCheckout" as any, {
    communitySlug: params.communitySlug,
    sessionId: params.sessionId,
    ...(params.buyerSecret ? { buyerSecret: params.buyerSecret } : {}),
    authSubject,
  })) as { status: "joined" | "pending" | "expired" | "not_found" };
}

export async function recordCommunityLandingVisit(communitySlug: string, visitorKey: string): Promise<void> {
  await createConvexClient().mutation("communityLanding:recordCommunityLandingVisit" as any, { communitySlug, visitorKey });
}
