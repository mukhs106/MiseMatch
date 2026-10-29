---
description: Run the next queued build task from docs/queue/QUEUE.md
---

Run exactly one task from the build queue, then stop.

1. Read CLAUDE.md and docs/queue/QUEUE.md. If an argument was given ($ARGUMENTS), run that task id. Otherwise take the first task marked `todo`. If none are `todo`, say so and stop.
2. Read the task file and the sections of docs/product-context.md it names. The task file is the scope; do not expand it.
3. Mark the task `doing` in QUEUE.md. Work on the current feature branch, or create the branch the task names.
4. Implement in small steps. Run `npm test` and check the affected flow in the browser at 430px and 1280px, unless the task says otherwise.
5. If you hit a decision that is genuinely the owner's to make, or a blocker you cannot resolve, mark the task `blocked` with one line saying why, commit what is safe, and stop. Do not guess on brand, scope, or behavior rules.
6. When the task's "Done when" list is met, commit with a clear message and push the branch. Never merge, never force-push, never touch main directly.
7. Mark the task `done` in QUEUE.md and append an entry to docs/build-log.md: date, task id, what changed, what was verified, what could not be checked, and any follow-up. Keep it under ten lines.
8. Reply with a three to five line summary and the name of the next `todo` task. Do not start it.
