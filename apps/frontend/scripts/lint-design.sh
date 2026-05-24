#!/usr/bin/env bash
# Design system compliance checks — enforces rules from UX_v3.md §23.2
# Run via: npm run lint:design
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
ERRORS=0

pass() { echo "  ✅  $1"; }
fail() { echo "  ❌  $1"; ERRORS=$((ERRORS + 1)); }

check_grep() {
  local desc="$1"; shift
  local matches
  matches=$(grep -rn "$@" "$SRC" 2>/dev/null || true)
  if [[ -n "$matches" ]]; then
    fail "$desc"
    echo "$matches" | head -8 | sed 's/^/      /'
  else
    pass "$desc"
  fi
}

echo ""
echo "Synapse design lint (UX_v3.md §23.2)"
echo "────────────────────────────────────"

# Raw hex colors in JSX/TS files (#abc123 or #abc)
check_grep "No raw hex colors" \
  --include="*.tsx" --include="*.ts" \
  -E '"[^"]*#[0-9a-fA-F]{6}[^"]*"|'\''[^'\'']*#[0-9a-fA-F]{6}[^'\'']*'\'''

# font-semibold / font-bold Tailwind classes (weight > 500)
# Excludes components/ui/ — shadcn vendored, do not modify (UX_v3.md §23.3)
check_grep "No font-weight >500 (font-semibold, font-bold)" \
  --include="*.tsx" \
  --exclude-dir="ui" \
  -E 'font-(semibold|bold|extrabold|black)\b'

# Raw font-weight: 600 or 700 in CSS/style props
check_grep "No fontWeight: 600/700 in style props" \
  --include="*.tsx" --include="*.ts" \
  -E 'fontWeight:\s*(600|700)\b'

# outline-none without a focus replacement
# Checks 5 surrounding lines for: focus-visible:ring, focus-visible:outline-none, or focus-within:ring
# (handles both same-element and container-focus patterns)
echo -n "  "
outline_errors=$(python3 - <<'PYEOF'
import re, sys
from pathlib import Path

src = Path("$SRC")
errors = []
ring_pat = re.compile(r'focus-visible:(outline-none|ring)|focus-within:ring')
outline_pat = re.compile(r'"[^"]*\boutline-none\b[^"]*"')

for f in sorted(src.rglob("*.tsx")):
    lines = f.read_text(errors="replace").splitlines()
    for i, line in enumerate(lines):
        if outline_pat.search(line):
            context = "\n".join(lines[max(0, i - 5):i + 2])
            if not ring_pat.search(context):
                rel = str(f).replace("$SRC/", "")
                errors.append(f"      {f}:{i + 1}: {line.strip()[:100]}")

for e in errors[:8]:
    print(e)
sys.exit(1 if errors else 0)
PYEOF
)
outline_exit=$?
if [[ $outline_exit -ne 0 ]]; then
  fail "No bare outline-none (must pair with focus-visible:ring or focus-within:ring on parent)"
  echo "$outline_errors"
else
  pass "No bare outline-none (must pair with focus-visible:ring or focus-within:ring on parent)"
fi

# type: "spring" in animation objects (belt-and-suspenders over ESLint rule)
check_grep 'No type:"spring" in motion configs' \
  --include="*.tsx" --include="*.ts" \
  -E 'type\s*:\s*['"'"'"](spring)['"'"'"]'

# Animating forbidden CSS properties via Framer Motion animate prop
check_grep "No animated width/height/margin/padding in animate=" \
  --include="*.tsx" \
  -E 'animate=\{\{[^}]*(width|height|margin|padding):'

# Source Serif 4 on non-allowed surfaces (font-serif class outside allowed files)
check_grep "No font-serif on UI chrome (allowed: Cornell, Feynman, PDF, FlashcardReview, Landing hero only)" \
  --include="*.tsx" \
  -E '\bfont-serif\b' \
  --exclude="*CornellLayout*" \
  --exclude="*FeynmanSession*" \
  --exclude="*PdfReader*" \
  --exclude="*FlashcardReview*" \
  --exclude="*HeroSection*" \
  --exclude="*layout.tsx*"

# Hardcoded pixel values in className strings (only 1px borders and 16/20/24px icons allowed)
# This is a softer warning — too noisy to be an error
echo ""
echo "  ⚠️  Soft check: raw px in className (review manually)"
grep -rn --include="*.tsx" -oE '\b(2|3|4|5|6|7|8|9|10|11|12|14|16|18|20|24|28|32)px\b' "$SRC" 2>/dev/null \
  | grep -v "stroke-width\|border\|icon\|//\|\.css" \
  | head -5 \
  | sed 's/^/      /' || true

echo ""
echo "────────────────────────────────────"
if [[ $ERRORS -gt 0 ]]; then
  echo "  Design lint: $ERRORS violation(s). Fix before committing."
  exit 1
else
  echo "  Design lint: all checks passed."
fi
