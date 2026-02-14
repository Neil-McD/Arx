-- Set platform affiliate commission to 30% (3000 bps).
-- Keep this as the canonical DB source of truth.

alter table public.affiliate_program_config
  alter column commission_rate_bps set default 3000;

update public.affiliate_program_config
set commission_rate_bps = 3000,
    updated_at = now()
where id = 1;
