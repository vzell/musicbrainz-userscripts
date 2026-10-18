"""Probe what Discogs' API says about a user without a token (2026-10-18), for
a `dg-user` pageType and the user reader: the profile, and the lists a
user's page could be a table of — contributions and submissions (documented
under "User Identity"/"User Collection"? as GET /users/<name>/contributions
and /users/<name>/submissions), the collection (public only when the user
made it so), the wantlist, and the lists.

Prints status, pagination and the first row's shape. No token is read or
sent.

usage: python3 scripts/probe-discogs-user.py [username]
"""
import json
import sys
import urllib.error
import urllib.request

AGENT = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'


def get(url):
    """One GET: (status, parsed JSON or None, rate-limit headers)."""
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


def main():
    """Ask each endpoint once and summarise it."""
    user = sys.argv[1] if len(sys.argv) > 1 else 'vzell'
    base = f'https://api.discogs.com/users/{user}'
    for name, url in [
        ('profile', base),
        ('contributions', f'{base}/contributions?per_page=5&sort=added&sort_order=desc'),
        ('submissions', f'{base}/submissions?per_page=5'),
        ('collection (all folder)', f'{base}/collection/folders/0/releases?per_page=5'),
        ('wantlist', f'{base}/wants?per_page=5'),
        ('lists', f'{base}/lists?per_page=5'),
    ]:
        status, d, left = get(url)
        print(f'== {name}: {url}\n   HTTP {status}, rate limit left {left}')
        if not isinstance(d, dict):
            continue
        if 'pagination' in d:
            print('   pagination:', {k: d['pagination'].get(k) for k in ('page', 'pages', 'per_page', 'items')})
        keys = [k for k in d if k != 'pagination']
        print('   keys:', keys)
        for k in keys:
            v = d[k]
            if isinstance(v, list) and v:
                print(f'   {k}[0]:', json.dumps(v[0], ensure_ascii=False)[:700])
            elif isinstance(v, dict):
                for kk, vv in v.items():
                    if isinstance(vv, list):
                        print(f'   {k}.{kk}: {len(vv)} rows', json.dumps(vv[0], ensure_ascii=False)[:500] if vv else '')
        if name == 'profile':
            print('   ', json.dumps({k: d.get(k) for k in ('username', 'name', 'location', 'registered', 'rank', 'releases_contributed',
                                                         'num_pending', 'num_collection', 'num_wantlist', 'num_lists', 'releases_rated',
                                                         'rating_avg', 'profile', 'home_page')}, ensure_ascii=False))
        if 'message' in d:
            print('   message:', d['message'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
