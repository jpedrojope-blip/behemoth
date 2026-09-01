create extension if not exists "pgcrypto";

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Minha empresa',
  niche text not null default '',
  plan text not null default 'Basic',
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('ADMIN', 'MANAGER', 'MEMBER')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  email text not null default '',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('INCOME', 'EXPENSE')), description text not null, category text not null default 'Outros',
  amount numeric(14,2) not null check (amount > 0), date date not null default current_date,
  status text not null default 'PENDING' check (status in ('CONFIRMED', 'PENDING')), source text, created_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null, meeting_date timestamptz not null, notes text not null default '', transcript text not null default '', summary text not null default '', created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null, event_date date not null, event_time time not null default '09:00', kind text not null default 'EVENT',
  owner text not null default '', done boolean not null default false, duration_minutes integer not null default 30, created_at timestamptz not null default now()
);

-- Compatibilidade com tabelas legadas que usavam company_id.
alter table if exists public.clients add column if not exists workspace_id uuid;
alter table if exists public.transactions add column if not exists workspace_id uuid;
alter table if exists public.meetings add column if not exists workspace_id uuid;
alter table if exists public.calendar_events add column if not exists workspace_id uuid;

do $$
begin
  if to_regclass('public.clients') is not null then
    begin alter table public.clients add constraint clients_workspace_fk foreign key (workspace_id) references public.workspaces(id) on delete cascade; exception when duplicate_object then null; end;
  end if;
  if to_regclass('public.transactions') is not null then
    begin alter table public.transactions add constraint transactions_workspace_fk foreign key (workspace_id) references public.workspaces(id) on delete cascade; exception when duplicate_object then null; end;
  end if;
  if to_regclass('public.meetings') is not null then
    begin alter table public.meetings add constraint meetings_workspace_fk foreign key (workspace_id) references public.workspaces(id) on delete cascade; exception when duplicate_object then null; end;
  end if;
  if to_regclass('public.calendar_events') is not null then
    begin alter table public.calendar_events add constraint calendar_events_workspace_fk foreign key (workspace_id) references public.workspaces(id) on delete cascade; exception when duplicate_object then null; end;
  end if;
end $$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.clients enable row level security;
alter table public.transactions enable row level security;
alter table public.meetings enable row level security;
alter table public.calendar_events enable row level security;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = target_workspace and user_id = auth.uid());
$$;

drop policy if exists "members can read workspaces" on public.workspaces;
drop policy if exists "members can read workspace membership" on public.workspace_members;
drop policy if exists "members access clients" on public.clients;
drop policy if exists "members access transactions" on public.transactions;
drop policy if exists "members access meetings" on public.meetings;
drop policy if exists "members access calendar" on public.calendar_events;
create policy "members can read workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "members can read workspace membership" on public.workspace_members for select using (user_id = auth.uid());
create policy "members access clients" on public.clients for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members access transactions" on public.transactions for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members access meetings" on public.meetings for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members access calendar" on public.calendar_events for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
