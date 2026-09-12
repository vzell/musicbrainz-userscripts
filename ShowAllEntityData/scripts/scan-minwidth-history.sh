#!/bin/bash
# When did initCollapsableColumns()'s min-width ratchet exist?
# Checks each commit that touched the userscript for the two anchors:
#   (a) the first-<li> measurement reading li.scrollWidth
#   (b) the one-way `minPx > existingMin` application
set -u
cd "$(dirname "$0")/.."
for c in $(git log --format=%h --reverse -- ShowAllEntityData.user.js ShowAllEntityData/ShowAllEntityData.user.js); do
    body=$(git show "$c:ShowAllEntityData/ShowAllEntityData.user.js" 2>/dev/null \
        || git show "$c:ShowAllEntityData.user.js" 2>/dev/null) || continue
    a=$(printf '%s' "$body" | grep -c 'maxFirstLiWidth, li.scrollWidth')
    b=$(printf '%s' "$body" | grep -c 'minPx > existingMin')
    printf '%s  measure=%s  oneway=%s  %s\n' \
        "$(git log -1 --format='%ad %h' --date=short "$c")" "$a" "$b" \
        "$(git log -1 --format='%s' "$c" | cut -c1-58)"
done
