#!/bin/bash
# Verify the file paths, skill names and DOM ids that CLAUDE.md and
# tests/README.org reference actually exist. A doc that names a moved or
# renamed thing is a defect even though nothing fails at runtime.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

check_file() { [ -e "$1" ] && printf '  OK   %s\n' "$1" || { printf '  MISS %s\n' "$1"; fail=1; }; }
check_str()  { grep -qF "$2" "$1" && printf '  OK   %-34s in %s\n' "$2" "$1" \
                || { printf '  MISS %-34s in %s\n' "$2" "$1"; fail=1; }; }

echo "--- files/dirs named in the docs ---"
for f in DEBUG-NOTES.md PAGETYPES-TESTING-REFERENCE.org PERFORMANCE.org \
         REFACTORING.org forum.org tests/README.org tests/pagetypes.json \
         tests/live/registry.org tests/snapshots/registry.org \
         tests/support/customDialog.js tests/support/authState.js \
         tests/support/liveAssertions.js tests/support/gmStubs.js \
         tests/support/realNetworkGmXhr.js tests/support/diskFixture.js \
         tests/support/subtableTab.js tests/support/run-live-interop.js \
         tests/support/capture-snapshots.js tests/support/capture-fixture.js \
         tests/support/capture-interaction-perf.js \
         tests/fixtures/live-userscripts/README.md \
         tests/fixtures/live-userscripts/manifest.json \
         debug/annotations.html debug/therising.html debug/double-ars.html \
         debug/adjust-mainColumn-extractor.org \
         tests/snapshots/artist-events tests/snapshots/artist-releasegroups \
         .claude/skills/register-live-userscript \
         .claude/skills/run-perf-comparison; do
    check_file "$f"
done

echo "--- perf baselines the docs point at ---"
ls tests/snapshots/artist-events/interaction-perf-*.json >/dev/null 2>&1 \
    && printf '  OK   interaction-perf-*.json (%s)\n' "$(ls tests/snapshots/artist-events/interaction-perf-*.json | wc -l)" \
    || { printf '  MISS interaction-perf-*.json\n'; fail=1; }
ls tests/snapshots/artist-releasegroups/perf-baseline*.json >/dev/null 2>&1 \
    && printf '  OK   perf-baseline*.json (%s)\n' "$(ls tests/snapshots/artist-releasegroups/perf-baseline*.json | wc -l)" \
    || { printf '  MISS perf-baseline*.json\n'; fail=1; }

echo "--- DOM ids / selectors the docs name ---"
for id in mb-dialog-save mb-dialog-render mb-dialog-cancel \
          mb-info-display-caa mb-master-toggle mb-caa-sort-key \
          mb-eaa-sort-key mb-inline-art-sort-key mb-cancelled-sort-key; do
    check_str ShowAllEntityData.user.js "$id"
done

# The global artwork-strip ids are CONSTRUCTED (`ctx.btnPrefix + '-global'`),
# so they never appear as literals. Check the two prefixes instead — that is
# what actually has to hold for #mb-caa-toggle-btn-global to exist at runtime.
check_str ShowAllEntityData.user.js "btnPrefix:     'mb-caa-toggle-btn'"
check_str ShowAllEntityData.user.js "btnPrefix:     'mb-eaa-toggle-btn'"
check_str ShowAllEntityData.user.js "ctx.btnPrefix + '-global'"

echo "--- settings keys the docs name ---"
for k in sa_max_page sa_render_threshold sa_render_warning_threshold \
         sa_chunked_render_threshold sa_caa_pics_initially_collapsed \
         sa_enable_expand_rgs sa_enable_caa_pics; do
    check_str ShowAllEntityData.user.js "$k"
done

echo "--- env vars tests/README.org documents ---"
for v in SINGLE_CAA_SETTLE_MS MULTI_CAA_SETTLE_MS MERGED_CAA_SETTLE_MS \
         SAVE_ART_SETTLE_MS TEST_PREFILTER_LOAD TEST_COLVIS SAVE_HTML; do
    if grep -rqF "$v" tests/; then printf '  OK   %s\n' "$v"; else printf '  MISS %s\n' "$v"; fail=1; fi
done

[ $fail -eq 0 ] && echo "ALL CROSS-REFERENCES RESOLVE"
exit $fail
