-- TEMPLATE

-- Name: YYYYMMDD_HHMM_<system>_<description>.sql

-- Example:
-- 20260404_1400_lane_create_runs.sql

-- Lane example:
create table lane.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz default now()
);

-- Penny example:
alter table public.penny_users
add column last_active_at timestamptz;