# Security review

## Controls in place

- **Authorization:** RLS on every table; role guards in layouts; Zod validation in every action
  and route; RPCs for state transitions (`start_attempt`, `save_answer`, `submit_attempt`,
  `finalize_attempt`, `publish_assessment`, `accept_invitation`, `review_teacher_request`).
- **Column-level grants:** users can update only `profiles.full_name/locale`; admins only
  `school_memberships.status/student_code`, `schools.name/city/region`; users only
  `notifications.read_at`. `is_super_admin` is changeable only with SQL.
- **Secrets:** service-role key, AI key and cron secret are read in `server-only` modules; the
  browser only gets the Supabase URL and anon key.
- **Uploads:** size limits, type detection by magic bytes (the declared MIME type is ignored),
  private buckets, signed URLs with short lifetimes, path-format checks, per-user rate limits.
- **Rate limiting** (Postgres-backed) on login (per IP and per identifier), registration,
  password recovery, uploads and AI endpoints.
- **Auth hygiene:** password recovery never reveals whether an email exists; `next` redirects are
  restricted to same-origin paths; invitation tokens are random and stored only as SHA-256 hashes,
  bound to the invited email, expiring and revocable.
- **Audit:** grade changes (append-only `teacher_reviews` with previous value), approvals,
  releases, publishing, memberships, invitations, documents → `audit_events`.
- **Output safety:** question text is rendered by a small Markdown/KaTeX renderer that never
  injects user HTML (KaTeX runs with `trust: false`); CSV exports neutralize formula injection.
- **Headers:** `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, permissions policy
  disabling camera/microphone/geolocation.
- **AI:** prompt fencing, no personal data to providers, server-side clamping of AI scores, AI never
  writes final grades.

## Known limitations (be explicit with schools)

- **Lockdown Mode is browser-based.** It cannot stop Alt+Tab, other devices, second monitors or
  screenshots. Events are review signals, not proof; scores are never reduced automatically.
- **No Content-Security-Policy yet.** Next.js inline runtime scripts and KaTeX styles need a
  nonce-based CSP; add one before handling high-stakes exams.
- **Invitations are not emailed** by EduSOR; administrators copy the link.
- **Student logins without email** use synthetic addresses on `STUDENT_LOGIN_EMAIL_DOMAIN`; password
  resets for them are done by the school administrator.
- **Rate limiting fails open** if the database is unreachable (logged), to avoid locking out a
  whole school during an exam.
- **AI with a real provider was not exercised** in the build environment (only the mock).
- **Personal-data compliance** (Law of RK “On Personal Data and Their Protection”, data residency)
  must be confirmed by the operator: choose Supabase/AI regions and review `/privacy` text.
