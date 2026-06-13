-- MetaboCommand schema
-- Run in Supabase Dashboard -> SQL Editor

-- ============================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================
create type user_role as enum ('finance', 'operations');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role user_role not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- auto-insert a profile row when an auth user is created (fallback; we seed manually too)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'operations')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. AGENTS
-- ============================================================
create type agent_system as enum (
  'capital_reflex',
  'revenue_velocity',
  'inventory_intelligence',
  'customer_lifetime',
  'operational_health'
);

create type approval_queue_name as enum ('finance', 'operations');

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  system agent_system not null,
  queue approval_queue_name not null,
  is_active boolean not null default true,
  autonomous_limit numeric,
  approval_required_above numeric,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. APPROVAL ITEMS
-- ============================================================
create type approval_status as enum ('pending', 'approved', 'rejected');

create table public.approval_items (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete set null,
  agent_name text not null,
  queue approval_queue_name not null,
  action_description text not null,
  financial_impact text not null,
  impact_amount numeric,
  status approval_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  slack_notified boolean not null default false
);

create index approval_items_queue_status_idx on public.approval_items(queue, status);
create index approval_items_submitted_at_idx on public.approval_items(submitted_at desc);

-- ============================================================
-- 4. AGENT ACTION LOG
-- ============================================================
create table public.agent_action_log (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  agent_name text not null,
  queue approval_queue_name not null,
  action_type text not null,
  description text not null,
  outcome text not null,
  decided_by text not null,
  reasoning_summary text not null,
  approval_item_id uuid references public.approval_items(id) on delete set null
);

create index agent_action_log_queue_ts_idx on public.agent_action_log(queue, timestamp desc);

-- ============================================================
-- 5. ACTIVITY HISTORY
-- ============================================================
create table public.activity_history (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete set null,
  user_display_name text not null,
  user_email text not null,
  user_role user_role not null,
  activity_type text not null,
  description text not null,
  contextual_reference text
);

create index activity_history_role_ts_idx on public.activity_history(user_role, timestamp desc);

-- ============================================================
-- 6. SLACK SETTINGS (single row per queue)
-- ============================================================
create table public.slack_settings (
  queue approval_queue_name primary key,
  webhook_url text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.slack_settings (queue, webhook_url, enabled)
values ('finance', null, true), ('operations', null, true)
on conflict (queue) do nothing;

-- ============================================================
-- 7. RLS POLICIES
-- ============================================================
alter table public.profiles enable row level security;
alter table public.agents enable row level security;
alter table public.approval_items enable row level security;
alter table public.agent_action_log enable row level security;
alter table public.activity_history enable row level security;
alter table public.slack_settings enable row level security;

-- Profiles: users can read their own profile; all authenticated users can read any profile (for presence display)
create policy "profiles_read_all_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Helper: current user's role
create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Agents: readable by all authenticated; updatable only via service role (for MVP pause toggle uses service role through API route)
create policy "agents_read_all_authenticated"
  on public.agents for select
  to authenticated
  using (true);

create policy "agents_update_same_queue"
  on public.agents for update
  to authenticated
  using (queue::text = public.current_user_role()::text);

-- Approval items: users see only items for their role's queue
create policy "approval_items_read_same_queue"
  on public.approval_items for select
  to authenticated
  using (queue::text = public.current_user_role()::text);

create policy "approval_items_update_same_queue"
  on public.approval_items for update
  to authenticated
  using (queue::text = public.current_user_role()::text);

-- Agent action log: users see only records for their role's queue
create policy "agent_action_log_read_same_queue"
  on public.agent_action_log for select
  to authenticated
  using (queue::text = public.current_user_role()::text);

create policy "agent_action_log_insert_same_queue"
  on public.agent_action_log for insert
  to authenticated
  with check (queue::text = public.current_user_role()::text);

-- Activity history: users see only records from their own role
create policy "activity_history_read_same_role"
  on public.activity_history for select
  to authenticated
  using (user_role = public.current_user_role());

create policy "activity_history_insert_self"
  on public.activity_history for insert
  to authenticated
  with check (user_id = auth.uid());

-- Slack settings: any authenticated user can read, but a user may only update
-- the webhook for their OWN queue/role. Prevents e.g. an operations user from
-- overwriting the finance webhook.
create policy "slack_settings_read_all_authenticated"
  on public.slack_settings for select
  to authenticated
  using (true);

create policy "slack_settings_update_own_queue"
  on public.slack_settings for update
  to authenticated
  using (queue::text = public.current_user_role()::text)
  with check (queue::text = public.current_user_role()::text);

-- ============================================================
-- 8. REALTIME
-- ============================================================
-- Enable realtime on approval_items and agent_action_log
alter publication supabase_realtime add table public.approval_items;
alter publication supabase_realtime add table public.agent_action_log;
