---
description: Verify, simplify, commit, push, and open a PR
allowed-tools: Bash, Read, Edit, Task
argument-hint: [optional PR title]
---

Ship the current branch end-to-end. Argument (optional): PR title override.

## Steps

1. **Status check** — `git status` and `git diff --stat`. If working tree is clean, stop: "nothing to ship".
2. **Verify** — run `bun run build && bun test`. If anything fails, stop and report. Do not continue to simplification until green.
3. **Simplify** — dispatch the `code-simplifier` subagent on the current diff. Wait for it to finish.
4. **Re-verify** — if the simplifier changed anything, run `npx tsc --noEmit` again to confirm no regressions.
5. **Commit** — stage all modified files (not new untracked ones unless obviously related), draft a conventional-commit message based on the actual diff, and commit via HEREDOC. Do not use `-A` or `.`.
6. **Push** — `git push -u origin HEAD` (use `-u` if upstream isn't set).
7. **PR** — `gh pr create` with title (argument if provided, else derived from commit) and a body containing:
   - `## Summary` — 1-3 bullets
   - `## Test plan` — checklist of what was verified
8. **Report** — paste the PR URL back to the user.

## Guardrails

- Never force-push.
- Never skip hooks (`--no-verify`).
- If `gh` is unauthenticated, stop and ask the user to run `gh auth login`.
- If the branch is `main` or `master`, stop and ask the user to confirm — shipping directly to main is usually a mistake.
