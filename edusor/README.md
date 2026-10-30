# EduSOR

EduSOR is a platform for running СОР/СОЧ (summative assessments) in Kazakhstan schools. Teachers
upload an existing document or build an assessment by hand, students take it online, objective
questions are graded automatically, AI suggests scores for open answers, and teachers approve and
release results. After release, students go through their mistakes with an AI tutor.

The interface is in Russian and Kazakh. Roles: platform super admin, school administrator,
teacher, student.

> This app lives in `edusor/` of a repository that also contains an unrelated static site
> (Metro Teknik, in the repository root). The two do not share code or deployment.

## Stack

Next.js 15 (App Router, Server Actions, Route Handlers) · React 19 · TypeScript (strict) ·
Tailwind CSS v4 with shadcn/ui-style components on Radix · Lucide · React Hook Form + Zod ·
Recharts · KaTeX · Supabase (Postgres, Auth, Storage, Realtime, RLS) · OpenAI-compatible AI API ·
Vitest · Playwright.

## Quick start (local)

Requirements: Node 20+ (22 tested), Docker, and the Supabase CLI (installed as a dev dependency).

```bash
cd edusor
npm install
cp .env.example .env.local
```

```bash
npx supabase start
```

`supabase start` prints the local URL, anon key and service-role key. Put them into `.env.local`
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

```bash
npx supabase db reset
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000. Seeded accounts (local development only, password `EduSor-dev-2026`):

| Role | Sign in with |
|---|---|
| Platform super admin | `superadmin@edusor.local` |
| School admin (Школа-гимназия № 1) | `admin@gym1.edusor.local` |
| Teacher (math 7А/7Б, physics 9А) | `teacher@gym1.edusor.local` |
| Teacher (Kazakh 7А, biology 9А) | `teacher2@gym1.edusor.local` |
| Students of 7А (login, no email) | `aidar.s`, `aruzhan.k`, `daniyar.n`, `madina.t`, `timur.b`, `amina.zh` |
| Second school (isolation tests) | `teacher@lyc2.edusor.local`, `lyc2.student` |

The seed refuses to run against a non-local Supabase URL unless `--force` is passed.

### AI in local development

Without `AI_API_KEY`, AI features show as unavailable (documents still get their text extracted,
grading falls back to the teacher). To exercise the AI pipelines without a provider, run the
**development-only** mock server, whose every output is prefixed `[MOCK AI]`:

```bash
npm run mock-ai
```

and set `AI_API_BASE_URL=http://127.0.0.1:4010/v1` and any non-empty `AI_API_KEY` in `.env.local`.
For real AI, see [docs/AI.md](docs/AI.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (grading engine, status logic, analytics, file sniffing, …) |
| `npm run test:integration` | RLS/security tests against local Supabase + seed |
| `npm run test:e2e` | Playwright end-to-end tests against a running app + fresh seed |
| `npm run db:seed` | Development seed |
| `npm run mock-ai` | Development-only mock AI endpoint |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, data model, security model, workflows
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Supabase + Vercel production setup
- [docs/AI.md](docs/AI.md) — AI provider configuration, what is sent, failure behaviour
- [docs/TESTING.md](docs/TESTING.md) — test layers and how to run them
- [docs/SECURITY.md](docs/SECURITY.md) — security review and known limitations

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | public | Base URL for auth redirects and invitation links |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon/publishable key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Background jobs, grading writes, admin-created student accounts |
| `STUDENT_LOGIN_EMAIL_DOMAIN` | server | Domain for sign-in emails of students without email |
| `AI_API_BASE_URL` | server | OpenAI-compatible API base URL |
| `AI_API_KEY` | **server only** | Provider key; empty = AI disabled |
| `AI_MODEL_TEXT` / `AI_MODEL_VISION` | server | Model names for text/JSON tasks and OCR |
| `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` | server | Request timeout and retries |
| `CRON_SECRET` | **server only** | Bearer secret for `/api/jobs/run` |
