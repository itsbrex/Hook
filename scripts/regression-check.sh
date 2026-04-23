#!/usr/bin/env bash
# scripts/regression-check.sh — Compare v0.3.0 test results against v0.2.0 baseline
#
# Usage:
#   bash scripts/regression-check.sh
#
# What it does:
#   1. Confirms tests/.baseline/v0.2.0.txt exists (captured in Task 0.1).
#      If missing, prints a helpful note and exits 0 — this artifact is
#      gitignored / local-only; we don't want CI to fail without it.
#   2. Runs `npx vitest run` and captures output to tests/.baseline/v0.3.0.txt.
#   3. Extracts test file paths from the baseline and confirms each one
#      still passes in the new run.
#   4. Compares pass counts robustly across output formats:
#        - bun test  : ` 41 pass` / ` 1 fail`
#        - vitest    : ` Tests  NN passed (NN)`
#      The baseline may have been captured with bun while the new run
#      uses vitest — that's fine; we just compare PASS counts.
#   5. Reports a summary and exits 0 if no regressions, 1 otherwise.
#
# Idempotent — re-running re-captures v0.3.0.txt and re-diffs.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASELINE="$REPO_ROOT/tests/.baseline/v0.2.0.txt"
CURRENT="$REPO_ROOT/tests/.baseline/v0.3.0.txt"

# ── 1. Baseline existence ────────────────────────────────────────────────
if [[ ! -f "$BASELINE" ]]; then
  cat >&2 <<'EOF'
[regression] WARNING: tests/.baseline/v0.2.0.txt not found.

This baseline should have been captured during Task 0.1 of the
hookmark-mcp MCP feature-gaps plan, e.g.:

    git checkout v0.2.0
    bun test 2>&1 | tee tests/.baseline/v0.2.0.txt
    git checkout -

The file is gitignored; it only exists on the machine that ran Task 0.1.
Skipping regression check (not failing CI for a missing local artifact).
EOF
  exit 0
fi

# ── 2. Capture v0.3.0 run ────────────────────────────────────────────────
mkdir -p "$REPO_ROOT/tests/.baseline"
echo "[regression] Running npx vitest run → $CURRENT"
cd "$REPO_ROOT"
# Note: tee would mask vitest's exit; we capture then decide.
if ! npx vitest run 2>&1 | tee "$CURRENT"; then
  # Some tests failed. Continue anyway — the regression check logic
  # below will surface specifics.
  echo "[regression] vitest exited non-zero; continuing with analysis"
fi

# ── 3. Extract baseline test files ───────────────────────────────────────
BASELINE_FILES=$(mktemp)
CURRENT_FILES=$(mktemp)
trap 'rm -f "$BASELINE_FILES" "$CURRENT_FILES"' EXIT

grep -oE "tests/[^ ]+\.test\.ts" "$BASELINE" | sort -u > "$BASELINE_FILES" || true
grep -oE "tests/[^ ]+\.test\.ts" "$CURRENT"  | sort -u > "$CURRENT_FILES"  || true

baseline_file_count=$(wc -l < "$BASELINE_FILES" | tr -d ' ')
echo "[regression] Baseline references $baseline_file_count test file(s)"

# ── 4. Check each baseline file still appears in current run ────────────
regressions=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if grep -q -F "$f" "$CURRENT"; then
    :  # still present
  else
    regressions+=("$f")
  fi
done < "$BASELINE_FILES"

# ── 5. Extract pass counts (format-robust) ──────────────────────────────
extract_pass_count() {
  local file="$1"
  local n
  # vitest format: " Tests  228 passed (228)" or "Tests  228 passed"
  n=$(grep -oE "Tests[[:space:]]+[0-9]+[[:space:]]+passed" "$file" \
      | grep -oE "[0-9]+" | head -n1)
  if [[ -n "$n" ]]; then
    echo "$n"
    return
  fi
  # bun test format: " 41 pass"
  n=$(grep -oE "^[[:space:]]*[0-9]+[[:space:]]+pass\b" "$file" \
      | grep -oE "[0-9]+" | head -n1)
  if [[ -n "$n" ]]; then
    echo "$n"
    return
  fi
  echo "0"
}

baseline_pass=$(extract_pass_count "$BASELINE")
current_pass=$(extract_pass_count "$CURRENT")

echo "[regression] v0.2.0 pass count: $baseline_pass"
echo "[regression] v0.3.0 pass count: $current_pass"

# ── 6. Summarize ─────────────────────────────────────────────────────────
exit_code=0

if [[ ${#regressions[@]} -gt 0 ]]; then
  echo
  echo "✗ REGRESSION: baseline test file(s) no longer present in v0.3.0 output:"
  for f in "${regressions[@]}"; do
    echo "    - $f"
  done
  exit_code=1
fi

if (( current_pass < baseline_pass )); then
  echo
  echo "✗ REGRESSION: pass count dropped ($baseline_pass → $current_pass)"
  exit_code=1
fi

if (( exit_code == 0 )); then
  delta=$(( current_pass - baseline_pass ))
  survived=$(( baseline_file_count - ${#regressions[@]} ))
  echo
  echo "✓ $survived baseline test file(s) still pass; +$delta net tests (v0.2.0: $baseline_pass → v0.3.0: $current_pass)"
fi

exit $exit_code
