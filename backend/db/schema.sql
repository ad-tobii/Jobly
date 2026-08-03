-- ============================================================================
-- Jobly — Supabase schema
-- ============================================================================
-- Run this against a fresh Supabase project (SQL Editor, or `psql` against the
-- project's connection string) before starting the backend.
--
-- This file was reconstructed from the queries the backend actually issues.
-- If you change a column here, grep backend/src for the table name too.
--
-- NOTE ON EMBEDDINGS: cv_chunks.embedding is sized for the model behind the
-- `embed` edge function (see backend/src/workers/cvWorker.js). The default
-- below assumes Supabase's built-in `gte-small` (384 dimensions). If your
-- edge function uses a different model — e.g. OpenAI text-embedding-3-small
-- (1536) — change the vector size here AND in match_cv_chunks below.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ── users ───────────────────────────────────────────────────────────────────
-- Profile rows mirror auth.users; the id is the Supabase auth user id.
create table if not exists public.users (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text not null unique,
  full_name           text,
  phone               text,
  linkedin_url        text,
  city                text,
  country             text,
  -- { digest_frequency: 'daily'|'twice_daily'|'weekly', digest_time: 'HH:MM', timezone: 'Area/City' }
  preferences         jsonb not null default '{}'::jsonb,
  onboarding_complete boolean not null default false,
  gmail_refresh_token text,
  last_digest_sent    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── cvs ─────────────────────────────────────────────────────────────────────
create table if not exists public.cvs (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references public.users (id) on delete cascade,
  label              text not null,
  source_type        text not null check (source_type in ('file', 'text')),
  -- Storage object path, not a URL: the bucket is private and links are signed
  -- on read. See backend/src/utils/storage.js.
  raw_cv_path        text,
  raw_text           text,
  -- Pipeline: processing → (invalid | unsalvageable | needs_enhancement) | ready | failed
  status             text not null default 'processing',
  rejection_reason   text,
  quality_tier       text check (quality_tier in ('strong', 'salvageable', 'unsalvageable')),
  quality_summary    text,
  cv_health_score    integer,
  cv_health_feedback jsonb,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists cvs_user_id_idx on public.cvs (user_id);
create index if not exists cvs_user_active_idx on public.cvs (user_id, is_active);

-- ── cv_chunks ───────────────────────────────────────────────────────────────
-- Embedded slices of each CV, used for RAG during job scoring.
create table if not exists public.cv_chunks (
  id           uuid primary key default uuid_generate_v4(),
  cv_id        uuid not null references public.cvs (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  content      text not null,
  embedding    vector(384),
  section_type text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists cv_chunks_cv_id_idx on public.cv_chunks (cv_id);
create index if not exists cv_chunks_user_id_idx on public.cv_chunks (user_id);
create index if not exists cv_chunks_embedding_idx
  on public.cv_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ── jobs ────────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references public.users (id) on delete cascade,
  source_type        text not null check (source_type in ('url', 'paste')),
  source_url         text,
  title              text,
  company            text,
  location           text,
  logo_url           text,
  description        text,
  raw_description    text,
  raw_details        jsonb,
  render_description jsonb,
  match_score        integer,
  match_reasoning    jsonb,
  gaps               jsonb,
  -- Pipeline: scraping → scraped → scoring → (recommended | low_match)
  --           → generating → ready → applied; failed on any error
  status             text not null default 'scraping',
  selected_cv_id     uuid references public.cvs (id) on delete set null,
  digest_sent        boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists jobs_user_id_idx on public.jobs (user_id);
create index if not exists jobs_user_status_idx on public.jobs (user_id, status);
create index if not exists jobs_user_created_idx on public.jobs (user_id, created_at desc);
-- The Gmail webhook dedupes incoming postings on (user_id, source_url).
create unique index if not exists jobs_user_source_url_key
  on public.jobs (user_id, source_url) where source_url is not null;

-- ── job_cv_matches ──────────────────────────────────────────────────────────
-- One row per (job, CV) pair scored by the scoring worker.
create table if not exists public.job_cv_matches (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  cv_id       uuid not null references public.cvs (id) on delete cascade,
  score       integer not null default 0,
  reasoning   jsonb,
  gaps        jsonb,
  summary     text,
  recommended boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- scoreWorker upserts with onConflict: 'job_id,cv_id'
  constraint job_cv_matches_job_cv_key unique (job_id, cv_id)
);

create index if not exists job_cv_matches_job_id_idx on public.job_cv_matches (job_id);

-- ── documents ───────────────────────────────────────────────────────────────
create table if not exists public.documents (
  id                uuid primary key default uuid_generate_v4(),
  job_id            uuid not null references public.jobs (id) on delete cascade,
  user_id           uuid not null references public.users (id) on delete cascade,
  -- Storage object paths, not URLs — signed on read (see utils/storage.js).
  tailored_cv_path  text,
  cover_letter_path text,
  generated_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  -- docgenWorker upserts with onConflict: 'job_id,user_id'
  constraint documents_job_user_key unique (job_id, user_id)
);

create index if not exists documents_user_id_idx on public.documents (user_id);

-- ── applications ────────────────────────────────────────────────────────────
create table if not exists public.applications (
  id         uuid primary key default uuid_generate_v4(),
  job_id     uuid not null references public.jobs (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  status     text not null default 'applied'
             check (status in ('applied', 'interviewing', 'offer', 'rejected', 'dismissed')),
  notes      text,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One application per job per user; POST /applications/:jobId returns 409 otherwise.
  constraint applications_job_user_key unique (job_id, user_id)
);

create index if not exists applications_user_id_idx on public.applications (user_id);
create index if not exists applications_user_status_idx on public.applications (user_id, status);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array['users', 'cvs', 'jobs', 'job_cv_matches', 'applications']
  loop
    execute format(
      'drop trigger if exists touch_%1$s_updated_at on public.%1$s;
       create trigger touch_%1$s_updated_at
         before update on public.%1$s
         for each row execute function public.touch_updated_at();',
      target
    );
  end loop;
end;
$$;

-- ── match_cv_chunks RPC ─────────────────────────────────────────────────────
-- Vector similarity search over one user's chunks for a single CV.
-- Called by backend/src/workers/scoreWorker.js.
create or replace function public.match_cv_chunks(
  query_embedding vector(384),
  match_user_id   uuid,
  match_cv_id     uuid,
  match_count     int default 8
)
returns table (
  id           uuid,
  content      text,
  section_type text,
  similarity   float
)
language sql
stable
as $$
  select
    cv_chunks.id,
    cv_chunks.content,
    cv_chunks.section_type,
    1 - (cv_chunks.embedding <=> query_embedding) as similarity
  from public.cv_chunks
  where cv_chunks.user_id = match_user_id
    and cv_chunks.cv_id = match_cv_id
    and cv_chunks.embedding is not null
  order by cv_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- ── create_application RPC ──────────────────────────────────────────────────
-- Inserts the application and moves the job to 'applied' in one transaction.
-- As two separate client calls, a failure on the second left an application
-- attached to a job still reading 'ready'.
create or replace function public.create_application(
  p_job_id  uuid,
  p_user_id uuid
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications;
begin
  -- Ownership check inside the function: callers pass ids, not trust.
  if not exists (
    select 1 from public.jobs
    where id = p_job_id and user_id = p_user_id
  ) then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.applications
    where job_id = p_job_id and user_id = p_user_id
  ) then
    raise exception 'ALREADY_APPLIED';
  end if;

  insert into public.applications (job_id, user_id, status)
  values (p_job_id, p_user_id, 'applied')
  returning * into v_application;

  update public.jobs
  set status = 'applied'
  where id = p_job_id and user_id = p_user_id;

  return v_application;
end;
$$;

-- ── Row Level Security ──────────────────────────────────────────────────────
-- The backend talks to Supabase with the service role key, which bypasses RLS
-- and scopes every query by user_id itself. These policies exist so that a
-- leaked anon key can't read other people's data.

alter table public.users          enable row level security;
alter table public.cvs            enable row level security;
alter table public.cv_chunks      enable row level security;
alter table public.jobs           enable row level security;
alter table public.job_cv_matches enable row level security;
alter table public.documents      enable row level security;
alter table public.applications   enable row level security;

drop policy if exists users_self_access on public.users;
create policy users_self_access on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists cvs_owner_access on public.cvs;
create policy cvs_owner_access on public.cvs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cv_chunks_owner_access on public.cv_chunks;
create policy cv_chunks_owner_access on public.cv_chunks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists jobs_owner_access on public.jobs;
create policy jobs_owner_access on public.jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists documents_owner_access on public.documents;
create policy documents_owner_access on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists applications_owner_access on public.applications;
create policy applications_owner_access on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- job_cv_matches has no user_id column — ownership comes via the job.
drop policy if exists job_cv_matches_owner_access on public.job_cv_matches;
create policy job_cv_matches_owner_access on public.job_cv_matches
  for all
  using (
    exists (
      select 1 from public.jobs
      where jobs.id = job_cv_matches.job_id and jobs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.jobs
      where jobs.id = job_cv_matches.job_id and jobs.user_id = auth.uid()
    )
  );

-- ── Storage buckets ─────────────────────────────────────────────────────────
-- PRIVATE. These hold CVs and generated application documents — a public
-- bucket would make every one of them readable by anyone holding the URL.
-- The backend mints short-lived signed URLs at read time instead.
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false), ('documents', 'documents', false)
on conflict (id) do update set public = false;

-- Uploads are namespaced by user id: `${user_id}/...`, so the first path
-- segment decides ownership.
drop policy if exists "Users manage own cv files" on storage.objects;
create policy "Users manage own cv files" on storage.objects
  for all
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users manage own documents" on storage.objects;
create policy "Users manage own documents" on storage.objects
  for all
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
