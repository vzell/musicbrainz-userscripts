#!/usr/bin/env bash
# Copy every event page of one year (gig, nogig, rehearsal, recording,
# interview) and the year page itself from the slow NAS mirror into
# debug/bb-mirror/year-<YYYY>/ (gitignored; vzell syncs debug/ between
# machines), for org/brucebase.org Phase 14 (the year table's columns from
# each event's page): scripts/probe-bb-year-events.py reads the copy.
#
#   scripts/copy-bb-year-events.sh 1978
set -euo pipefail
YEAR="${1:?usage: $0 YYYY}"
SRC=/home/vzell/git/scripts/BruceParser/bb/latest
DST="$(dirname "$0")/../debug/bb-mirror/year-$YEAR"
mkdir -p "$DST"
cp --update=none "$SRC/$YEAR.html" "$DST/"
for k in gig nogig rehearsal recording interview; do
    for f in "$SRC/$k/${k}_$YEAR"-*.html; do
        [ -e "$f" ] && cp --update=none "$f" "$DST/"
    done
done
ls "$DST" | wc -l
