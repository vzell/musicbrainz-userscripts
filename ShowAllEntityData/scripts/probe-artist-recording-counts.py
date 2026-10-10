"""Size candidate artists for the artist-recordings perf fixture.

For each name: WS/2 artist search (top hit), then one recording browse with
limit=1 for its `recording-count`, and the share of a sample page of 100
recordings that carries a performance relation (inc=work-rels) — the
fixture should exercise the "Recording of" column, not only empty cells.

The fixture must stay under `sa_render_threshold` (5000 rows), or the capture
pops showRenderDecisionDialog(), which no helper can clear. The browse count
includes recordings the page's ?all=1 view also lists, so it is the number to
size by; confirm the final pick with scripts/probe-pagetype-row-count.js.

Requests are spaced >= 1.1 s; 503s retried.

usage: python3 scripts/probe-artist-recording-counts.py "Nils Lofgren" "Southside Johnny & The Asbury Jukes"
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 ( volker.zell@opitz-consulting.com )'
BASE = 'https://musicbrainz.org/ws/2'
_last = [0.0]


def fetch(url, tries=5):
    """GET JSON, spaced >= 1.1 s, retried on 503/502/429."""
    for attempt in range(tries):
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503):
                return None
        except Exception:                                    # noqa: BLE001
            pass
        time.sleep(2 * (attempt + 1))
    return None


def main():
    """Prints one line per candidate."""
    for name in sys.argv[1:]:
        q = urllib.parse.quote(f'artist:"{name}"')
        hits = (fetch(f'{BASE}/artist?query={q}&limit=1&fmt=json') or {}).get('artists') or []
        if not hits:
            print(f'{name}: not found')
            continue
        a = hits[0]
        page = fetch(f'{BASE}/recording?artist={a["id"]}&inc=work-rels&limit=100&fmt=json') or {}
        recs = page.get('recordings') or []
        perf = sum(1 for r in recs if any(x.get('type') == 'performance' for x in r.get('relations') or []))
        print(f'{a["name"]} ({a["id"]}): recording-count={page.get("recording-count")}, '
              f'{perf}/{len(recs)} of a sample page have a performance relation')


if __name__ == '__main__':
    main()
