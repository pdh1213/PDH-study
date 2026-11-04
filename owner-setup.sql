create table public.owner_setup (
  id boolean primary key default true check (id),
  code_hash text not null,
  used_at timestamptz
);
alter table public.owner_setup enable row level security;
revoke all on public.owner_setup from anon, authenticated;

-- The one-time setup code hash is inserted separately and is not kept in source.

