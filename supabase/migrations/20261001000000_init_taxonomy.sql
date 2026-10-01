-- musical-goggles AI Classroom — Phase 1 schema
-- One correction taxonomy shared by voice retrieval, uploaded-video and live-camera analysis.
-- Postgres 15+ / Supabase. Requires pgvector >= 0.5 (HNSW) and unaccent.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- exercises
-- ---------------------------------------------------------------------------
create table public.exercises (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique
               check (slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  name         text not null check (length(btrim(name)) > 0),
  french_term  text,
  german_term  text,
  level        text not null check (level in ('beginner', 'intermediate', 'advanced')),
  category     text not null check (category in ('barre', 'centre', 'port_de_bras', 'allegro')),
  description  text not null default '',
  -- Display order on the classroom / curriculum screens (barre order).
  position     integer not null default 1000,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index exercises_position_idx on public.exercises (position, name);

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- exercise_aliases — multilingual terminology (en / fr / de) for the normalizer
-- and for full-text search. Kept separate so adding a term never needs code.
-- ---------------------------------------------------------------------------
create table public.exercise_aliases (
  id           uuid primary key default gen_random_uuid(),
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  alias        text not null check (length(btrim(alias)) > 0),
  language     text not null check (language in ('en', 'fr', 'de')),
  created_at   timestamptz not null default now()
);

create unique index exercise_aliases_exercise_alias_uq
  on public.exercise_aliases (exercise_id, lower(alias));
create index exercise_aliases_exercise_id_idx
  on public.exercise_aliases (exercise_id);

-- ---------------------------------------------------------------------------
-- corrections — THE source of truth. Voice, video and camera all resolve here.
-- ---------------------------------------------------------------------------
create table public.corrections (
  id               uuid primary key default gen_random_uuid(),
  exercise_id      uuid not null references public.exercises (id) on delete cascade,
  slug             text not null check (slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  error_name       text not null check (length(btrim(error_name)) > 0),
  description      text not null default '',
  correction       text not null check (length(btrim(correction)) > 0),
  cue_phrase       text not null check (length(btrim(cue_phrase)) > 0),
  -- NULL = not camera-detectable. Shape is validated strictly in @mg/taxonomy;
  -- the DB guards the minimum contract so bad JSON can't silently enable a detector.
  detector         jsonb
                   check (
                     detector is null or (
                       jsonb_typeof(detector) = 'object'
                       and detector ->> 'type' = 'geometric'
                       and jsonb_typeof(detector -> 'rule') = 'string'
                       and jsonb_typeof(detector -> 'threshold') = 'number'
                     )
                   ),
  -- multilingual-e5-small (384 dims). NULL until generated; reset to NULL by
  -- trigger whenever the retrieval text changes, so stale vectors never rank.
  embedding        extensions.vector(384),
  embedding_model  text,
  -- Retrieval unit: "exercise | terminology | error | correction | cue".
  -- Maintained by trigger — never written by application code.
  searchable_text  text not null default '',
  search_tsv       tsvector not null default ''::tsvector,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint corrections_exercise_slug_uq unique (exercise_id, slug),
  constraint corrections_embedding_model_chk
    check ((embedding is null) = (embedding_model is null))
);

create index corrections_exercise_id_idx on public.corrections (exercise_id);
create index corrections_search_tsv_idx  on public.corrections using gin (search_tsv);
create index corrections_embedding_hnsw_idx
  on public.corrections using hnsw (embedding extensions.vector_cosine_ops);
create index corrections_detectable_idx
  on public.corrections (exercise_id) where detector is not null;

-- ---------------------------------------------------------------------------
-- Search document builder.
--   A: exercise terminology (name, fr, de, aliases)   — 'simple' (no stemming; multilingual)
--   B: error name + cue phrase                         — 'simple'
--   C: error/correction/cue/description                — 'english' (stemmed: collapse ~ collapsing)
-- Everything is unaccented so "plie" matches "plié".
-- ---------------------------------------------------------------------------
create or replace function public.correction_search_document(
  p_exercise_id uuid,
  p_error_name  text,
  p_correction  text,
  p_cue_phrase  text,
  p_description text,
  out searchable_text text,
  out search_tsv tsvector
)
language sql
stable
set search_path = ''
as $$
  with ex as (
    select e.name, e.french_term, e.german_term,
           (select string_agg(a.alias, ' ' order by a.alias)
              from public.exercise_aliases a
             where a.exercise_id = e.id) as aliases
      from public.exercises e
     where e.id = p_exercise_id
  ),
  u as (
    select ex.*,
           concat_ws(' ', ex.name, ex.french_term, ex.german_term, ex.aliases) as terms
      from ex
  )
  select
    concat_ws(' | ',
      u.name,
      nullif(concat_ws(' ', u.french_term, u.german_term, u.aliases), ''),
      p_error_name, p_correction, p_cue_phrase),
    setweight(to_tsvector('simple'::regconfig,
      extensions.unaccent('extensions.unaccent'::regdictionary, u.terms)), 'A')
    || setweight(to_tsvector('simple'::regconfig,
      extensions.unaccent('extensions.unaccent'::regdictionary, concat_ws(' ', p_error_name, p_cue_phrase))), 'B')
    || setweight(to_tsvector('english'::regconfig,
      extensions.unaccent('extensions.unaccent'::regdictionary,
        concat_ws(' ', p_error_name, p_correction, p_cue_phrase, p_description))), 'C')
  from u
$$;

create or replace function public.corrections_refresh_search()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  doc record;
begin
  select * into doc
    from public.correction_search_document(
      new.exercise_id, new.error_name, new.correction, new.cue_phrase, new.description);

  new.searchable_text := coalesce(doc.searchable_text, '');
  new.search_tsv := coalesce(doc.search_tsv, ''::tsvector);

  -- Retrieval text changed and the same statement did not supply a fresh vector:
  -- invalidate the embedding so Phase 2's backfill regenerates it.
  if tg_op = 'UPDATE'
     and new.searchable_text is distinct from old.searchable_text
     -- (search_path is empty, so the pgvector operator is schema-qualified)
     and coalesce(new.embedding operator(extensions.=) old.embedding,
                  new.embedding is null and old.embedding is null) then
    new.embedding := null;
    new.embedding_model := null;
  end if;

  return new;
end;
$$;

create trigger corrections_refresh_search
  before insert or update on public.corrections
  for each row execute function public.corrections_refresh_search();

create trigger corrections_set_updated_at
  before update on public.corrections
  for each row execute function public.set_updated_at();

-- Exercise terminology or aliases changed -> rebuild its corrections' search docs.
create or replace function public.touch_exercise_corrections()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Branch per table: PL/pgSQL resolves record fields eagerly, so never
  -- reference old.exercise_id inside an expression evaluated for `exercises`.
  if tg_table_name = 'exercises' then
    update public.corrections c
       set searchable_text = c.searchable_text   -- no-op write; BEFORE trigger recomputes
     where c.exercise_id = new.id;
    return null;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    update public.corrections c
       set searchable_text = c.searchable_text
     where c.exercise_id = old.exercise_id;
  end if;

  if tg_op = 'INSERT' then
    update public.corrections c
       set searchable_text = c.searchable_text
     where c.exercise_id = new.exercise_id;
  elsif tg_op = 'UPDATE' then
    if new.exercise_id is distinct from old.exercise_id then
      update public.corrections c
         set searchable_text = c.searchable_text
       where c.exercise_id = new.exercise_id;
    end if;
  end if;

  return null;
end;
$$;

create trigger exercises_touch_corrections
  after update of name, french_term, german_term on public.exercises
  for each row execute function public.touch_exercise_corrections();

create trigger exercise_aliases_touch_corrections
  after insert or update or delete on public.exercise_aliases
  for each row execute function public.touch_exercise_corrections();

-- ---------------------------------------------------------------------------
-- Security: Supabase exposes `public` via PostgREST. The browser never talks to
-- the DB directly — only the Fastify API does, with server-side credentials
-- (which bypass RLS). Enabling RLS with no policies closes the anon/auth path.
-- ---------------------------------------------------------------------------
alter table public.exercises        enable row level security;
alter table public.exercise_aliases enable row level security;
alter table public.corrections      enable row level security;
