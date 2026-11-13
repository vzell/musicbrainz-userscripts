#!/usr/bin/env bash
# Copy a spread sample (every k-th page, up to N) of each Brucebase page
# family that has no copy in debug/bb-mirror/<kind>/ yet, from the slow NAS
# mirror (gitignored; vzell syncs debug/ between machines), for
# org/brucebase.org Phase 16 (recheck what our readers miss):
# scripts/probe-bb-reader-sweep.js reads the copies.
#
#   scripts/copy-bb-sweep-samples.sh [N]      (default 40)
set -euo pipefail
N="${1:-40}"
SRC=/home/vzell/git/scripts/BruceParser/bb/latest
DST="$(dirname "$0")/../debug/bb-mirror"
for k in story content ref study multi soundcheck nobruce eye news offstage gallery media gignote recnote; do
    mkdir -p "$DST/$k"
    have=$(find "$DST/$k" -name '*.html' | wc -l)
    [ "$have" -ge "$N" ] && { echo "$k: $have already"; continue; }
    mapfile -t all < <(ls "$SRC/$k" | grep '\.html$' | sort)
    total=${#all[@]}
    step=$(( total > N ? total / N : 1 ))
    for (( i = 0; i < total && i / step < N; i += step )); do
        cp --update=none "$SRC/$k/${all[$i]}" "$DST/$k/"
    done
    echo "$k: $(find "$DST/$k" -name '*.html' | wc -l) of $total"
done
