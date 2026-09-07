#!/bin/bash
# Rewrite live references to the two renamed docs:
#   debug/NOTES.md                  -> DEBUG-NOTES.md
#   pageTypes-testing-reference.org -> PAGETYPES-TESTING-REFERENCE.org
#
# Deliberately EXCLUDED (see the plan / CLAUDE.md rationale):
#   - ShowAllEntityData_CHANGELOG.json — 7 entries describe already-shipped
#     versions; rewriting them would falsify the historical record.
#   - ../README.org — a raw session transcript, not documentation.
#   - CLAUDE.md's own "pageTypes-testing-reference.org" mention, which is
#     hard-wrapped across a newline and is rewritten by hand instead.
#
# Idempotent: re-running after a successful pass changes nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

NOTES_FILES=(
    ShowAllEntityData.user.js
    CLAUDE.md
    PERFORMANCE.org
    .claude/skills/add-pagetype-from-html/SKILL.md
    .claude/skills/fix-highlight-alignment-gap/SKILL.md
    tests/live/artist-releases-filter-sort.spec.js
    tests/live/caa-icon-survives-sort-multi.spec.js
    tests/live/save-to-disk-strips-live-artwork.spec.js
    tests/live/registry.org
    tests/fixtures/report-multiple-linked-collaboration.spec.js
    tests/fixtures/search-recordings-continuation.spec.js
    tests/support/bodeansArtistReleasesFixture.js
)

PAGETYPES_FILES=(
    ShowAllEntityData.user.js
    .claude/skills/add-snapshot-pagetype/SKILL.md
    .claude/skills/add-live-behavior-test/SKILL.md
    tests/live/registry.org
)

echo "== debug/NOTES.md -> DEBUG-NOTES.md =="
for f in "${NOTES_FILES[@]}"; do
    before=$(grep -c 'debug/NOTES\.md' "$f" || true)
    sed -i 's|debug/NOTES\.md|DEBUG-NOTES.md|g' "$f"
    after=$(grep -c 'debug/NOTES\.md' "$f" || true)
    printf '  %-58s %s -> %s\n' "$f" "$before" "$after"
done

echo "== pageTypes-testing-reference.org -> PAGETYPES-TESTING-REFERENCE.org =="
for f in "${PAGETYPES_FILES[@]}"; do
    before=$(grep -c 'pageTypes-testing-reference\.org' "$f" || true)
    sed -i 's|pageTypes-testing-reference\.org|PAGETYPES-TESTING-REFERENCE.org|g' "$f"
    after=$(grep -c 'pageTypes-testing-reference\.org' "$f" || true)
    printf '  %-58s %s -> %s\n' "$f" "$before" "$after"
done
