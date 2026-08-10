-- ============================================================
-- Commission Manager — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── profiles ─────────────────────────────────────────────────
-- Studio settings per user (replaces app_config localStorage)
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Studio identity
  project_name text default 'Estudio de Comisiones',
  project_subtitle text default 'De la idea a la entrega',
  project_icon text default '🔭',
  project_banner_url text default '',
  project_banner_color text default '',

  -- Visual
  accent_color text default '#22C55E',
  font_family text default 'Inter',
  font_size integer default 14,
  global_bg_url text default '',
  global_bg_opacity float default 0.85,
  sidebar_width integer default 230,

  -- Integrations (encrypted in production — fine for now)
  telegram_token text default '',
  telegram_chat_id text default '',
  telegram_sticker_sets jsonb default '[]'::jsonb,

  -- UI preferences
  studio_view_mode text default 'list',
  header_collapsed boolean default false,
  section_bgs jsonb default '{}'::jsonb,
  section_icons jsonb default '{}'::jsonb
);

-- RLS: each user can only read/write their own profile
alter table profiles enable row level security;
create policy "profiles: own data only" on profiles
  for all using (auth.uid() = id);

-- ── tasks (comisiones) ────────────────────────────────────────
-- Replaces task_fields localStorage
create table if not exists tasks (
  id text primary key,  -- Taskade task ID
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Fields (matches taskStore inferFields shape)
  priority text default 'ok',
  stage text default 'new',
  client text default '',
  client_email text default '',
  client_name text default '',
  deadline text default '',
  assignee text default '',
  timer integer default 0,
  timer_running boolean default false,
  pinned boolean default false,
  note text default '',
  progress integer default 0,
  next_step text default '',

  -- JSON fields
  comments jsonb default '[]'::jsonb,
  attachments jsonb default '[]'::jsonb,
  reactions jsonb default '{}'::jsonb,
  checklist jsonb default '[]'::jsonb,
  active_widgets jsonb default '[]'::jsonb,

  -- Payment & delivery
  commission_request_id text default '',
  payment_details jsonb default null,

  -- Completion flow
  completed_state boolean default false,
  completed_at bigint default null,
  awaiting_archive boolean default false,
  archived boolean default false,

  -- Section backgrounds & metadata
  section_id text default ''
);

alter table tasks enable row level security;
create policy "tasks: own data only" on tasks
  for all using (auth.uid() = user_id);

-- ── commission_requests ───────────────────────────────────────
-- Replaces commission_requests localStorage
create table if not exists commission_requests (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),

  status text default 'pending',  -- pending | accepted | rejected
  name text not null,
  email text not null,
  social text default '',
  artwork_type text default '',
  description text default '',
  usage text default '',
  styles jsonb default '[]'::jsonb,
  formats jsonb default '[]'::jsonb,
  size text default '',
  deadline text default '',
  budget_min numeric default null,
  budget_max numeric default null,
  notes text default '',
  ref_notes text default '',
  image_urls text default '',
  images jsonb default '[]'::jsonb,  -- [{name, url (base64)}]
  terms boolean default false,
  reject_reason text default '',
  payment_details jsonb default null,
  with_payment boolean default false
);

alter table commission_requests enable row level security;
create policy "requests: owner can manage" on commission_requests
  for all using (auth.uid() = user_id);
-- Clients can insert their own requests (no auth required for public form)
create policy "requests: public insert" on commission_requests
  for insert with check (true);

-- ── portfolio_items ───────────────────────────────────────────
create table if not exists portfolio_items (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  sort_order integer default 0,

  title text default '',
  description text default '',
  client text default '',
  tags jsonb default '[]'::jsonb,
  image_url text default '',
  year text default '',
  featured boolean default false
);

alter table portfolio_items enable row level security;
create policy "portfolio: owner can manage" on portfolio_items
  for all using (auth.uid() = user_id);
create policy "portfolio: public read" on portfolio_items
  for select using (true);

-- ── studio_guide ──────────────────────────────────────────────
create table if not exists studio_guide (
  user_id uuid references auth.users(id) on delete cascade primary key,
  updated_at timestamptz default now(),
  blocks jsonb default '[]'::jsonb
);

alter table studio_guide enable row level security;
create policy "guide: own data only" on studio_guide
  for all using (auth.uid() = user_id);

-- ── kanban_config ─────────────────────────────────────────────
create table if not exists kanban_config (
  user_id uuid references auth.users(id) on delete cascade primary key,
  updated_at timestamptz default now(),
  custom_sections jsonb default '[]'::jsonb,
  order_overrides jsonb default '{}'::jsonb,
  color_overrides jsonb default '{}'::jsonb,
  label_overrides jsonb default '{}'::jsonb
);

alter table kanban_config enable row level security;
create policy "kanban: own data only" on kanban_config
  for all using (auth.uid() = user_id);

-- ── updated_at trigger ───────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated before update on profiles
  for each row execute function update_updated_at();
create trigger trg_tasks_updated before update on tasks
  for each row execute function update_updated_at();
create trigger trg_guide_updated before update on studio_guide
  for each row execute function update_updated_at();
create trigger trg_kanban_updated before update on kanban_config
  for each row execute function update_updated_at();

-- ── auto-create profile on signup ────────────────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
