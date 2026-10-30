# Deployment (Supabase + Vercel)

## 1. Supabase project

1. Create a project (region close to Kazakhstan, e.g. Frankfurt).
2. Apply migrations from `edusor/`:

   ```bash
   npx supabase link --project-ref <project-ref>
   ```

   ```bash
   npx supabase db push
   ```

   This creates the schema, RLS policies, RPCs, the private storage buckets
   (`assessment-documents`, `submissions`, `question-media`) and adds tables to the
   `supabase_realtime` publication.
3. Auth settings (Dashboard → Authentication):
   - Site URL: your production URL; add `https://<domain>/auth/callback` to redirect URLs.
   - Enable email confirmations and configure SMTP (password recovery and sign-up emails).
   - Minimum password length ≥ 8.
4. Do **not** run the dev seed in production. Create the first super admin manually:
   register normally, then in the SQL editor:

   ```sql
   update public.profiles set is_super_admin = true where email = 'you@example.kz';
   ```

5. The super admin creates schools and invites school administrators (`/super-admin/schools`).
   Invitation links are shown in the UI to be sent to the recipient; EduSOR does not send
   invitation emails itself.

## 2. Vercel

1. Import the repository and set **Root Directory = `edusor`** (the repository root contains an
   unrelated static site with its own `vercel.json`).
2. Environment variables: see the table in `README.md`. Mark `SUPABASE_SERVICE_ROLE_KEY`,
   `AI_API_KEY` and `CRON_SECRET` as sensitive. Never prefix them with `NEXT_PUBLIC_`.
3. `edusor/vercel.json` schedules `/api/jobs/run` every 5 minutes. Vercel Cron sends
   `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.
   Sub-daily schedules require a paid Vercel plan; on Hobby, use an external scheduler that calls
   the endpoint with the same header, or accept daily runs (submissions are still graded
   immediately on submit; the cron only catches abandoned attempts and retries).
4. Long-running routes (`/api/jobs/run`, `/api/documents`) are configured for up to 300 s.

## 3. After deploy

- Sign in as super admin → Settings → “Проверить соединение” to confirm the AI provider.
- Create a school, invite its administrator, let them create classes, subjects, teachers and
  student logins.

## Operations

- **Backups:** enable Supabase point-in-time recovery; storage buckets hold original documents
  and student files.
- **Monitoring:** `/super-admin/audit` lists audit events and `system_errors` (AI failures,
  job errors). AI token usage is in `ai_usage` and summarized on the super-admin dashboard.
- **Scaling notes:** analytics pages aggregate in the app server; for very large schools add
  SQL views/materialized views for per-question statistics.
