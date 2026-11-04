create table public.study_attachments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  material_id uuid not null references public.study_materials(id) on delete cascade,
  storage_path text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 1 and 120),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  created_at timestamptz not null default now()
);

create index study_attachments_material_idx on public.study_attachments(material_id, created_at);
create index study_attachments_room_idx on public.study_attachments(room_id);

alter table public.study_attachments enable row level security;
revoke all on public.study_attachments from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('study-files', 'study-files', false, 20971520);

