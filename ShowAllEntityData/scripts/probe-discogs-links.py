"""Probe the endpoints behind the Discogs window's links (2026-10-18):

- a user's public profile: https://api.discogs.com/users/<name> (no token);
- Discogs' database search without a token (documented as "authentication
  required": what does it answer?);
- a support.discogs.com article: the HTML page, and Zendesk's Help Center
  API (`/api/v2/help_center/articles/<id>.json`), which Discogs' help centre
  runs on (its URLs are /hc/articles/<id>-<slug>).

Prints status, content type, size and the fields a reader would use. No token
is read or sent.

usage: python3 scripts/probe-discogs-links.py
"""
import json
import sys
import urllib.error
import urllib.request

AGENT = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
URLS = [
    ('user', 'https://api.discogs.com/users/GuiBeal'),
    ('search, no token', 'https://api.discogs.com/database/search?q=Columbia&type=label&per_page=5'),
    ('support page', 'https://support.discogs.com/hc/articles/360005006654-Database-Guidelines-6-Format'),
    ('support API', 'https://support.discogs.com/api/v2/help_center/articles/360005006654.json'),
    ('support API, en-us', 'https://support.discogs.com/api/v2/help_center/en-us/articles/360005006654.json'),
]


def get(url):
    """One GET: (status, content type, headers, body text)."""
    req = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': '*/*'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers.get('content-type', ''), dict(r.headers), r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('content-type', ''), dict(e.headers), e.read().decode('utf-8', 'replace')


def main():
    """Ask each URL once and summarise the answer."""
    for name, url in URLS:
        try:
            status, ctype, headers, body = get(url)
        except Exception as e:  # noqa: BLE001 - a probe reports any failure
            print(f'== {name}: {url}\n   failed: {e}')
            continue
        print(f'== {name}: {url}\n   HTTP {status}, {ctype}, {len(body)} chars, cf-mitigated={headers.get("cf-mitigated", "")!r}')
        if 'json' in ctype:
            try:
                d = json.loads(body)
            except ValueError:
                print('   not JSON')
                continue
            if 'article' in d:
                a = d['article']
                print('   article keys:', sorted(a.keys()))
                print('   title:', a.get('title'), '| updated:', a.get('updated_at'), '| body chars:', len(a.get('body') or ''))
                print('   body start:', (a.get('body') or '')[:300].replace('\n', ' '))
                print('   anchor 6.12.2 present:', 'id="6.12.2"' in (a.get('body') or '') or 'name="6.12.2"' in (a.get('body') or ''))
            else:
                print('   keys:', sorted(d.keys())[:40])
                print('   sample:', json.dumps({k: d[k] for k in list(d)[:18]}, ensure_ascii=False)[:900])
        else:
            print('   start:', body[:200].replace('\n', ' '))
    return 0


if __name__ == '__main__':
    sys.exit(main())
