-- EduSOR core schema: identity, schools, academic structure, RLS helpers.
-- All tenant isolation is enforced here through Row Level Security.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.school_role as enum ('school_admin', 'teacher', 'student');
create type public.app_locale as enum ('ru', 'kk');
create type public.membership_status as enum ('active', 'suspended');
create type public.request_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  email text,
  locale public.app_locale not null default 'ru',
  login text unique check (login ~ '^[a-z0-9][a-z0-9._-]{2,40}$'),
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Schools and membership
-- ---------------------------------------------------------------------------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 200),
  city text check (char_length(city) <= 100),
  region text check (char_length(region) <= 100),
  join_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.school_role not null,
  status public.membership_status not null default 'active',
  student_code text check (char_length(student_code) <= 40),
  created_at timestamptz not null default now(),
  unique (school_id, user_id, role)
);
create index school_memberships_user_idx on public.school_memberships (user_id);
create index school_memberships_school_role_idx on public.school_memberships (school_id, role);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (char_length(name) between 4 and 40),
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (school_id, name)
);
create unique index academic_years_one_current on public.academic_years (school_id) where is_current;

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name_ru text not null check (char_length(name_ru) between 1 and 120),
  name_kk text not null check (char_length(name_kk) between 1 and 120),
  code text check (char_length(code) <= 20),
  created_at timestamptz not null default now(),
  unique (school_id, name_ru)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid references public.academic_years (id) on delete set null,
  name text not null check (char_length(name) between 1 and 40),
  grade smallint not null check (grade between 0 and 12),
  created_at timestamptz not null default now(),
  unique (school_id, academic_year_id, name)
);
create index classes_school_idx on public.classes (school_id);

create table public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index class_teachers_unique on public.class_teachers (class_id, teacher_id, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index class_teachers_teacher_idx on public.class_teachers (teacher_id);

create table public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);
create index class_enrollments_student_idx on public.class_enrollments (student_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.school_role not null,
  class_id uuid references public.classes (id) on delete set null,
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_school_idx on public.invitations (school_id);

create table public.teacher_verification_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text check (char_length(message) <= 1000),
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index teacher_requests_one_pending on public.teacher_verification_requests (school_id, user_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger schools_touch before update on public.schools for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Profile bootstrap. Roles are NEVER taken from user metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_locale public.app_locale := 'ru';
begin
  if new.raw_user_meta_data ->> 'locale' = 'kk' then
    v_locale := 'kk';
  end if;
  insert into public.profiles (id, full_name, email, locale, login)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200),
    new.email,
    v_locale,
    nullif(new.raw_app_meta_data ->> 'login', '')
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER to avoid RLS recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.has_school_role(p_school uuid, p_roles public.school_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.school_memberships m
    where m.school_id = p_school and m.user_id = auth.uid()
      and m.status = 'active' and m.role = any (p_roles)
  )
$$;

create or replace function public.is_school_staff(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_school_role(p_school, array['school_admin', 'teacher']::public.school_role[])
$$;

create or replace function public.is_school_admin(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_school_role(p_school, array['school_admin']::public.school_role[])
$$;

create or replace function public.is_school_member(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.school_memberships m
    where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create or replace function public.teaches_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_teachers ct where ct.class_id = p_class and ct.teacher_id = auth.uid())
$$;

create or replace function public.is_enrolled(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_enrollments ce where ce.class_id = p_class and ce.student_id = auth.uid())
$$;

create or replace function public.class_school(p_class uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.classes where id = p_class
$$;

create or replace function public.has_school_role_for(p_user uuid, p_school uuid, p_role public.school_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.school_memberships m
    where m.school_id = p_school and m.user_id = p_user and m.role = p_role and m.status = 'active'
  )
$$;

-- Teacher of any class the student is enrolled in (or school admin of the student's school).
create or replace function public.can_view_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_student = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1 from public.class_enrollments ce
      join public.class_teachers ct on ct.class_id = ce.class_id
      where ce.student_id = p_student and ct.teacher_id = auth.uid()
    )
    or exists (
      select 1 from public.school_memberships sm
      join public.school_memberships me on me.school_id = sm.school_id
      where sm.user_id = p_student and me.user_id = auth.uid()
        and me.role in ('school_admin', 'teacher') and me.status = 'active'
    )
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.academic_years enable row level security;
alter table public.subjects enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.invitations enable row level security;
alter table public.teacher_verification_requests enable row level security;

-- profiles: self, people who legitimately work with the user, super admin.
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_view_student(id) or exists (
    -- students may see the names of teachers of their own classes
    select 1 from public.class_teachers ct join public.class_enrollments ce on ce.class_id = ct.class_id
    where ct.teacher_id = profiles.id and ce.student_id = auth.uid()
  ));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Only these columns may be changed by the user themselves.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, locale) on public.profiles to authenticated;

-- schools
create policy schools_select on public.schools for select to authenticated
  using (public.is_school_member(id) or public.is_super_admin());
create policy schools_super_all on public.schools for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy schools_admin_update on public.schools for update to authenticated
  using (public.is_school_admin(id)) with check (public.is_school_admin(id));
revoke update on public.schools from authenticated;
grant update (name, city, region) on public.schools to authenticated;

-- memberships
create policy memberships_select on public.school_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_school_staff(school_id) or public.is_super_admin());
-- Memberships are created only through invitations, approved join requests,
-- admin-created student accounts (server) or the super admin.
create policy memberships_super_all on public.school_memberships for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy memberships_admin_update on public.school_memberships for update to authenticated
  using (public.is_school_admin(school_id) and user_id <> auth.uid())
  with check (public.is_school_admin(school_id));
create policy memberships_admin_delete on public.school_memberships for delete to authenticated
  using (public.is_school_admin(school_id) and user_id <> auth.uid());
revoke update on public.school_memberships from authenticated;
grant update (status, student_code) on public.school_memberships to authenticated;

-- academic years / subjects: members read, admins write
create policy years_select on public.academic_years for select to authenticated
  using (public.is_school_member(school_id) or public.is_super_admin());
create policy years_admin_write on public.academic_years for all to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

create policy subjects_select on public.subjects for select to authenticated
  using (public.is_school_member(school_id) or public.is_super_admin());
create policy subjects_admin_write on public.subjects for all to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

-- classes: staff of school, enrolled students
create policy classes_select on public.classes for select to authenticated
  using (public.is_school_staff(school_id) or public.is_enrolled(id) or public.is_super_admin());
create policy classes_admin_write on public.classes for all to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

create policy class_teachers_select on public.class_teachers for select to authenticated
  using (public.is_school_staff(public.class_school(class_id)) or public.is_enrolled(class_id));
create policy class_teachers_admin_write on public.class_teachers for all to authenticated
  using (public.is_school_admin(public.class_school(class_id)))
  with check (public.is_school_admin(public.class_school(class_id))
    and public.has_school_role_for(teacher_id, public.class_school(class_id), 'teacher'));

create policy enrollments_select on public.class_enrollments for select to authenticated
  using (student_id = auth.uid() or public.teaches_class(class_id) or public.is_school_admin(public.class_school(class_id)));
create policy enrollments_admin_write on public.class_enrollments for all to authenticated
  using (public.is_school_admin(public.class_school(class_id)))
  with check (public.is_school_admin(public.class_school(class_id))
    and public.has_school_role_for(student_id, public.class_school(class_id), 'student'));

create policy invitations_admin on public.invitations for all to authenticated
  using (public.is_school_admin(school_id) or public.is_super_admin())
  with check (public.is_school_admin(school_id) or public.is_super_admin());

create policy teacher_requests_select on public.teacher_verification_requests for select to authenticated
  using (user_id = auth.uid() or public.is_school_admin(school_id));
create policy teacher_requests_admin_update on public.teacher_verification_requests for update to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

-- ---------------------------------------------------------------------------
-- RPCs: invitations and join requests
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_inv public.invitations;
  v_email text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select email into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.invitations
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0002'; end if;
  if v_inv.revoked_at is not null then raise exception 'invitation_revoked' using errcode = 'P0001'; end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = auth.uid() then return v_inv.school_id; end if;
    raise exception 'invitation_used' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then raise exception 'invitation_expired' using errcode = 'P0001'; end if;
  if lower(v_inv.email) <> lower(v_email) then raise exception 'invitation_email_mismatch' using errcode = '42501'; end if;

  insert into public.school_memberships (school_id, user_id, role)
  values (v_inv.school_id, auth.uid(), v_inv.role)
  on conflict (school_id, user_id, role) do update set status = 'active';

  if v_inv.class_id is not null and v_inv.role = 'student' then
    insert into public.class_enrollments (class_id, student_id) values (v_inv.class_id, auth.uid())
    on conflict do nothing;
  end if;

  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  return v_inv.school_id;
end $$;

create or replace function public.request_teacher_access(p_join_code text, p_message text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select id into v_school from public.schools where join_code = upper(trim(p_join_code)) and is_active;
  if v_school is null then raise exception 'school_not_found' using errcode = 'P0002'; end if;
  if public.has_school_role_for(auth.uid(), v_school, 'teacher') then raise exception 'already_member' using errcode = 'P0001'; end if;
  insert into public.teacher_verification_requests (school_id, user_id, message)
  values (v_school, auth.uid(), left(p_message, 1000))
  on conflict (school_id, user_id) where status = 'pending' do update set message = excluded.message
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.review_teacher_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.teacher_verification_requests;
begin
  select * into v_req from public.teacher_verification_requests where id = p_request for update;
  if not found then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if not public.is_school_admin(v_req.school_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_req.status <> 'pending' then return; end if;
  update public.teacher_verification_requests
     set status = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request;
  if p_approve then
    insert into public.school_memberships (school_id, user_id, role)
    values (v_req.school_id, v_req.user_id, 'teacher')
    on conflict (school_id, user_id, role) do update set status = 'active';
  end if;
end $$;

revoke execute on function public.accept_invitation(text) from anon;
revoke execute on function public.request_teacher_access(text, text) from anon;
revoke execute on function public.review_teacher_request(uuid, boolean) from anon;
