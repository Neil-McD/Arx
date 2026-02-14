-- Keep funnel configuration, drop funnel lead capture/review surface (deferred for MVP).

drop function if exists public.list_community_funnel_leads(uuid, integer);
drop function if exists public.capture_community_funnel_lead_by_slug(text, text, text, text, uuid, jsonb);

drop table if exists public.community_funnel_leads cascade;
