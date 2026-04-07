drop extension if exists "pg_net";

create schema if not exists "lane";

create extension if not exists "vector" with schema "public";

drop index if exists "public"."idx_audit_runs_status";

drop index if exists "public"."idx_findings_project_status_created_at";

drop index if exists "public"."idx_findings_run_id";

drop index if exists "public"."idx_repair_candidates_winner";

drop index if exists "public"."idx_repair_jobs_finding_id";

drop index if exists "public"."idx_repair_jobs_repair_job_id";

drop index if exists "public"."idx_repair_jobs_status_created_at";

alter table "public"."repair_jobs" alter column "status" drop default;

alter type "public"."penny_repair_status" rename to "penny_repair_status__old_version_to_be_dropped";

create type "public"."penny_repair_status" as enum ('queued', 'generating', 'evaluating', 'applied', 'failed');


  create table "public"."lane_embeddings" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid,
    "run_id" uuid,
    "user_id" uuid not null,
    "repository" text not null,
    "project_id" text not null,
    "source_path" text,
    "content_hash" text not null,
    "chunk_text" text not null,
    "embedding" public.vector(768) not null,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."lane_embeddings" enable row level security;


  create table "public"."lane_messages" (
    "id" uuid not null default gen_random_uuid(),
    "run_id" uuid not null,
    "session_id" uuid not null,
    "user_id" uuid not null,
    "agent_role" text not null,
    "message_id" text not null,
    "message_kind" text not null,
    "label" text not null,
    "content" text not null,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."lane_messages" enable row level security;


  create table "public"."lane_runs" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "user_id" uuid not null,
    "task_id" text not null,
    "project_id" text not null,
    "repository" text not null,
    "status" text not null,
    "requested_by" uuid not null,
    "execution_flow" jsonb not null default '[]'::jsonb,
    "agents" jsonb not null default '[]'::jsonb,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."lane_runs" enable row level security;


  create table "public"."lane_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "external_app" text not null default 'penny'::text,
    "repository" text not null,
    "project_id" text not null,
    "title" text,
    "status" text not null default 'active'::text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."lane_sessions" enable row level security;

alter table "public"."repair_jobs" alter column status type "public"."penny_repair_status" using status::text::"public"."penny_repair_status";

alter table "public"."repair_jobs" alter column "status" set default 'queued'::public.penny_repair_status;

drop type "public"."penny_repair_status__old_version_to_be_dropped";

alter table "public"."repair_jobs" drop column "progress";

alter table "public"."repair_jobs" drop column "repair_job_id";

CREATE INDEX lane_embeddings_lookup_idx ON public.lane_embeddings USING btree (user_id, repository, project_id);

CREATE UNIQUE INDEX lane_embeddings_pkey ON public.lane_embeddings USING btree (id);

CREATE UNIQUE INDEX lane_embeddings_user_id_repository_project_id_content_hash_key ON public.lane_embeddings USING btree (user_id, repository, project_id, content_hash);

CREATE INDEX lane_embeddings_vector_idx ON public.lane_embeddings USING hnsw (embedding public.vector_cosine_ops);

CREATE UNIQUE INDEX lane_messages_pkey ON public.lane_messages USING btree (id);

CREATE INDEX lane_messages_run_idx ON public.lane_messages USING btree (run_id, created_at);

CREATE INDEX lane_messages_session_idx ON public.lane_messages USING btree (session_id, created_at);

CREATE UNIQUE INDEX lane_runs_pkey ON public.lane_runs USING btree (id);

CREATE INDEX lane_runs_session_idx ON public.lane_runs USING btree (session_id, created_at DESC);

CREATE UNIQUE INDEX lane_runs_task_id_key ON public.lane_runs USING btree (task_id);

CREATE INDEX lane_runs_user_idx ON public.lane_runs USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX lane_sessions_pkey ON public.lane_sessions USING btree (id);

CREATE UNIQUE INDEX lane_sessions_user_id_repository_project_id_key ON public.lane_sessions USING btree (user_id, repository, project_id);

CREATE INDEX lane_sessions_user_idx ON public.lane_sessions USING btree (user_id, updated_at DESC);

CREATE INDEX penny_orchestration_events_created_at_idx ON public.penny_orchestration_events USING btree (created_at DESC);

alter table "public"."lane_embeddings" add constraint "lane_embeddings_pkey" PRIMARY KEY using index "lane_embeddings_pkey";

alter table "public"."lane_messages" add constraint "lane_messages_pkey" PRIMARY KEY using index "lane_messages_pkey";

alter table "public"."lane_runs" add constraint "lane_runs_pkey" PRIMARY KEY using index "lane_runs_pkey";

alter table "public"."lane_sessions" add constraint "lane_sessions_pkey" PRIMARY KEY using index "lane_sessions_pkey";

alter table "public"."lane_embeddings" add constraint "lane_embeddings_run_id_fkey" FOREIGN KEY (run_id) REFERENCES public.lane_runs(id) ON DELETE CASCADE not valid;

alter table "public"."lane_embeddings" validate constraint "lane_embeddings_run_id_fkey";

alter table "public"."lane_embeddings" add constraint "lane_embeddings_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.lane_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."lane_embeddings" validate constraint "lane_embeddings_session_id_fkey";

alter table "public"."lane_embeddings" add constraint "lane_embeddings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."lane_embeddings" validate constraint "lane_embeddings_user_id_fkey";

alter table "public"."lane_embeddings" add constraint "lane_embeddings_user_id_repository_project_id_content_hash_key" UNIQUE using index "lane_embeddings_user_id_repository_project_id_content_hash_key";

alter table "public"."lane_messages" add constraint "lane_messages_run_id_fkey" FOREIGN KEY (run_id) REFERENCES public.lane_runs(id) ON DELETE CASCADE not valid;

alter table "public"."lane_messages" validate constraint "lane_messages_run_id_fkey";

alter table "public"."lane_messages" add constraint "lane_messages_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.lane_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."lane_messages" validate constraint "lane_messages_session_id_fkey";

alter table "public"."lane_messages" add constraint "lane_messages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."lane_messages" validate constraint "lane_messages_user_id_fkey";

alter table "public"."lane_runs" add constraint "lane_runs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."lane_runs" validate constraint "lane_runs_requested_by_fkey";

alter table "public"."lane_runs" add constraint "lane_runs_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.lane_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."lane_runs" validate constraint "lane_runs_session_id_fkey";

alter table "public"."lane_runs" add constraint "lane_runs_task_id_key" UNIQUE using index "lane_runs_task_id_key";

alter table "public"."lane_runs" add constraint "lane_runs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."lane_runs" validate constraint "lane_runs_user_id_fkey";

alter table "public"."lane_sessions" add constraint "lane_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."lane_sessions" validate constraint "lane_sessions_user_id_fkey";

alter table "public"."lane_sessions" add constraint "lane_sessions_user_id_repository_project_id_key" UNIQUE using index "lane_sessions_user_id_repository_project_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.match_lane_embeddings(filter_user_id uuid, filter_repository text, filter_project_id text, query_embedding public.vector, match_count integer DEFAULT 8)
 RETURNS TABLE(id uuid, session_id uuid, run_id uuid, user_id uuid, repository text, project_id text, source_path text, content_hash text, chunk_text text, metadata jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  select
    lane_embeddings.id,
    lane_embeddings.session_id,
    lane_embeddings.run_id,
    lane_embeddings.user_id,
    lane_embeddings.repository,
    lane_embeddings.project_id,
    lane_embeddings.source_path,
    lane_embeddings.content_hash,
    lane_embeddings.chunk_text,
    lane_embeddings.metadata,
    1 - (lane_embeddings.embedding <=> query_embedding) as similarity
  from public.lane_embeddings
  where lane_embeddings.user_id = filter_user_id
    and lane_embeddings.repository = filter_repository
    and lane_embeddings.project_id = filter_project_id
  order by lane_embeddings.embedding <=> query_embedding
  limit match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.set_lane_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$
;

grant delete on table "public"."lane_embeddings" to "anon";

grant insert on table "public"."lane_embeddings" to "anon";

grant references on table "public"."lane_embeddings" to "anon";

grant select on table "public"."lane_embeddings" to "anon";

grant trigger on table "public"."lane_embeddings" to "anon";

grant truncate on table "public"."lane_embeddings" to "anon";

grant update on table "public"."lane_embeddings" to "anon";

grant delete on table "public"."lane_embeddings" to "authenticated";

grant insert on table "public"."lane_embeddings" to "authenticated";

grant references on table "public"."lane_embeddings" to "authenticated";

grant select on table "public"."lane_embeddings" to "authenticated";

grant trigger on table "public"."lane_embeddings" to "authenticated";

grant truncate on table "public"."lane_embeddings" to "authenticated";

grant update on table "public"."lane_embeddings" to "authenticated";

grant delete on table "public"."lane_embeddings" to "service_role";

grant insert on table "public"."lane_embeddings" to "service_role";

grant references on table "public"."lane_embeddings" to "service_role";

grant select on table "public"."lane_embeddings" to "service_role";

grant trigger on table "public"."lane_embeddings" to "service_role";

grant truncate on table "public"."lane_embeddings" to "service_role";

grant update on table "public"."lane_embeddings" to "service_role";

grant delete on table "public"."lane_messages" to "anon";

grant insert on table "public"."lane_messages" to "anon";

grant references on table "public"."lane_messages" to "anon";

grant select on table "public"."lane_messages" to "anon";

grant trigger on table "public"."lane_messages" to "anon";

grant truncate on table "public"."lane_messages" to "anon";

grant update on table "public"."lane_messages" to "anon";

grant delete on table "public"."lane_messages" to "authenticated";

grant insert on table "public"."lane_messages" to "authenticated";

grant references on table "public"."lane_messages" to "authenticated";

grant select on table "public"."lane_messages" to "authenticated";

grant trigger on table "public"."lane_messages" to "authenticated";

grant truncate on table "public"."lane_messages" to "authenticated";

grant update on table "public"."lane_messages" to "authenticated";

grant delete on table "public"."lane_messages" to "service_role";

grant insert on table "public"."lane_messages" to "service_role";

grant references on table "public"."lane_messages" to "service_role";

grant select on table "public"."lane_messages" to "service_role";

grant trigger on table "public"."lane_messages" to "service_role";

grant truncate on table "public"."lane_messages" to "service_role";

grant update on table "public"."lane_messages" to "service_role";

grant delete on table "public"."lane_runs" to "anon";

grant insert on table "public"."lane_runs" to "anon";

grant references on table "public"."lane_runs" to "anon";

grant select on table "public"."lane_runs" to "anon";

grant trigger on table "public"."lane_runs" to "anon";

grant truncate on table "public"."lane_runs" to "anon";

grant update on table "public"."lane_runs" to "anon";

grant delete on table "public"."lane_runs" to "authenticated";

grant insert on table "public"."lane_runs" to "authenticated";

grant references on table "public"."lane_runs" to "authenticated";

grant select on table "public"."lane_runs" to "authenticated";

grant trigger on table "public"."lane_runs" to "authenticated";

grant truncate on table "public"."lane_runs" to "authenticated";

grant update on table "public"."lane_runs" to "authenticated";

grant delete on table "public"."lane_runs" to "service_role";

grant insert on table "public"."lane_runs" to "service_role";

grant references on table "public"."lane_runs" to "service_role";

grant select on table "public"."lane_runs" to "service_role";

grant trigger on table "public"."lane_runs" to "service_role";

grant truncate on table "public"."lane_runs" to "service_role";

grant update on table "public"."lane_runs" to "service_role";

grant delete on table "public"."lane_sessions" to "anon";

grant insert on table "public"."lane_sessions" to "anon";

grant references on table "public"."lane_sessions" to "anon";

grant select on table "public"."lane_sessions" to "anon";

grant trigger on table "public"."lane_sessions" to "anon";

grant truncate on table "public"."lane_sessions" to "anon";

grant update on table "public"."lane_sessions" to "anon";

grant delete on table "public"."lane_sessions" to "authenticated";

grant insert on table "public"."lane_sessions" to "authenticated";

grant references on table "public"."lane_sessions" to "authenticated";

grant select on table "public"."lane_sessions" to "authenticated";

grant trigger on table "public"."lane_sessions" to "authenticated";

grant truncate on table "public"."lane_sessions" to "authenticated";

grant update on table "public"."lane_sessions" to "authenticated";

grant delete on table "public"."lane_sessions" to "service_role";

grant insert on table "public"."lane_sessions" to "service_role";

grant references on table "public"."lane_sessions" to "service_role";

grant select on table "public"."lane_sessions" to "service_role";

grant trigger on table "public"."lane_sessions" to "service_role";

grant truncate on table "public"."lane_sessions" to "service_role";

grant update on table "public"."lane_sessions" to "service_role";

grant insert on table "public"."repair_jobs" to "anon";

grant select on table "public"."repair_jobs" to "anon";

grant update on table "public"."repair_jobs" to "anon";


  create policy "lane_embeddings_owner_access"
  on "public"."lane_embeddings"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "lane_messages_owner_access"
  on "public"."lane_messages"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "lane_runs_owner_access"
  on "public"."lane_runs"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "lane_sessions_owner_access"
  on "public"."lane_sessions"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));


CREATE TRIGGER set_lane_runs_updated_at BEFORE UPDATE ON public.lane_runs FOR EACH ROW EXECUTE FUNCTION public.set_lane_updated_at();

CREATE TRIGGER set_lane_sessions_updated_at BEFORE UPDATE ON public.lane_sessions FOR EACH ROW EXECUTE FUNCTION public.set_lane_updated_at();


