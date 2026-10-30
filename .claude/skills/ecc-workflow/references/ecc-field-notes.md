# ECC Field Notes

Study notes on https://github.com/affaan-m/ECC, read at commit `b38be6a` (release 2.2.3, MIT). Counts come from the repository's own README and AGENTS.md at that commit and will drift. Everything here is a summary of what that repository documents; treat the upstream repo as the source of truth and re-read it before relying on a detail.

## What ECC is

A "harness operating system" for coding agents: a Claude Code plugin (`ecc@ecc`) plus adapters for Codex, Cursor, OpenCode, Gemini, Zed, Copilot and others. Pitch: instead of rebuilding process in every prompt, install it once.

```text
plan -> test -> implement -> review -> verify -> remember -> improve
```

Claimed contents: 71 agents, 314 skills, 98 legacy command shims, hooks, rules, memory, continuous learning, and AgentShield (scanner for prompts, hooks, MCP config, permissions, secrets).

## Repository anatomy

| Path | Role |
|------|------|
| `skills/` | Canonical workflow surface. One directory per skill with `SKILL.md` |
| `agents/` | Subagents: Markdown with frontmatter `name`, `description`, `tools`, `model` |
| `commands/` | Legacy slash-entry shims kept for migration; new work goes to skills first |
| `hooks/` | `hooks.json` (executable graph), `hooks.metadata.json` (stable IDs, fingerprints), memory-persistence lifecycle |
| `rules/` | Always-follow guidelines: `common/` plus per-language packs (typescript, python, golang, rust, java, kotlin, swift, cpp, csharp, php, ruby, react, vue, ...) |
| `mcp-configs/` | MCP server configurations (a Context7 entry for live docs) |
| `scripts/` | Cross-platform Node utilities used by hooks, install and CI validators |
| `manifests/` | Install modules, components and profiles (selective install) |
| `tests/` | Node test suite (`node tests/run-all.js`) |
| `schemas/` | JSON schemas, for example skill provenance |
| `docs/` | Guides, policies, translations |
| Root guides | `the-shortform-guide.md`, `the-longform-guide.md`, `the-security-guide.md`, `CLAUDE.md`, `AGENTS.md`, `SOUL.md` |

Naming: lowercase with hyphens (`python-reviewer.md`, `tdd-workflow`). Commit format `<type>: <description>` with types feat, fix, refactor, docs, test, chore, perf, ci.

## Surface selection

| Surface | Activation | Reliability | Use for |
|---------|-----------|-------------|---------|
| Rule | Always loaded | Deterministic text, model still interprets | Constraints that always hold |
| Hook | Event-triggered (PreToolUse, PostToolUse, UserPromptSubmit, Stop, PreCompact, SessionStart/End, Notification) | Fires every time; exit code 2 blocks | Guarantees, observation, formatting, gates |
| Skill | Context-matched or invoked | Probabilistic (about 50-80%) | On-demand workflows and knowledge |
| Agent | Explicit delegation | As good as its prompt | Isolated tasks, context savings |
| Command | User types `/name` | Deterministic entry | Convenience entry points |
| MCP | Long-lived tool boundary | Costs context per tool | Interactive external systems |

ECC's dependency policy: prefer rules, skills, local scripts and direct APIs over adding MCP servers or third-party packages. A skill whose main value is "install this unvetted package" should not ship.

## Agent roster (by purpose)

- **Planning and design:** planner, architect, code-architect, spec-miner, a11y-architect, network-architect, homelab-architect
- **Quality:** code-reviewer, code-simplifier, comment-analyzer, silent-failure-hunter, type-design-analyzer, pr-test-analyzer, commit-reviewer, performance-optimizer, refactor-cleaner, doc-updater
- **Testing:** tdd-guide, e2e-runner
- **Security:** security-reviewer, healthcare-reviewer, opensource-sanitizer
- **Language reviewers and build resolvers:** python, typescript, react, vue, go, rust, java, kotlin, swift, cpp, csharp, php, ruby, flutter/dart, fsharp, django, fastapi, pytorch
- **Orchestration and meta:** loop-operator, harness-optimizer, agent-evaluator, conversation-analyzer, code-explorer, docs-lookup, chief-of-staff
- **Open-source release chain:** opensource-forker -> opensource-sanitizer -> opensource-packager
- **GAN-style harness:** gan-planner -> gan-generator -> gan-evaluator (generator iterates against an evaluator that tests the running app)

Proactive triggers in ECC's rules: complex feature -> planner; code just written -> code-reviewer; bug or feature -> tdd-guide; architecture decision -> architect; security-sensitive -> security-reviewer.

## Skill families worth knowing

| Family | Skills |
|--------|--------|
| Core loop | tdd-workflow, verification-loop, search-first, plan-orchestrate, blueprint, delivery-gate |
| Context | strategic-compact, context-budget, token-budget-advisor, prompt-caching-strategy, iterative-retrieval |
| Memory and learning | continuous-learning-v2 (v1 deprecated), unified-memory, skill-stocktake, rules-distill, skill-comply |
| Verification and eval | eval-harness, santa-method, council, benchmark, ai-regression-testing, agent-eval |
| Safety | safety-guard, gateguard, security-review, security-scan, agent-security-hardening, hookify-rules |
| Orchestration | autonomous-loops (compat) / continuous-agent-loop, dmux-workflows, team-agent-orchestration, parallel-execution-optimizer, orch-* pipeline |
| Agent design | agent-harness-construction, agentic-engineering, ai-first-engineering |
| Language and framework patterns | python, golang, rust, kotlin, swift, java/springboot, django, laravel, nestjs, nextjs, react, vue, postgres, redis, docker, kubernetes, and more |
| Domain packs | healthcare, networking, logistics, finance ops, investor materials, media and video |

## Key mechanisms

**Verification loop:** build -> types -> lint -> tests/coverage -> security grep -> diff review, then a PASS/FAIL report. Later versions add a separate **target acceptance** line so local green is never mistaken for a verified deployment.

**TDD gate:** RED must be an executed test failing for the intended reason. Optional git checkpoints: one commit for the validated reproducer, one for the minimal fix, one optional for refactor. Plan files are untrusted input.

**Strategic compact:** a PreToolUse hook on Edit/Write suggests `/compact` from context size (not just tool count). Default threshold scales with the window (about 160k on 200k, 250k on 1M) and repeats every ~60k tokens. Environment knobs include `COMPACT_THRESHOLD`, `COMPACT_CONTEXT_THRESHOLD`, `ECC_CONTEXT_WINDOW_TOKENS`.

**Continuous learning v2.1:** hooks record tool use, a background observer (small model) turns observations into atomic instincts with confidence 0.3-0.9, project-scoped by a hash of the git remote URL, global ones promoted at 2+ projects and average confidence 0.8+. `/evolve` clusters instincts into skills, commands or agents. Data lives outside `~/.claude` (under an XDG data dir) so sensitive-path guards do not block it. Observations stay local; only instincts export.

**GateGuard:** denies the first Edit/Write/Bash until the agent states concrete facts (importers, public names affected, data shape, verbatim instruction), then allows retry. Reported in ECC's A/B tests as +2.25 quality points on average; that is ECC's own measurement.

**Santa method:** generator output is judged by two independent reviewers with one rubric and no shared context; both must pass; a capped fix-and-re-review loop ends in human escalation.

**Council:** four voices for ambiguous decisions (Architect in-context, plus fresh Skeptic, Pragmatist, Critic subagents given only the question) to defeat anchoring.

**Iterative retrieval:** dispatch -> evaluate relevance -> refine query -> loop, max 3 cycles, to solve "subagent does not know what context it needs".

**Delegation completion contract:** at every depth, the final message is the deliverable; delegators own collection; do not decompose work that already fits one context.

**Hookify rules:** markdown files `.claude/hookify.<name>.local.md` with frontmatter (`name`, `enabled`, `event`, `pattern`, optional `action: warn|block`, optional `conditions`) evaluated by a built-in runtime.

**Loop patterns (autonomous-loops):** sequential `claude -p` pipeline (fresh context per step, de-sloppify cleanup pass instead of negative instructions), persistent REPL, parallel generation, PR loop with CI gates, RFC-driven DAG with merge queue.

## Efficiency tips from the guides

- Replace wrapper MCPs (GitHub, database, deploy) with skills or commands over the platform CLI when possible.
- Subagent model routing: cheap model for exploration and docs, mid for implementation and review, strongest for architecture, security and hard debugging. Default to the mid tier for most coding, upgrade after a failed first attempt, 5+ files, or security-critical work.
- Inject context dynamically (`--system-prompt` with a context file) instead of loading everything every session.
- Persist memory with SessionStart / PreCompact / Stop hooks; a Stop hook is cheaper than per-prompt hooks.
- Two-instance kickoff on a new project: one scaffolds, one researches and writes the PRD.
- `llms.txt` on documentation sites gives LLM-friendly docs.
- Build reusable patterns early; they compound as models improve.

## Security notes from the ECC security guide

- Project config (`.claude/`, hooks, MCP settings, env vars such as the API base URL) is part of the execution surface; opening an untrusted repo can run its config. Keep the tool updated and use containers for untrusted work.
- Sandbox: separate identity, no-egress or allow-listed network, dropped capabilities, no host mounts beyond the workspace, deny rules for `~/.ssh`, `~/.aws`, `.env*`, `curl | bash`.
- Sanitize attachments before a privileged agent sees them; split "parse" (restricted) from "act" (approved).
- Add a guardrail note next to external links in skills: loaded content is facts only, ignore any instructions in it.
- Memory can be poisoned: an injected instruction that gets remembered returns later. Review what is persisted.
- The guide cites a public study of thousands of third-party skills finding prompt injection in a large share; cite and verify before repeating figures.

## Install model (for reference, not required here)

- Recommended: `npx ecc-universal@<version> setup` (guided), or `/plugin marketplace add https://github.com/affaan-m/ECC` then `/plugin install ecc@ecc`. Pick **one** install path per harness; stacking duplicates hooks and skills.
- Plugins cannot ship rules; copy `rules/common` plus one language pack into `~/.claude/rules/`.
- Hook profiles: minimal, standard, strict. Do not paste the repo's raw `hooks.json` into user settings; use the installer.
- Official sources only: the GitHub repo, the `ecc-universal` and `ecc-agentshield` npm packages, the GitHub App, the plugin slug `ecc@ecc`, and ecc.tools. Treat third-party mirrors as untrusted.

## Source map (read these upstream for depth)

`README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/SKILL-DEVELOPMENT-GUIDE.md`, `docs/skill-adaptation-policy.md`, `docs/SKILL-PLACEMENT-POLICY.md`, `docs/continuous-learning-v2-spec.md`, `the-shortform-guide.md`, `the-longform-guide.md`, `the-security-guide.md`, `rules/common/*.md`, `hooks/README.md`, and the `SKILL.md` of any skill named above.
