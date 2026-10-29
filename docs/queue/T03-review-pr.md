# T03: Review, hygiene, and pull request

**Goal:** Make the branch clean and reviewable.

**Scope:** Inspect the full diff against main. Remove unused code, duplication, debug output, and accidental files. Check that no secrets are committed. Simplify without changing behavior. Review adaptation calculations, persistence, and accessibility for regressions and fix material findings. Run `npm test` and the 430px and 1280px walkthrough. Push, then open or update a pull request describing behavior, validation, and remaining limitations.

**Out of scope:** merging. Do not enable auto-merge; the owner merges.

**Done when:**
- Tests pass and the walkthrough shows no regressions
- PR is open with an accurate description, and its link is in the build log
