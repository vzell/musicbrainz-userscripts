"""Probe Discogs' API without a token (2026-11-10) for four more discogs.com
pages (feature/dg-user-seller-search):

- a facet-only search (`/search?style_exact=Rock+%26+Roll`, `format_exact=`,
  `decade=1970&year=1975`, `sort=title,asc`): which of the site's parameters
  `database/search` can express — style, format, year are documented; decade
  and sort are not — compared by `pagination.items` with the site's own count
  (the saved page, debug/d-search.html, says 381,026 for "Rock & Roll");
- a user's contributions with the page's sort (`sort=label&sort_order=asc`);
- a user's submissions (642 in the API vs 638 on `/user/vzell/submissions`);
- a seller's inventory (`users/<name>/inventory`): public without a token?
  Which fields does a listing carry?

Prints status, pagination and a short shape per request, 2.6 s apart
(Discogs' unauthenticated limit is 25 a minute). No token is read or sent.

usage: python3 scripts/probe-dg-user-seller-search.py [--search-more | --listing ID]

--listing ID: one Marketplace listing (`marketplace/listings/<id>`, 2026-11-10:
the `/shop/item/<id>` page).

--search-more: only the second round (2026-11-10): sort by year and Have,
genre, country, a style given twice, an empty q.
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

AGENT = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
API = 'https://api.discogs.com'


def get(url):
    """One GET: (status, parsed JSON or None, rate-limit remaining)."""
    req = urllib.request.Request(url, headers={'User-Agent': AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode('utf-8')), r.headers.get('X-Discogs-Ratelimit-Remaining')
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode('utf-8'))
        except ValueError:
            body = None
        return e.code, body, e.headers.get('X-Discogs-Ratelimit-Remaining')
    except urllib.error.URLError as e:
        return 0, {'message': str(e.reason)}, None


def search(params):
    """A database/search URL for `params` (a list of pairs), 5 a page."""
    return f'{API}/database/search?{urllib.parse.urlencode(params + [("per_page", "5")])}'


def titles(d, n=5):
    """The first `n` result titles (search) or a listing's release titles (inventory)."""
    rows = d.get('results') or d.get('listings') or d.get('contributions') or []
    out = []
    for r in rows[:n]:
        rel = r.get('release') if isinstance(r.get('release'), dict) else None
        out.append(f"{(rel or r).get('title') or (rel or r).get('description')} [{(rel or r).get('year')}]")
    return out


def main():
    """Ask each URL once and summarise it."""
    style = [('style', 'Rock & Roll')]
    if '--listing' in sys.argv:
        lid = sys.argv[sys.argv.index('--listing') + 1]
        status, d, left = get(f'{API}/marketplace/listings/{lid}')
        print(f'== listing {lid}: HTTP {status}, rate limit left {left}')
        if isinstance(d, dict):
            print('   keys:', sorted(d.keys()))
            print('   release keys:', sorted((d.get('release') or {}).keys()))
            print('  ', json.dumps(d, ensure_ascii=False)[:2500])
        return 0
    if '--search-more' in sys.argv:
        cases = [
            ('search style + sort=year asc', search(style + [('sort', 'year'), ('sort_order', 'asc')])),
            ('search style + sort=year desc', search(style + [('sort', 'year'), ('sort_order', 'desc')])),
            ('search style + sort=have desc', search(style + [('sort', 'have'), ('sort_order', 'desc')])),
            ('search genre=Rock', search([('genre', 'Rock')])),
            ('search country=Germany', search([('country', 'Germany')])),
            ('search style twice (Rock & Roll, Rockabilly)', search(style + [('style', 'Rockabilly')])),
            ('search style Rockabilly alone', search([('style', 'Rockabilly')])),
            ('search q empty + style', search([('q', '')] + style)),
        ]
        return run(cases)
    cases = [
        ('search style', search(style)),
        ('search style + type=release', search(style + [('type', 'release')])),
        ('search style + decade=1970', search(style + [('decade', '1970')])),
        ('search style + year=1975', search(style + [('year', '1975')])),
        ('search style + year=1970-1979', search(style + [('year', '1970-1979')])),
        ('search style + sort=title asc', search(style + [('sort', 'title'), ('sort_order', 'asc')])),
        ('search style + sort=title desc', search(style + [('sort', 'title'), ('sort_order', 'desc')])),
        ('search format=Vinyl', search([('format', 'Vinyl')])),
        ('search year=1975 (no decade)', search([('year', '1975')])),
        ('contributions sort=label asc', f'{API}/users/vzell/contributions?sort=label&sort_order=asc&per_page=5'),
        ('contributions sort=label desc', f'{API}/users/vzell/contributions?sort=label&sort_order=desc&per_page=5'),
        ('submissions', f'{API}/users/vzell/submissions?per_page=5'),
        ('inventory disc-kid', f'{API}/users/disc-kid/inventory?per_page=3'),
        ('inventory disc-kid sort=price asc', f'{API}/users/disc-kid/inventory?per_page=3&sort=price&sort_order=asc'),
        ('inventory vzell (empty)', f'{API}/users/vzell/inventory?per_page=3'),
    ]
    return run(cases)


def run(cases):
    """Ask each (name, url) once, 2.6 s apart, and summarise it."""
    for i, (name, url) in enumerate(cases):
        if i:
            time.sleep(2.6)
        status, d, left = get(url)
        print(f'== {name}\n   {url}\n   HTTP {status}, rate limit left {left}')
        if not isinstance(d, dict):
            continue
        if 'pagination' in d:
            print('   pagination:', {k: d['pagination'].get(k) for k in ('page', 'pages', 'per_page', 'items')})
        if 'message' in d:
            print('   message:', d['message'])
        if name == 'submissions':
            s = d.get('submissions') or {}
            print('   kinds:', {k: len(v) for k, v in s.items() if isinstance(v, list)})
        for t in titles(d):
            print('   -', t)
        if name.startswith('inventory') and d.get('listings'):
            print('   listing[0] keys:', sorted(d['listings'][0].keys()))
            print('   listing[0]:', json.dumps(d['listings'][0], ensure_ascii=False)[:900])
    return 0


if __name__ == '__main__':
    sys.exit(main())
