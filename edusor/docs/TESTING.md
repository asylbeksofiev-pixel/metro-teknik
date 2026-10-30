# Testing

| Layer | Location | Needs | Command |
|---|---|---|---|
| Unit | `src/**/*.test.ts` | nothing | `npm test` |
| Security / integration | `tests/integration/` | local Supabase + seed | `npm run test:integration` |
| End-to-end | `tests/e2e/` | local Supabase + fresh seed + running app | `npm run test:e2e` |
| Types / lint | — | — | `npm run typecheck`, `npm run lint` |

## Unit tests (65)

Grading for every objective type (partial credit, decimal commas, tolerance, alternatives,
case sensitivity, unanswered/pending handling), question validation, key-safe storage, student
status derivation, response/key descriptions, analytics (median, buckets, difficulty with the
minimum-sample rule, option distribution, topic aggregation, CSV formula-injection escaping) and
file-type sniffing.

## Security integration tests (20)

Real user sessions against the local API, so RLS is what is tested:
anonymous access, cross-school isolation for teachers and students, class/subject scoping,
students cannot read builder questions or keys, snapshots contain no keys, ordering content does
not leak the order, server-side deadline, stale autosave rejected, another student cannot read or
write an attempt, students cannot write attempts/grades/releases or escalate privileges, lockdown
events only for the own in-progress attempt, idempotent submission and locking, attempt limits,
scores hidden until release.

## End-to-end tests (9)

Login redirect, invalid credentials, language switch RU↔KK and logout, password-recovery privacy,
role routing, cross-school 404 for pages and CSV export, cron endpoint auth, full student attempt
(autosave, refresh restore, submit confirmation, locked revisit), teacher review → approve →
release → student result and mistake review.

## Running everything from scratch

```bash
npx supabase start
```

```bash
npx supabase db reset && npm run db:seed
```

```bash
npm test && npm run test:integration
```

```bash
npx supabase db reset && npm run db:seed && npm run dev
```

```bash
npm run test:e2e
```

E2E and integration tests consume seeded students' single attempts, so reseed before re-running.
