-- EduSOR assessment engine: question bank, builder, snapshots, attempts, answers.
--
-- Security model:
--   * Student-visible question content and secret answer keys live in different tables.
--   * Students never read assessment_questions / question_bank_items (they contain keys).
--   * Students read the published snapshot (no keys) for assessments assigned to them.
--   * Scores live in question_scores / final_grades, readable by students only after release.

create type public.question_type as enum (
  'single_choice', 'multiple_choice', 'true_false', 'short_text', 'numeric',
  'matching', 'ordering', 'fill_blanks', 'essay', 'file_upload', 'image_answer'
);
create type public.difficulty as enum ('easy', 'medium', 'hard');
create type public.assessment_kind as enum ('sor', 'soch');
create type public.assessment_status as enum ('draft', 'published', 'closed', 'archived');
create type public.release_mode as enum ('manual', 'on_approval');
create type public.grading_profile as enum ('strict', 'balanced', 'supportive');
create type public.attempt_status as enum ('in_progress', 'submitted');
create type public.submit_reason as enum ('manual', 'timeout', 'teacher');
create type public.grading_status as enum ('pending', 'needs_review', 'graded');
create type public.score_result as enum ('correct', 'incorrect', 'partial', 'unanswered', 'pending');

-- ---------------------------------------------------------------------------
-- Question bank
-- ---------------------------------------------------------------------------
create table public.question_bank_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  grade smallint check (grade between 0 and 12),
  topic text check (char_length(topic) <= 200),
  learning_objective text check (char_length(learning_objective) <= 300),
  difficulty public.difficulty not null default 'medium',
  type public.question_type not null,
  content jsonb not null,
  answer_key jsonb not null default '{}'::jsonb,
  rubric jsonb,
  explanation text check (char_length(explanation) <= 5000),
  points numeric(6, 2) not null default 1 check (points > 0 and points <= 100),
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index qbank_school_idx on public.question_bank_items (school_id, subject_id, grade);
create index qbank_owner_idx on public.question_bank_items (owner_id);
create trigger qbank_touch before update on public.question_bank_items for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Assessments
-- ---------------------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 2 and 200),
  kind public.assessment_kind not null default 'sor',
  subject_id uuid references public.subjects (id) on delete set null,
  grade smallint check (grade between 0 and 12),
  class_id uuid references public.classes (id) on delete set null,
  status public.assessment_status not null default 'draft',
  instructions text check (char_length(instructions) <= 5000),
  starts_at timestamptz,
  due_at timestamptz,
  duration_minutes integer check (duration_minutes between 1 and 600),
  max_attempts smallint not null default 1 check (max_attempts between 1 and 10),
  shuffle_questions boolean not null default false,
  shuffle_options boolean not null default false,
  allow_navigation boolean not null default true,
  lockdown_mode boolean not null default false,
  release_mode public.release_mode not null default 'manual',
  show_correct_answers boolean not null default true,
  allow_ai_explanations boolean not null default true,
  allow_ai_followup boolean not null default true,
  allow_practice boolean not null default true,
  grading_profile public.grading_profile not null default 'balanced',
  current_snapshot_id uuid,
  source_job_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_at is null or starts_at is null or due_at > starts_at)
);
create index assessments_school_idx on public.assessments (school_id, status);
create index assessments_class_idx on public.assessments (class_id);
create index assessments_creator_idx on public.assessments (created_by);
create trigger assessments_touch before update on public.assessments for each row execute function public.touch_updated_at();

create table public.assessment_sections (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  instructions text check (char_length(instructions) <= 2000),
  position integer not null default 0
);
create index sections_assessment_idx on public.assessment_sections (assessment_id, position);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  section_id uuid references public.assessment_sections (id) on delete set null,
  bank_item_id uuid references public.question_bank_items (id) on delete set null,
  position integer not null default 0,
  type public.question_type not null,
  content jsonb not null,
  answer_key jsonb not null default '{}'::jsonb,
  rubric jsonb,
  explanation text check (char_length(explanation) <= 5000),
  points numeric(6, 2) not null default 1 check (points > 0 and points <= 100),
  topic text check (char_length(topic) <= 200),
  learning_objective text check (char_length(learning_objective) <= 300),
  reveal_after_release boolean not null default true,
  ai_generated boolean not null default false,
  ai_uncertain boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index aq_assessment_idx on public.assessment_questions (assessment_id, position);
create trigger aq_touch before update on public.assessment_questions for each row execute function public.touch_updated_at();

create table public.assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  class_id uuid references public.classes (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((class_id is null) <> (student_id is null))
);
create unique index assignments_class_unique on public.assessment_assignments (assessment_id, class_id) where class_id is not null;
create unique index assignments_student_unique on public.assessment_assignments (assessment_id, student_id) where student_id is not null;
create index assignments_class_idx on public.assessment_assignments (class_id);
create index assignments_student_idx on public.assessment_assignments (student_id);

-- Immutable published versions. `questions` is student-safe (no keys).
create table public.assessment_snapshots (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  version integer not null,
  title text not null,
  instructions text,
  sections jsonb not null default '[]'::jsonb,
  questions jsonb not null,
  total_points numeric(8, 2) not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (assessment_id, version)
);
alter table public.assessments
  add constraint assessments_snapshot_fk foreign key (current_snapshot_id)
  references public.assessment_snapshots (id) on delete set null;

-- Secret part of a snapshot, one row per question.
create table public.assessment_snapshot_keys (
  snapshot_id uuid not null references public.assessment_snapshots (id) on delete cascade,
  question_id uuid not null,
  type public.question_type not null,
  points numeric(6, 2) not null,
  answer_key jsonb not null,
  rubric jsonb,
  explanation text,
  reveal_after_release boolean not null default true,
  primary key (snapshot_id, question_id)
);

create or replace function public.prevent_snapshot_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'snapshots_are_immutable' using errcode = '42501';
end $$;
create trigger snapshots_immutable before update on public.assessment_snapshots
  for each row execute function public.prevent_snapshot_mutation();
create trigger snapshot_keys_immutable before update on public.assessment_snapshot_keys
  for each row execute function public.prevent_snapshot_mutation();

create table public.student_accommodations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  assessment_id uuid references public.assessments (id) on delete cascade,
  extra_minutes integer not null default 0 check (extra_minutes between 0 and 600),
  extra_attempts smallint not null default 0 check (extra_attempts between 0 and 5),
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index accommodations_student_idx on public.student_accommodations (student_id);

-- ---------------------------------------------------------------------------
-- Attempts and answers
-- ---------------------------------------------------------------------------
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  snapshot_id uuid not null references public.assessment_snapshots (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete cascade,
  attempt_no smallint not null,
  status public.attempt_status not null default 'in_progress',
  grading_status public.grading_status not null default 'pending',
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  submitted_at timestamptz,
  submit_reason public.submit_reason,
  question_order uuid[] not null,
  option_orders jsonb not null default '{}'::jsonb,
  current_question_id uuid,
  answered_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  lockdown_event_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (assessment_id, student_id, attempt_no)
);
create unique index attempts_one_active on public.attempts (assessment_id, student_id) where status = 'in_progress';
create index attempts_assessment_idx on public.attempts (assessment_id, status);
create index attempts_student_idx on public.attempts (student_id);
create index attempts_deadline_idx on public.attempts (deadline_at) where status = 'in_progress';

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id uuid not null,
  response jsonb not null default '{}'::jsonb,
  client_seq bigint not null default 0,
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id uuid not null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index submission_files_attempt_idx on public.submission_files (attempt_id, question_id);

-- Per-question scoring (hidden from students until release).
create table public.question_scores (
  answer_id uuid primary key references public.answers (id) on delete cascade,
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id uuid not null,
  max_points numeric(6, 2) not null,
  auto_points numeric(6, 2),
  auto_result public.score_result not null default 'pending',
  final_points numeric(6, 2),
  final_result public.score_result,
  needs_review boolean not null default false,
  teacher_feedback text check (char_length(teacher_feedback) <= 5000),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (auto_points is null or (auto_points >= 0 and auto_points <= max_points)),
  check (final_points is null or (final_points >= 0 and final_points <= max_points))
);
create index question_scores_attempt_idx on public.question_scores (attempt_id);

create table public.lockdown_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in (
    'fullscreen_exit', 'fullscreen_enter', 'visibility_hidden', 'visibility_visible',
    'window_blur', 'window_focus', 'copy_blocked', 'paste_blocked', 'cut_blocked',
    'context_menu_blocked', 'print_blocked', 'devtools_shortcut', 'connection_lost', 'connection_restored'
  )),
  occurred_at timestamptz not null default now(),
  client_time timestamptz,
  duration_ms integer check (duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb
);
create index lockdown_events_attempt_idx on public.lockdown_events (attempt_id, occurred_at);
create index lockdown_events_assessment_idx on public.lockdown_events (assessment_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Teacher of this class for this subject (a class-wide assignment without subject counts for all subjects).
create or replace function public.teaches_class_subject(p_class uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_teachers ct
    where ct.class_id = p_class and ct.teacher_id = auth.uid()
      and (ct.subject_id is null or p_subject is null or ct.subject_id = p_subject)
  )
$$;

create or replace function public.can_manage_assessment(p_assessment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment and (
      a.created_by = auth.uid()
      or public.is_school_admin(a.school_id)
      or (a.class_id is not null and public.teaches_class_subject(a.class_id, a.subject_id) and public.is_school_staff(a.school_id))
    )
  )
$$;

create or replace function public.is_assigned(p_assessment uuid, p_student uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assessment_assignments aa
    where aa.assessment_id = p_assessment and (
      aa.student_id = p_student
      or exists (select 1 from public.class_enrollments ce where ce.class_id = aa.class_id and ce.student_id = p_student)
    )
  )
$$;

create or replace function public.attempt_owner(p_attempt uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select student_id from public.attempts where id = p_attempt
$$;

create or replace function public.attempt_assessment(p_attempt uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select assessment_id from public.attempts where id = p_attempt
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.question_bank_items enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_sections enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_assignments enable row level security;
alter table public.assessment_snapshots enable row level security;
alter table public.assessment_snapshot_keys enable row level security;
alter table public.student_accommodations enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;
alter table public.submission_files enable row level security;
alter table public.question_scores enable row level security;
alter table public.lockdown_events enable row level security;

-- Question bank: owner, or shared within school staff.
create policy qbank_select on public.question_bank_items for select to authenticated
  using (owner_id = auth.uid() or (is_shared and public.is_school_staff(school_id)) or public.is_school_admin(school_id));
create policy qbank_insert on public.question_bank_items for insert to authenticated
  with check (owner_id = auth.uid() and public.is_school_staff(school_id));
create policy qbank_update on public.question_bank_items for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.is_school_staff(school_id));
create policy qbank_delete on public.question_bank_items for delete to authenticated
  using (owner_id = auth.uid() or public.is_school_admin(school_id));

-- Assessments: managers full access; assigned students read published ones.
-- Evaluated on the row's own columns (not via can_manage_assessment(id)) so that
-- INSERT ... RETURNING works: a lookup by id cannot see the row being inserted.
create policy assessments_staff_select on public.assessments for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_school_admin(school_id)
    or (class_id is not null and public.teaches_class_subject(class_id, subject_id) and public.is_school_staff(school_id))
  );
create policy assessments_student_select on public.assessments for select to authenticated
  using (status in ('published', 'closed') and public.is_assigned(id));
create policy assessments_insert on public.assessments for insert to authenticated
  with check (created_by = auth.uid() and public.is_school_staff(school_id)
    and (class_id is null or public.teaches_class_subject(class_id, subject_id) or public.is_school_admin(school_id)));
create policy assessments_update on public.assessments for update to authenticated
  using (
    created_by = auth.uid()
    or public.is_school_admin(school_id)
    or (class_id is not null and public.teaches_class_subject(class_id, subject_id) and public.is_school_staff(school_id))
  )
  with check (public.is_school_staff(school_id)
    and (class_id is null or public.teaches_class_subject(class_id, subject_id) or public.is_school_admin(school_id)));
create policy assessments_delete on public.assessments for delete to authenticated
  using (status = 'draft' and (created_by = auth.uid() or public.is_school_admin(school_id)));

-- Builder tables: managers only (contain answer keys).
create policy sections_manage on public.assessment_sections for all to authenticated
  using (public.can_manage_assessment(assessment_id)) with check (public.can_manage_assessment(assessment_id));
create policy aq_manage on public.assessment_questions for all to authenticated
  using (public.can_manage_assessment(assessment_id)) with check (public.can_manage_assessment(assessment_id));

create policy assignments_manage on public.assessment_assignments for all to authenticated
  using (public.can_manage_assessment(assessment_id))
  with check (public.can_manage_assessment(assessment_id)
    and (class_id is null or public.class_school(class_id) = (select school_id from public.assessments where id = assessment_id))
    and (student_id is null or public.has_school_role_for(student_id, (select school_id from public.assessments where id = assessment_id), 'student')));
create policy assignments_student_select on public.assessment_assignments for select to authenticated
  using (student_id = auth.uid() or (class_id is not null and public.is_enrolled(class_id)));

-- Snapshots: managers; students read the snapshot they are attempting or assigned (no keys inside).
create policy snapshots_manage_select on public.assessment_snapshots for select to authenticated
  using (public.can_manage_assessment(assessment_id));
create policy snapshots_student_select on public.assessment_snapshots for select to authenticated
  using (public.is_assigned(assessment_id) and exists (
    select 1 from public.assessments a where a.id = assessment_id and a.status in ('published', 'closed')
  ));
-- Inserts happen only inside publish_assessment().

-- Keys: managers; students only for released attempts on that snapshot when the teacher allows it.
create policy snapshot_keys_manage_select on public.assessment_snapshot_keys for select to authenticated
  using (public.can_manage_assessment((select assessment_id from public.assessment_snapshots s where s.id = snapshot_id)));

create policy accommodations_student_select on public.student_accommodations for select to authenticated
  using (student_id = auth.uid());
create policy accommodations_manage on public.student_accommodations for all to authenticated
  using (public.is_school_staff(school_id) and public.can_view_student(student_id))
  with check (public.is_school_staff(school_id) and public.can_view_student(student_id));

-- Attempts: student sees own; managers see all for their assessments. Writes only via RPC.
create policy attempts_student_select on public.attempts for select to authenticated
  using (student_id = auth.uid());
create policy attempts_manage_select on public.attempts for select to authenticated
  using (public.can_manage_assessment(assessment_id));

create policy answers_student_select on public.answers for select to authenticated
  using (public.attempt_owner(attempt_id) = auth.uid());
create policy answers_manage_select on public.answers for select to authenticated
  using (public.can_manage_assessment(public.attempt_assessment(attempt_id)));

create policy files_student_select on public.submission_files for select to authenticated
  using (public.attempt_owner(attempt_id) = auth.uid());
create policy files_manage_select on public.submission_files for select to authenticated
  using (public.can_manage_assessment(public.attempt_assessment(attempt_id)));

create policy qscores_manage_select on public.question_scores for select to authenticated
  using (public.can_manage_assessment(public.attempt_assessment(attempt_id)));

create policy lockdown_student_insert on public.lockdown_events for insert to authenticated
  with check (student_id = auth.uid() and exists (
    select 1 from public.attempts t
    where t.id = attempt_id and t.student_id = auth.uid() and t.status = 'in_progress' and t.assessment_id = lockdown_events.assessment_id
  ));
create policy lockdown_manage_select on public.lockdown_events for select to authenticated
  using (public.can_manage_assessment(assessment_id));

create or replace function public.bump_lockdown_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.event_type not in ('fullscreen_enter', 'visibility_visible', 'window_focus', 'connection_restored') then
    update public.attempts set lockdown_event_count = lockdown_event_count + 1 where id = new.attempt_id;
  end if;
  new.occurred_at := now();
  return new;
end $$;
create trigger lockdown_events_count before insert on public.lockdown_events
  for each row execute function public.bump_lockdown_count();

-- ---------------------------------------------------------------------------
-- Publishing: copies the builder state into an immutable snapshot.
-- ---------------------------------------------------------------------------
create or replace function public.publish_assessment(p_assessment uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_a public.assessments;
  v_snapshot uuid;
  v_version integer;
  v_total numeric;
  v_count integer;
begin
  select * into v_a from public.assessments where id = p_assessment for update;
  if not found then raise exception 'assessment_not_found' using errcode = 'P0002'; end if;
  if not public.can_manage_assessment(p_assessment) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_a.status = 'archived' then raise exception 'assessment_archived' using errcode = 'P0001'; end if;

  select count(*), coalesce(sum(points), 0) into v_count, v_total
    from public.assessment_questions where assessment_id = p_assessment;
  if v_count = 0 then raise exception 'no_questions' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.assessment_assignments where assessment_id = p_assessment) then
    raise exception 'no_assignees' using errcode = 'P0001';
  end if;
  if v_a.due_at is not null and v_a.due_at <= now() then
    raise exception 'due_in_past' using errcode = 'P0001';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from public.assessment_snapshots where assessment_id = p_assessment;

  insert into public.assessment_snapshots (assessment_id, version, title, instructions, sections, questions, total_points, created_by)
  values (
    p_assessment, v_version, v_a.title, v_a.instructions,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'instructions', s.instructions, 'position', s.position) order by s.position)
      from public.assessment_sections s where s.assessment_id = p_assessment
    ), '[]'::jsonb),
    (
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'sectionId', q.section_id, 'position', q.position, 'type', q.type,
        'content', q.content, 'points', q.points, 'topic', q.topic, 'learningObjective', q.learning_objective
      ) order by s.position nulls first, q.position)
      from public.assessment_questions q
      left join public.assessment_sections s on s.id = q.section_id
      where q.assessment_id = p_assessment
    ),
    v_total, auth.uid()
  ) returning id into v_snapshot;

  insert into public.assessment_snapshot_keys (snapshot_id, question_id, type, points, answer_key, rubric, explanation, reveal_after_release)
  select v_snapshot, q.id, q.type, q.points, q.answer_key, q.rubric, q.explanation, q.reveal_after_release
  from public.assessment_questions q where q.assessment_id = p_assessment;

  update public.assessments
     set status = 'published', current_snapshot_id = v_snapshot, published_at = coalesce(published_at, now())
   where id = p_assessment;

  return v_snapshot;
end $$;

-- ---------------------------------------------------------------------------
-- Attempt lifecycle (server-authoritative timing)
-- ---------------------------------------------------------------------------
create or replace function public.shuffle_jsonb_ids(p_items jsonb) returns jsonb
language sql volatile as $$
  select coalesce(jsonb_agg(e -> 'id' order by random()), '[]'::jsonb) from jsonb_array_elements(p_items) e
$$;

create or replace function public.start_attempt(p_assessment uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_a public.assessments;
  v_snap public.assessment_snapshots;
  v_existing public.attempts;
  v_used integer;
  v_extra_minutes integer := 0;
  v_extra_attempts integer := 0;
  v_deadline timestamptz;
  v_order uuid[];
  v_option_orders jsonb := '{}'::jsonb;
  v_q jsonb;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_a from public.assessments where id = p_assessment;
  if not found or not public.is_assigned(p_assessment) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_a.status <> 'published' then raise exception 'not_available' using errcode = 'P0001'; end if;

  -- Serialize concurrent starts for the same student/assessment.
  perform pg_advisory_xact_lock(hashtextextended(p_assessment::text || auth.uid()::text, 0));

  select * into v_existing from public.attempts
   where assessment_id = p_assessment and student_id = auth.uid() and status = 'in_progress';
  if found then
    if v_existing.deadline_at is not null and v_existing.deadline_at <= now() then
      perform public.finalize_attempt(v_existing.id, 'timeout');
    else
      return v_existing.id;
    end if;
  end if;

  if v_a.starts_at is not null and now() < v_a.starts_at then raise exception 'not_started' using errcode = 'P0001'; end if;
  if v_a.due_at is not null and now() >= v_a.due_at then raise exception 'expired' using errcode = 'P0001'; end if;

  select coalesce(sum(extra_minutes), 0), coalesce(sum(extra_attempts), 0)
    into v_extra_minutes, v_extra_attempts
    from public.student_accommodations
   where student_id = auth.uid() and school_id = v_a.school_id
     and (assessment_id is null or assessment_id = p_assessment);

  select count(*) into v_used from public.attempts where assessment_id = p_assessment and student_id = auth.uid();
  if v_used >= v_a.max_attempts + v_extra_attempts then raise exception 'no_attempts_left' using errcode = 'P0001'; end if;

  select * into v_snap from public.assessment_snapshots where id = v_a.current_snapshot_id;

  if v_a.duration_minutes is not null then
    v_deadline := now() + make_interval(mins => v_a.duration_minutes + v_extra_minutes);
  end if;
  if v_a.due_at is not null then
    v_deadline := least(coalesce(v_deadline, v_a.due_at), v_a.due_at + make_interval(mins => v_extra_minutes));
  end if;

  if v_a.shuffle_questions then
    select array_agg((q ->> 'id')::uuid order by random()) into v_order from jsonb_array_elements(v_snap.questions) q;
  else
    select array_agg((q ->> 'id')::uuid order by ord) into v_order from jsonb_array_elements(v_snap.questions) with ordinality as t(q, ord);
  end if;

  for v_q in select * from jsonb_array_elements(v_snap.questions) loop
    if v_q ->> 'type' in ('single_choice', 'multiple_choice') and v_a.shuffle_options then
      v_option_orders := v_option_orders || jsonb_build_object(v_q ->> 'id', public.shuffle_jsonb_ids(v_q -> 'content' -> 'options'));
    elsif v_q ->> 'type' = 'ordering' then
      -- Ordering items are always presented shuffled; otherwise the answer is visible.
      v_option_orders := v_option_orders || jsonb_build_object(v_q ->> 'id', public.shuffle_jsonb_ids(v_q -> 'content' -> 'items'));
    elsif v_q ->> 'type' = 'matching' then
      v_option_orders := v_option_orders || jsonb_build_object(v_q ->> 'id', public.shuffle_jsonb_ids(v_q -> 'content' -> 'right'));
    end if;
  end loop;

  insert into public.attempts (assessment_id, snapshot_id, student_id, attempt_no, deadline_at, question_order, option_orders, current_question_id)
  values (p_assessment, v_snap.id, auth.uid(), v_used + 1, v_deadline, v_order, v_option_orders, v_order[1])
  returning id into v_id;
  return v_id;
end $$;

-- Locks an attempt. Idempotent. Callable by the owner (manual/timeout) and by managers (teacher).
create or replace function public.finalize_attempt(p_attempt uuid, p_reason public.submit_reason) returns public.attempts
language plpgsql security definer set search_path = public as $$
declare
  v_t public.attempts;
begin
  select * into v_t from public.attempts where id = p_attempt for update;
  if not found then raise exception 'attempt_not_found' using errcode = 'P0002'; end if;
  if auth.uid() is not null
     and v_t.student_id <> auth.uid()
     and not public.can_manage_assessment(v_t.assessment_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_t.status = 'submitted' then return v_t; end if;
  if p_reason = 'teacher' and (auth.uid() is null or not public.can_manage_assessment(v_t.assessment_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason = 'timeout' and (v_t.deadline_at is null or v_t.deadline_at > now()) then
    raise exception 'not_expired' using errcode = 'P0001';
  end if;
  update public.attempts
     set status = 'submitted',
         submitted_at = case when p_reason = 'timeout' then least(now(), v_t.deadline_at) else now() end,
         submit_reason = p_reason
   where id = p_attempt
   returning * into v_t;
  return v_t;
end $$;

create or replace function public.submit_attempt(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t public.attempts;
begin
  select * into v_t from public.attempts where id = p_attempt;
  if not found or v_t.student_id <> auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_t.status = 'submitted' then
    return jsonb_build_object('status', 'submitted', 'submitted_at', v_t.submitted_at, 'duplicate', true);
  end if;
  if v_t.deadline_at is not null and now() > v_t.deadline_at then
    v_t := public.finalize_attempt(p_attempt, 'timeout');
  else
    v_t := public.finalize_attempt(p_attempt, 'manual');
  end if;
  return jsonb_build_object('status', 'submitted', 'submitted_at', v_t.submitted_at, 'reason', v_t.submit_reason, 'duplicate', false);
end $$;

-- Autosave: only newer client sequence numbers overwrite stored answers.
-- A 10 second grace period absorbs network latency for answers typed before the deadline.
create or replace function public.save_answer(
  p_attempt uuid, p_question uuid, p_response jsonb, p_seq bigint, p_flagged boolean default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t public.attempts;
  v_row public.answers;
begin
  select * into v_t from public.attempts where id = p_attempt;
  if not found or v_t.student_id <> auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_t.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'server_now', now());
  end if;
  if v_t.deadline_at is not null and now() > v_t.deadline_at + interval '10 seconds' then
    perform public.finalize_attempt(p_attempt, 'timeout');
    return jsonb_build_object('ok', false, 'reason', 'expired', 'server_now', now());
  end if;
  if not (p_question = any (v_t.question_order)) then raise exception 'unknown_question' using errcode = '22023'; end if;
  if pg_column_size(p_response) > 65536 then raise exception 'response_too_large' using errcode = '22023'; end if;

  insert into public.answers (attempt_id, question_id, response, client_seq, flagged)
  values (p_attempt, p_question, coalesce(p_response, '{}'::jsonb), p_seq, coalesce(p_flagged, false))
  on conflict (attempt_id, question_id) do update
     set response = excluded.response,
         client_seq = excluded.client_seq,
         flagged = coalesce(p_flagged, answers.flagged),
         updated_at = now()
   where answers.client_seq < excluded.client_seq
  returning * into v_row;

  update public.attempts
     set last_seen_at = now(),
         current_question_id = p_question,
         answered_count = (
           select count(*) from public.answers a
            where a.attempt_id = p_attempt and a.response <> '{}'::jsonb
         )
   where id = p_attempt;

  return jsonb_build_object(
    'ok', true,
    'applied', v_row.id is not null,
    'seq', coalesce(v_row.client_seq, p_seq),
    'server_now', now(),
    'deadline_at', v_t.deadline_at
  );
end $$;

create or replace function public.attempt_heartbeat(p_attempt uuid, p_current_question uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t public.attempts;
begin
  select * into v_t from public.attempts where id = p_attempt;
  if not found or v_t.student_id <> auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_t.status = 'in_progress' and v_t.deadline_at is not null and now() > v_t.deadline_at then
    v_t := public.finalize_attempt(p_attempt, 'timeout');
  elsif v_t.status = 'in_progress' then
    update public.attempts
       set last_seen_at = now(),
           current_question_id = case when p_current_question = any (question_order) then p_current_question else current_question_id end
     where id = p_attempt returning * into v_t;
  end if;
  return jsonb_build_object('status', v_t.status, 'server_now', now(), 'deadline_at', v_t.deadline_at, 'submitted_at', v_t.submitted_at);
end $$;

-- Sweeper for the background job runner (service role only).
create or replace function public.expire_overdue_attempts() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_id uuid;
begin
  for v_id in select id from public.attempts where status = 'in_progress' and deadline_at < now() for update skip locked loop
    perform public.finalize_attempt(v_id, 'timeout');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke execute on function public.expire_overdue_attempts() from public, anon, authenticated;
revoke execute on function public.finalize_attempt(uuid, public.submit_reason) from public, anon;
revoke execute on function public.start_attempt(uuid) from anon;
revoke execute on function public.submit_attempt(uuid) from anon;
revoke execute on function public.save_answer(uuid, uuid, jsonb, bigint, boolean) from anon;
revoke execute on function public.attempt_heartbeat(uuid, uuid) from anon;
revoke execute on function public.publish_assessment(uuid) from anon;
