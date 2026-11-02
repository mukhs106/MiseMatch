# Build queue

Run `/next` in Claude Code to complete the first `todo` task, or `/next T02` to run a specific one. One task per run. Statuses: `todo`, `doing`, `blocked`, `done`.

To add work: create `docs/queue/TNN-short-name.md` from `_template.md` and add a row below. Keep each task small enough to finish and verify in one run.

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| T04 | [Align build with decision record](T04-align-record.md) | done | Resolves C1 to C10. Its C8 (per-recipe partial amounts) is replaced by T05's pantry model |
| T05 | [Navigation, Recipes, and Pantry](T05-navigation-recipes-pantry.md) | done | Supersedes C8: Pantry holds optional quantities as the single ingredient state |
| T06 | [Profile and Settings](T06-profile.md) | todo | Largely covered by v0.6 Requirements and settings (diet, allergens with clarifications, goals, dislikes, label-check honesty). Review against v0.6 before running |
| T01 | [Revision evidence and decision log](T01-revision-evidence.md) | todo | Screens changed in v0.6: its after shots need the new flow (Today, adapt steps, compare, list). Needs Figma "before" exports in docs/revisions/2026-10-29/before/ |
| T02 | [Usability test kit for the next question](T02-test-kit.md) | todo | |
| T03 | [Review, hygiene, and pull request](T03-review-pr.md) | todo | Opens a PR; does not merge |
