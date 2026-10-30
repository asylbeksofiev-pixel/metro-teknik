-- EduSOR grading, results release, AI/OCR jobs, notifications, audit, storage.

create type public.job_status as enum (
  'uploaded', 'processing', 'extracting_text', 'generating_questions', 'review_required', 'completed', 'failed'
);
create type public.grading_job_status as enum ('queued', 'running', 'done', 'failed');
create type public.review_source as enum ('auto', 'ai_accepted', 'ai_edited', 'manual');

-- ---------------------------------------------------------------------------
-- Final grades and release
-- ---------------------------------------------------------------------------
create table public.final_grades (
  attempt_id uuid primary key references public.attempts (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  score numeric(8, 2) not null check (score >= 0),
  max_score numeric(8, 2) not null check (max_score > 0),
  percent numeric(5, 2) not null check (percent between 0 and 100),
  feedback text check (char_length(feedback) <= 5000),
  approved_by uuid not null references public.profiles (id) on delete restrict,
  approved_at timestamptz not null default now(),
  check (score <= max_score)
);
create index final_grades_assessment_idx on public.final_grades (assessment_id);
create index final_grades_student_idx on public.final_grades (student_id);

create table public.result_releases (
  attempt_id uuid primary key references public.attempts (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  released_by uuid references public.profiles (id) on delete set null,
  released_at timestamptz not null default now()
);
create index result_releases_assessment_idx on public.result_releases (assessment_id);

-- Append-only grade audit history.
create table public.teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers (id) on delete cascade,
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  source public.review_source not null,
  previous_points numeric(6, 2),
  points numeric(6, 2) not null,
  criterion_scores jsonb,
  feedback text,
  suggestion_id uuid,
  created_at timestamptz not null default now()
);
create index teacher_reviews_answer_idx on public.teacher_reviews (answer_id, created_at);

create or replace function public.is_released(p_attempt uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.result_releases r where r.attempt_id = p_attempt)
$$;

-- ---------------------------------------------------------------------------
-- AI grading
-- ---------------------------------------------------------------------------
create table public.grading_jobs (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  answer_id uuid not null references public.answers (id) on delete cascade,
  status public.grading_job_status not null default 'queued',
  tries smallint not null default 0,
  last_error text,
  locked_at timestamptz,
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index grading_jobs_queue_idx on public.grading_jobs (status, created_at);
create unique index grading_jobs_one_open on public.grading_jobs (answer_id) where status in ('queued', 'running');
create trigger grading_jobs_touch before update on public.grading_jobs for each row execute function public.touch_updated_at();

create table public.grading_suggestions (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers (id) on delete cascade,
  job_id uuid references public.grading_jobs (id) on delete set null,
  suggested_score numeric(6, 2) not null check (suggested_score >= 0),
  max_score numeric(6, 2) not null,
  explanation text not null,
  feedback text not null,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  needs_manual_review boolean not null,
  profile public.grading_profile not null,
  model text,
  created_at timestamptz not null default now(),
  check (suggested_score <= max_score)
);
create index grading_suggestions_answer_idx on public.grading_suggestions (answer_id, created_at desc);

create table public.criterion_scores (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.grading_suggestions (id) on delete cascade,
  criterion_id text not null,
  title text not null,
  score numeric(6, 2) not null check (score >= 0),
  max_score numeric(6, 2) not null,
  comment text,
  check (score <= max_score)
);
create index criterion_scores_suggestion_idx on public.criterion_scores (suggestion_id);

-- ---------------------------------------------------------------------------
-- OCR / document-to-assessment
-- ---------------------------------------------------------------------------
create table public.ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  assessment_id uuid references public.assessments (id) on delete set null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null check (mime_type in (
    'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'
  )),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  status public.job_status not null default 'uploaded',
  tries smallint not null default 0,
  last_error text,
  locked_at timestamptz,
  page_count integer,
  result jsonb,
  hints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ocr_jobs_queue_idx on public.ocr_jobs (status, created_at);
create index ocr_jobs_creator_idx on public.ocr_jobs (created_by, created_at desc);
create trigger ocr_jobs_touch before update on public.ocr_jobs for each row execute function public.touch_updated_at();

create table public.ocr_transcriptions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.ocr_jobs (id) on delete cascade,
  submission_file_id uuid references public.submission_files (id) on delete cascade,
  page integer not null default 1,
  method text not null check (method in ('pdf_text', 'docx', 'vision_ocr')),
  text text not null,
  uncertain boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  check ((job_id is null) <> (submission_file_id is null))
);
create index ocr_transcriptions_job_idx on public.ocr_transcriptions (job_id, page);
create index ocr_transcriptions_file_idx on public.ocr_transcriptions (submission_file_id);

-- ---------------------------------------------------------------------------
-- Student learning: explanations and practice
-- ---------------------------------------------------------------------------
create table public.ai_explanations (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  locale public.app_locale not null,
  messages jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (answer_id, locale)
);
create trigger ai_explanations_touch before update on public.ai_explanations for each row execute function public.touch_updated_at();

create table public.practice_questions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  source_answer_id uuid references public.answers (id) on delete set null,
  topic text,
  locale public.app_locale not null,
  type public.question_type not null,
  content jsonb not null,
  answer_key jsonb not null,
  explanation text,
  student_response jsonb,
  checked_result public.score_result,
  model text,
  created_at timestamptz not null default now()
);
create index practice_questions_student_idx on public.practice_questions (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- AI usage & system errors (platform level)
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  feature text not null,
  model text not null,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage (created_at desc);

create table public.system_errors (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index system_errors_created_idx on public.system_errors (created_at desc);

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_.]{2,80}$'),
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notifications and audit
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'assessment_assigned', 'deadline_soon', 'submission_received', 'review_needed',
    'assessment_graded', 'results_released', 'feedback_available', 'document_ready', 'document_failed'
  )),
  payload jsonb not null default '{}'::jsonb,
  link text check (link ~ '^/[A-Za-z0-9/_\-?=&%.]*$'),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_school_idx on public.audit_events (school_id, created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);

-- Rate-limit buckets for sensitive endpoints (written only by the server).
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.count + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end $$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Job claiming for the background runner (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.claim_ocr_job() returns public.ocr_jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job public.ocr_jobs;
begin
  select * into v_job from public.ocr_jobs
   where (status = 'uploaded' or (status in ('processing', 'extracting_text', 'generating_questions') and locked_at < now() - interval '10 minutes'))
     and tries < 3
   order by created_at
   limit 1
   for update skip locked;
  if not found then return null; end if;
  update public.ocr_jobs set status = 'processing', locked_at = now(), tries = tries + 1, last_error = null
   where id = v_job.id returning * into v_job;
  return v_job;
end $$;

create or replace function public.claim_grading_job() returns public.grading_jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job public.grading_jobs;
begin
  select * into v_job from public.grading_jobs
   where (status = 'queued' or (status = 'running' and locked_at < now() - interval '5 minutes'))
     and tries < 3
   order by created_at
   limit 1
   for update skip locked;
  if not found then return null; end if;
  update public.grading_jobs set status = 'running', locked_at = now(), tries = tries + 1
   where id = v_job.id returning * into v_job;
  return v_job;
end $$;
revoke execute on function public.claim_ocr_job() from public, anon, authenticated;
revoke execute on function public.claim_grading_job() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.final_grades enable row level security;
alter table public.result_releases enable row level security;
alter table public.teacher_reviews enable row level security;
alter table public.grading_jobs enable row level security;
alter table public.grading_suggestions enable row level security;
alter table public.criterion_scores enable row level security;
alter table public.ocr_jobs enable row level security;
alter table public.ocr_transcriptions enable row level security;
alter table public.ai_explanations enable row level security;
alter table public.practice_questions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.system_errors enable row level security;
alter table public.platform_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;
alter table public.rate_limits enable row level security;

-- Grades: managers read; students read their own only after release. All writes go through the server.
create policy final_grades_manage_select on public.final_grades for select to authenticated
  using (public.can_manage_assessment(assessment_id));
create policy final_grades_student_select on public.final_grades for select to authenticated
  using (student_id = auth.uid() and public.is_released(attempt_id));

create policy releases_manage_select on public.result_releases for select to authenticated
  using (public.can_manage_assessment(assessment_id));
create policy releases_student_select on public.result_releases for select to authenticated
  using (public.attempt_owner(attempt_id) = auth.uid());

create policy qscores_student_select on public.question_scores for select to authenticated
  using (public.attempt_owner(attempt_id) = auth.uid() and public.is_released(attempt_id));

-- Answer keys: revealed to a student only for released attempts, if the teacher allows it.
create policy snapshot_keys_student_select on public.assessment_snapshot_keys for select to authenticated
  using (
    reveal_after_release
    and exists (
      select 1 from public.attempts t
      join public.assessments a on a.id = t.assessment_id
      where t.snapshot_id = assessment_snapshot_keys.snapshot_id
        and t.student_id = auth.uid()
        and a.show_correct_answers
        and public.is_released(t.id)
    )
  );

create policy teacher_reviews_manage_select on public.teacher_reviews for select to authenticated
  using (public.can_manage_assessment(public.attempt_assessment(attempt_id)));

create policy grading_jobs_manage_select on public.grading_jobs for select to authenticated
  using (public.can_manage_assessment(public.attempt_assessment(attempt_id)));

create policy grading_suggestions_manage_select on public.grading_suggestions for select to authenticated
  using (public.can_manage_assessment(public.attempt_assessment((select attempt_id from public.answers where id = answer_id))));
create policy criterion_scores_manage_select on public.criterion_scores for select to authenticated
  using (exists (
    select 1 from public.grading_suggestions g join public.answers a on a.id = g.answer_id
    where g.id = suggestion_id and public.can_manage_assessment(public.attempt_assessment(a.attempt_id))
  ));

create policy ocr_jobs_select on public.ocr_jobs for select to authenticated
  using (created_by = auth.uid() or public.is_school_admin(school_id));
create policy ocr_jobs_insert on public.ocr_jobs for insert to authenticated
  with check (created_by = auth.uid() and public.is_school_staff(school_id) and status = 'uploaded');
create policy ocr_transcriptions_select on public.ocr_transcriptions for select to authenticated
  using (
    (job_id is not null and exists (select 1 from public.ocr_jobs j where j.id = job_id and (j.created_by = auth.uid() or public.is_school_admin(j.school_id))))
    or (submission_file_id is not null and exists (
      select 1 from public.submission_files f where f.id = submission_file_id
        and public.can_manage_assessment(public.attempt_assessment(f.attempt_id))
    ))
  );

create policy ai_explanations_student on public.ai_explanations for select to authenticated
  using (student_id = auth.uid());
create policy practice_student_select on public.practice_questions for select to authenticated
  using (student_id = auth.uid());

create policy ai_usage_super on public.ai_usage for select to authenticated using (public.is_super_admin());
create policy system_errors_super on public.system_errors for select to authenticated using (public.is_super_admin());
create policy platform_settings_super on public.platform_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy notifications_own_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy audit_select on public.audit_events for select to authenticated
  using (public.is_super_admin() or (school_id is not null and public.is_school_admin(school_id)));

-- ---------------------------------------------------------------------------
-- Storage: private buckets
-- Paths: assessment-documents/{school_id}/{user_id}/{uuid}.{ext}
--        submissions/{attempt_id}/{question_id}/{uuid}.{ext}
--        question-media/{school_id}/{uuid}.{ext}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('assessment-documents', 'assessment-documents', false, 20971520,
    array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png']),
  ('submissions', 'submissions', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('question-media', 'question-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy docs_read on storage.objects for select to authenticated
  using (bucket_id = 'assessment-documents' and (
    (storage.foldername(name))[2] = auth.uid()::text
    or public.is_school_admin(((storage.foldername(name))[1])::uuid)
  ));
create policy docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'assessment-documents'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_school_staff(((storage.foldername(name))[1])::uuid));

create policy submissions_read on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (
    public.attempt_owner(((storage.foldername(name))[1])::uuid) = auth.uid()
    or public.can_manage_assessment(public.attempt_assessment(((storage.foldername(name))[1])::uuid))
  ));

create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'question-media' and public.is_school_member(((storage.foldername(name))[1])::uuid));
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'question-media' and public.is_school_staff(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------
-- Realtime (live monitoring). RLS still applies to postgres_changes.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.attempts, public.lockdown_events, public.notifications;
  end if;
end $$;
