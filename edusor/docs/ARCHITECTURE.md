# Architecture

## Layout

```
edusor/
  supabase/migrations/      schema, RLS policies, RPCs, storage buckets, realtime publication
  scripts/                  seed.ts (dev data), mock-ai-server.ts (dev-only AI mock)
  src/app/                  routes (App Router)
    (focus)/student/attempts/[id]   distraction-free attempt page (no sidebar)
    api/                    route handlers: attempts (save/heartbeat/submit/files/events),
                            documents, media, exports, jobs/run (cron)
    teacher/ student/ admin/ super-admin/   role areas; each layout calls requireRole()
  src/lib/
    assessment/             question model (zod), deterministic grading, status, describe
    analytics/              pure statistics (median, distribution, difficulty, CSV)
    ai/                     OpenAI-compatible client, prompts/tasks, extraction, workers
    actions/                server actions per domain (validate → authorize → write → audit)
    data/                   server-side loaders (analytics, progress, results)
    server/                 audit, notifications, rate limit, file sniffing, job runner
    i18n/                   ru/kk dictionaries (kk typed against ru), server/client access
    supabase/               browser/server/admin clients and generated types
  src/components/           UI kit (ui/), shell, feature components
  tests/integration/        RLS/security tests (real sessions against local Supabase)
  tests/e2e/                Playwright
```

## Security model

1. **Postgres RLS is the source of truth.** Every table has RLS enabled. Helper functions
   (`is_school_admin`, `teaches_class_subject`, `can_manage_assessment`, `is_assigned`,
   `is_released`, …) are `SECURITY DEFINER` to avoid policy recursion.
2. **Server-side checks in layouts and actions.** `requireRole()` guards every role area; actions
   re-validate input with Zod and perform their reads through the user's RLS-scoped client.
3. **Service role only after verification.** `createAdminClient()` (server-only module) is used
   for: grading writes, releases, notifications, audit, background jobs, admin-created student
   accounts. Each call site first confirms the caller's access through an RLS-scoped read or RPC.
4. **Answer keys are physically separated.** Builder tables (`assessment_questions`,
   `question_bank_items`) are readable only by managers. Students read immutable
   `assessment_snapshots` that contain no keys; keys live in `assessment_snapshot_keys`, readable by
   a student only for a *released* attempt when the teacher enabled “show correct answers” and the
   question’s “reveal” flag. Ordering/matching content is stored in id order so the visible content
   never encodes the answer.
5. **Scores are hidden until release.** `question_scores` and `final_grades` are readable by the
   student only when a `result_releases` row exists. No client role can write them.
6. **Tenant isolation.** Memberships can only be created through invitations, approved join
   requests, admin-created accounts or the super admin; RLS ties every school-scoped row to an
   active membership.

## Assessment lifecycle

1. Draft: teacher edits questions (`assessment_questions`), sections, settings, assignees.
2. Publish (`publish_assessment` RPC): validates, writes a versioned snapshot + keys; later edits
   require publishing a new version and never change existing attempts.
3. Attempt (`start_attempt` RPC): checks assignment, window, attempts and accommodations; stores
   `deadline_at = min(start + duration (+extra), due_at (+extra))`, randomized question/option order.
4. Autosave (`save_answer` RPC): last-writer-wins by client sequence number; 10 s grace after the
   deadline; returns `locked/expired` afterwards. Client mirrors unsent changes to localStorage.
5. Heartbeat (`attempt_heartbeat`): resynchronizes the client clock with the server and finalizes
   expired attempts. The cron sweeper (`expire_overdue_attempts`) finalizes abandoned ones.
6. Submit (`submit_attempt`, idempotent) → `gradeAttempt()` deterministic scoring → AI jobs for
   subjective answers → teacher review → `final_grades` → `result_releases`.

## Background jobs

`/api/jobs/run` (Vercel Cron, Bearer `CRON_SECRET`) and `after()` hooks run
`runBackgroundJobs()`: expire overdue attempts, grade ungraded submissions, process AI grading
jobs and document jobs, send deadline reminders. Jobs are claimed with `FOR UPDATE SKIP LOCKED`
(`claim_ocr_job`, `claim_grading_job`), retried up to 3 times, failures stored on the job and in
`system_errors`.

## Realtime

`attempts`, `lockdown_events` and `notifications` are in the `supabase_realtime` publication.
Live monitoring subscribes to RLS-filtered `postgres_changes` and falls back to 10 s polling.

## Internationalization

`src/lib/i18n/dictionaries/ru.ts` is the reference; `kk.ts` is typed `Dictionary`, so a missing or
extra key fails type checking. Locale order: profile → cookie → `ru`. Dates use `Asia/Almaty`.
AI explanations and feedback are generated in the student's locale.

## Grading rules

Deterministic (`src/lib/assessment/grading.ts`): single/multiple choice (partial credit with
wrong-pick penalty), true/false, numeric (decimal comma, tolerance), matching, ordering
(adjacent-pair partial credit), fill-in-the-blanks (alternatives, case option), short text
(exact accepted answers; other answers go to review rather than being marked wrong).
Essays, file and photo answers always require teacher approval; AI only suggests.
The 2–5 mark shown next to percentages uses 85/65/40 % thresholds and is informational.
