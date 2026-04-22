---
description: Full build + test verification — produces definitive dist/ artifact
allowed-tools: Bash
---

Run the full verification chain and report results concisely.

1. `bun run build` — compile + copy assets
2. `bun test` — run vitest suite
3. `ls -la dist/` — confirm artifact exists

If any step fails, stop and report the failure with the relevant error excerpt. If all pass, report: build OK, N tests passed, artifact size.
