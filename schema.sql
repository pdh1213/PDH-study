create table public.study_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null default now()
);

create table public.study_materials (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  subject text not null check (char_length(subject) between 1 and 60),
  exam_type text not null default '수행평가' check (exam_type in ('수행평가', '지필고사', '기타')),
  summary text not null default '' check (char_length(summary) <= 300),
  content text not null default '' check (char_length(content) <= 50000),
  source_url text check (source_url is null or char_length(source_url) <= 2000),
  quiz_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.study_shares (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  label text not null default '친구 공유' check (char_length(label) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  material_ids uuid[],
  can_practice boolean not null default true,
  enabled boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index study_materials_room_idx on public.study_materials(room_id, created_at desc);
create index study_shares_room_idx on public.study_shares(room_id);

alter table public.study_rooms enable row level security;
alter table public.study_materials enable row level security;
alter table public.study_shares enable row level security;
revoke all on public.study_rooms, public.study_materials, public.study_shares from anon, authenticated;

