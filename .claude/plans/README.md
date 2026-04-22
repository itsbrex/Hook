# Plans

Drop implementation plans here (one markdown file per plan). Conventions:

- **Naming:** `YYYY-MM-DD-slug.md` (e.g. `2026-04-22-hookmark-mcp-feature-gaps.md`)
- **Structure:** goal, context, step-by-step tasks, verification, rollback
- **Lifecycle:** keep active plans here; archive completed ones under `archive/` or delete if trivial

Claude reads plans from here when executing — see `.claude/commands/` for commands that consume them. The `docs/superpowers/plans/` directory is a separate area for public-facing design docs; this directory is for internal, executable plans.
