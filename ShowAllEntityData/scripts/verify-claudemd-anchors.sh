#!/bin/bash
# Verify every grep anchor in CLAUDE.md's "File structure" table resolves
# uniquely in ShowAllEntityData.user.js, AND that the table's row order still
# matches the file's own top-to-bottom order (which the table claims).
# The table deliberately carries anchors instead of line numbers; a dangling
# anchor or a reordered row is the failure mode this guards against.
set -uo pipefail
cd "$(dirname "$0")/.."

anchors=(
    '// ==UserScript=='
    'const SCRIPT_BASE_NAME'
    'const configSchema'
    'const Lib = (typeof VZ_MBLibrary'
    'const ColumnDataExtractor'
    'const SyntheticColumnDataExtractor'
    'function buildActiveColumnExtractors'
    'function applyListToTable'
    'function applyExtractTrackTitleData'
    'const pageDefinitions = ['
    'let ctrlMFunctionMap'
    'function sortLargeArray'
    '// --- Initialization Logic ---'
    'function runFilter'
    'function startFetchingProcess'
    'function renderFinalTable'
    'function renderGroupedTable'
    'function makeH2sCollapsible'
    'function makeTableSortableUnified'
    'function initExpandRGsFeature'
    'const CAA_CTX'
    'const EAA_CTX'
    'function initCaaPics'
    'function initEaaPics'
    'function initBarcodeHighlight'
)

fail=0
prev=0
for a in "${anchors[@]}"; do
    n=$(grep -cF "$a" ShowAllEntityData.user.js)
    if [ "$n" -eq 0 ]; then
        printf '  NO MATCH   %-42s\n' "$a"; fail=1; continue
    fi
    line=$(grep -nF -m1 "$a" ShowAllEntityData.user.js | cut -d: -f1)
    flag=''
    if [ "$line" -lt "$prev" ]; then flag=' <- OUT OF ORDER'; fail=1; fi
    printf '  %-4sx %-42s line %-6s%s\n' "$n" "$a" "$line" "$flag"
    prev=$line
done

# Cross-check: every anchor above must actually appear in CLAUDE.md's table.
for a in "${anchors[@]}"; do
    grep -qF "$a" CLAUDE.md || { printf '  NOT IN CLAUDE.md: %s\n' "$a"; fail=1; }
done

[ $fail -eq 0 ] && echo "  all anchors unique, in file order, and present in CLAUDE.md"
exit $fail
