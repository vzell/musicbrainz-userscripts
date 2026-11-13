#!/usr/bin/env bash
# Copy the Brucebase stats pages Phase 13 surveys from the slow NAS mirror into
# debug/bb-mirror/stats/ (gitignored; vzell syncs debug/ between machines).
# Every page outside the three big families, all of awards-* and *studio-sessions*
# (stats:on-the-tracks links them), every 50th *-tour page, and content:files.
set -euo pipefail
SRC=/home/vzell/git/scripts/BruceParser/bb/latest
DST="$(dirname "$0")/../debug/bb-mirror/stats"
mkdir -p "$DST"
cd "$SRC/stats"
n=0
for f in stats_*.html; do
    case "$f" in
        *-tour.html) n=$((n + 1)); [ $((n % 50)) -eq 1 ] || continue ;;
    esac
    [ -s "$DST/$f" ] || cp "$f" "$DST/$f"
done
for f in "$SRC"/content/content_files*.html; do
    [ -e "$f" ] && cp --update=none "$f" "$DST/" || true
done
ls "$DST" | wc -l
