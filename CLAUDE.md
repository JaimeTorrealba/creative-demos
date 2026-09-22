# demos

A Vue 3 + TresJS/Three.js creative coding lab. Sibling project to `creative-lab`, but focused on fewer, more polished, higher-quality demos rather than volume.

## Rules

- Do not optimize code. First make it work, then optimize. The cleanup pass happens only when `/verify` is run.
- No unit tests.
- Do not take screenshots using the chrome-devtools MCP until explicitly told to.
- Do not run tests, linters, type checks or builds on your own — not to confirm a change, not at the end of a task. That means no `npm run lint`, `npm run build`, `vue-tsc`, and no test runner. Verification is a manual step run at the end of a session via `/verify`.
- Write the code, state what changed, and stop. If you believe something needs verifying, say so in a sentence and leave it to the user.

## Commands

- `/new-demo <name>` — scaffold a new demo: component folder, view, and route, following the
  WallOfMist structure.
- `/verify` — end-of-session pass: type check, lint, tests (none configured yet), then a readability cleanup of the session's changed code.
