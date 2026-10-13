create table if not exists public.workspace_app_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_app_state enable row level security;

drop policy if exists "members access workspace app state" on public.workspace_app_state;
revoke all on public.workspace_app_state from anon, authenticated;
grant all on public.workspace_app_state to service_role;

notify pgrst, 'reload schema';
