#!/usr/bin/env bash
# Copy EVERY stats:<song>-tour page from the slow NAS mirror into
# debug/bb-mirror/stats-tour/ (gitignored; vzell syncs debug/ between machines),
# so Phase 13 batch 2's tour reader runs over the whole family before its specs
# (org/brucebase.org Phase 13; scripts/check-bb-stats-tours.js reads the copy).
# The batch-1 sample in debug/bb-mirror/stats/ is left as it is.
set -euo pipefail
SRC=/home/vzell/git/scripts/BruceParser/bb/latest
DST="$(dirname "$0")/../debug/bb-mirror/stats-tour"
mkdir -p "$DST"
for f in "$SRC"/stats/stats_*-tour.html; do
    cp --update=none "$f" "$DST/"
done
ls "$DST" | wc -l
