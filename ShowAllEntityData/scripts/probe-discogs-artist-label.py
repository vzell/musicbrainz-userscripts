"""Probe Discogs' artist and label release lists, the requests behind the
Discogs artist and label windows (_extDgListLoad(), 2026-10-18; mockup
https://claude.ai/artifact/WuBNbFTgNHJtxip4xBv6yc).

What it checks, without a token (what a user without one gets):
- `artists/<id>/releases?sort=year&sort_order=asc&per_page=100`: how many
  rows and pages, the fields of a row, and the ORDER of the roles (the
  window fills its sections by role, and a section is complete once a later
  role has arrived);
- `labels/<id>/releases?sort=year&sort_order=desc|asc&per_page=100`: how
  many rows, that both orders work, the fields of a row;
- the rate-limit headers Discogs sends.

Result 2026-10-17 (artist 219986 Bruce Springsteen, all 68 pages; label
1866 Columbia): artist 6,782 rows, ordered by role, then year: Main (pages
1-4), Producer 78 and Co-producer 2 (pages 4-5), Appearance (5-33),
TrackAppearance (33-48), UnofficialRelease (48-68). A row is a master
(`type` master, `main_release`, no format or label) or a release (`format`,
`label`), with `year`, `thumb`, `artist`, `role`, `stats.community`. Label
396,608 releases (3,967 pages), releases only, no masters; both orders
answer. X-Discogs-Ratelimit 25.

usage:
  python3 scripts/probe-discogs-artist-label.py artist [id] [--all]
  python3 scripts/probe-discogs-artist-label.py label [id]
  python3 scripts/probe-discogs-artist-label.py scan id [id ...]
"""
import json
import sys
import time
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
SPACING_S = 2.6
_last = [0.0]


def get(url):
    """GET one URL, 2.6 s after the last; returns (status, Discogs headers, bytes, parsed JSON)."""
    wait = _last[0] + SPACING_S - time.time()
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
        heads = {k: v for k, v in r.headers.items() if k.lower().startswith('x-discogs')}
        return r.status, heads, len(body), json.loads(body)


def artist_url(aid, page):
    """The artist list's page as the window asks for it."""
    return f'https://api.discogs.com/artists/{aid}/releases?sort=year&sort_order=asc&per_page=100&page={page}'


def role_runs(rows):
    """The runs of one role in list order: [(role, first row, last row, count)]."""
    runs = []
    for i, r in enumerate(rows):
        role = r.get('role', '')
        if runs and runs[-1][0] == role:
            runs[-1][2] = i
            runs[-1][3] += 1
        else:
            runs.append([role, i, i, 1])
    return runs


def artist(aid, all_pages, cap=None):
    """Page 1 (or every page) of an artist's list: counts, fields, role runs."""
    status, heads, size, d = get(artist_url(aid, 1))
    p = d.get('pagination', {})
    pages = p.get('pages', 1)
    print(f'artist {aid}: HTTP {status}, {size} bytes, {p.get("items")} rows, {pages} pages, {heads}')
    rows = list(d.get('releases', []))
    if rows:
        print('  row fields:', sorted(rows[0].keys()))
        print('  types:', sorted({r.get('type') for r in rows}))
    last = pages if all_pages else 1
    if cap:
        last = min(last, cap)
    for page in range(2, last + 1):
        rows += get(artist_url(aid, page))[3].get('releases', [])
    for role, a, b, n in role_runs(rows):
        print(f'  {role:18} rows {a:5}-{b:5}  pages {a // 100 + 1}-{b // 100 + 1}  ({n})')
    return pages


def label(lid):
    """Page 1 of a label's list in both orders."""
    for order in ('desc', 'asc'):
        url = f'https://api.discogs.com/labels/{lid}/releases?sort=year&sort_order={order}&per_page=100&page=1'
        status, heads, size, d = get(url)
        p = d.get('pagination', {})
        rows = d.get('releases', [])
        years = [r.get('year') for r in rows if r.get('year')]
        print(f'label {lid} {order}: HTTP {status}, {size} bytes, {p.get("items")} rows, {p.get("pages")} pages, '
              f'years {years[:1]}..{years[-1:]}, {heads}')
        if rows:
            print('  row fields:', sorted(rows[0].keys()), 'types:', sorted({r.get('type') for r in rows}))


def main():
    """Run the probe named on the command line."""
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    mode = args[0] if args else 'artist'
    if mode == 'artist':
        artist(args[1] if len(args) > 1 else '219986', '--all' in sys.argv)
    elif mode == 'label':
        label(args[1] if len(args) > 1 else '1866')
    elif mode == 'scan':
        for aid in args[1:]:
            artist(aid, True, cap=6)
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
