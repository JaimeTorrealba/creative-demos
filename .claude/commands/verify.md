---
description: End-of-session pass — type check, lint, tests, then a readability cleanup of changed code
argument-hint: "[optional: paths to scope the cleanup to]"
allowed-tools: Bash(npx vue-tsc:*), Bash(npm run lint), Bash(npm run test:*), Bash(npm test), Bash(npx vitest:*), Bash(git status:*), Bash(git diff:*), Bash(node -e:*), Read, Edit, Write, Grep, Glob
---

This is the manual end-of-session verification pass. The normal project rules forbid running
checks or optimizing code; **this command is the explicit exemption to both**. Run it fully.

Scope for the cleanup phase: $ARGUMENTS
If that is empty, scope to the files changed in this session (see Phase 0).

## Phase 0 — Establish scope

```
git status --short
git diff
git diff --stat HEAD
```

Note which files are new or modified. That set is the cleanup target. Untracked files count —
read them in full, since `git diff` will not show their contents.

## Phase 1 — Type check

```
npx vue-tsc -b --force
```

`--force` matters: this repo uses TS project references with build info caching, and without it
a stale `.tsbuildinfo` will report success without re-checking anything.

Report the real result. If it fails, fix the type errors before moving on — but fix them
properly. Do not silence errors with `any`, `@ts-ignore`, or non-null assertions just to get a
clean exit. If a fix is genuinely ambiguous, stop and ask.

## Phase 2 — Lint

```
npm run lint
```

Be aware this is `eslint . --fix`, so it **rewrites files in place**. Check `git diff` afterward
to see what it changed — do not assume the autofix was harmless. Anything ESLint could not fix
automatically, fix by hand.

## Phase 3 — Tests

There is no test runner in this project and `CLAUDE.md` says "No unit tests", so there is
normally nothing to run here. Confirm rather than assume:

```
node -e "const s=require('./package.json').scripts||{}; console.log(s.test||'NO TEST SCRIPT')"
```

If a test script exists, run it and report the result. If it does not, say "no test runner
configured" and move on. Do not invent tests, do not add a test runner, and do not treat the
absence as a failure.

## Phase 4 — Readability cleanup

Now do the optimization pass on the files from Phase 0. The goal is code that is lighter, less
complex and easier to read.

**The hard constraint: behavior must not change.** This is a refactor, not a rewrite. Do not
touch logic, rendering output, timing, or the shape of anything another file imports.

Good changes:
- Collapse redundant intermediate variables and needless indirection
- Remove dead code, unused imports, unreachable branches, leftover scaffolding
- Replace a verbose block with a clearer equivalent expression
- Simplify over-nested conditionals; prefer early returns
- Tighten naming so a reader does not need the definition to understand the use
- Delete comments that restate the code; keep and improve comments that explain *why*
- Align with the conventions already in the file and with `.prettierrc.json`
  (no semicolons, single quotes, 2-space, width 100, no trailing commas)

Off limits:
- Changing what the code does, or the visual result of a demo
- Renaming exports, routes, props, or component filenames
- Performance micro-optimization, caching, memoization — "less heavy" here means less code to
  read, not faster at runtime
- Reaching into files outside the Phase 0 scope
- Restructuring a file just to impose a different style preference

Judgment call: if a piece of code is already clear, leave it alone. A pass that changes nothing
is a valid outcome and is better than churn. When a simplification would be nice but you are
not fully certain it preserves behavior, do not apply it — list it as a suggestion instead.

## Phase 5 — Re-verify and report

Phase 2 and Phase 4 both edited files, so the Phase 1 result is now stale. Re-run:

```
npx vue-tsc -b --force
npm run lint
```

Both must pass. If the cleanup broke something, revert that specific simplification rather than
patching over it.

Then give a short report:

- **Type check** — pass/fail, and any errors fixed
- **Lint** — pass/fail, what the autofix touched, what you fixed by hand
- **Tests** — result, or "no test runner configured"
- **Cleanup** — per file, what was simplified and why; explicitly confirm no logic changed
- **Suggested but not applied** — anything you judged too risky to do unasked
- **Still unverified** — this command does not open a browser. If the session changed something
  that can only be confirmed visually (a TresJS demo's rendering, for instance), say so plainly
  rather than implying the change is confirmed working.

Report what actually happened. If a phase failed and you could not fix it, say that clearly
instead of burying it.
