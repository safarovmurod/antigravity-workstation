---
name: workstation-workflow
description: Plan, build, verify, debug and resume a multi-step coding task (a new page, feature, refactor or bug hunt) in the current project. Use when the task needs more than one or two edits, or when the user asks to plan, continue, pause or verify work. Not for a one-line answer or a single small fix.
---

# Workstation workflow

Work in six steps. Keep every step short, real and checked. Follow the user's global rules (language, stack, no invented APIs, minimal changes) above this skill.

## 1. Understand
- Read the request, `package.json` and the files the task touches. Do not read the whole project.
- Write down: goal, what is already there, what is missing.
- Ask one question only when an important choice is truly unknown (stack, API, design, data). Otherwise continue.

## 2. Plan
- Create or update `PLAN.md` in the project root:
  - `Goal:` one sentence
  - `Steps:` numbered, each small enough for one commit
  - `Status:` `[ ]` todo, `[x]` done, `[!]` blocked (with the reason)
- Show the plan in 3 to 7 lines and start.

## 3. Build
- Do one step at a time. Change only what the step needs; keep existing code, design and structure.
- After each step: run the quick check from step 4, mark it `[x]` in `PLAN.md`, then commit with a short message (`git add -A` and `git commit -m "<what changed>"`) only when the project is a Git repository and the user did not forbid commits.

## 4. Verify
Before saying a step or the task is done, run what the project really has:
- `npm run build` (or `npx tsc --noEmit` for TypeScript) and `npm run lint` when present.
- For UI work, open the page with the `agent-browser` skill when available and check desktop and mobile width.
- Report each check as PASS, FAIL or NOT TESTED with the real output. Never call untested work done.
- For a large or risky change, hand the result to the `workstation-verifier` agent.

## 5. Debug
When something fails:
1. Copy the exact error (terminal, console or browser).
2. Find the file and line; state the confirmed cause. If it is not confirmed yet, say so and name the next check.
3. Fix the smallest thing that removes the cause, then run the same check again.
4. Never repeat a fix that already failed without new evidence.

## 6. Pause and resume
- Pause: update `PLAN.md` (`Status`, last result, next step) so a new chat can continue.
- Resume: read `PLAN.md` first, re-run the last check, then continue from the first unchecked step.

## Finish
End with: what changed and where, what was checked (PASS/FAIL/NOT TESTED), what is left. Delete `PLAN.md` only when the user asks.
