"""Probe Discogs' master versions endpoint, the one request behind a master's
"Versions" in the Discogs window (_extDiscogsVersionsLoad(), 2026-10-17).

What it checks, without a token (what a user without one gets):
- `per_page` is capped: asking for 100 and for 500 gives the same page size;
- how many pages a master needs (`pagination.pages`, `pagination.items`);
- the size of one page and the rate-limit headers Discogs sends;
- the fields of one version row;
- the counts page 1 carries for ALL versions (`filters.available`).

Result 2026-10-17 (master 26725, Born To Run): per_page capped at 100;
387 versions = 4 pages of ~76 KB; X-Discogs-Ratelimit 25; facets format,
label, country, released.

usage: python3 scripts/probe-discogs-versions.py [master_id]
"""
import json
import sys
import time
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'


def get(url):
    """GET one URL; returns (status, Discogs headers, bytes, parsed JSON)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
        heads = {k: v for k, v in r.headers.items() if k.lower().startswith('x-discogs')}
        return r.status, heads, len(body), json.loads(body)


def main():
    """Run the probe for one master and print what it found."""
    master = sys.argv[1] if len(sys.argv) > 1 else '26725'
    for per_page in (100, 500):
        status, heads, size, d = get(f'https://api.discogs.com/masters/{master}/versions?per_page={per_page}&page=1')
        print(f'per_page={per_page}: HTTP {status}, {size} bytes, rows {len(d.get("versions", []))}, '
              f'pagination {d.get("pagination", {}).get("pages")} pages / {d.get("pagination", {}).get("items")} items, {heads}')
        time.sleep(2.6)
    print('row fields:', sorted(d['versions'][0].keys()))
    print('facets:', {k: len(v) for k, v in (d.get('filters', {}).get('available') or {}).items()})


if __name__ == '__main__':
    main()
