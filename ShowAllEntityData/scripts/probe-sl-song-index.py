#!/usr/bin/env python3
"""Read-only probe: springsteenlyrics.com's whole lyrics index, title -> slug.

The SL item pages' tracklists name songs by title only ("A2- 4TH OF JULY,
ASBURY PARK (SANDY)"); a song's page is `lyrics.php?song=SLUG`. This fetches
the index (the landing page `lyrics.php`, then every letter page it links,
`lyrics.php?cmd=list&letter=X`, one request per ~1.2 s, logged out) and
reports how well a slug RULE derives a song's slug from its title:

  rule "plain":  lower-case, keep [a-z0-9] only
  rule "paren":  the same after dropping a trailing "(...)"

A line's slug is a song's BASE slug when it has no "_" (versions carry
suffixes: `_1978-07-07`, `_original`, `_outtake1`, `_cov-<artist>`, ...).

Writes the index to the JSON given as first argument (default
debug/sl-song-index.json) and prints the counts plus every base title the
"paren" rule gets wrong (the exception list), and duplicate base titles.

Usage:
    python3 scripts/probe-sl-song-index.py [out.json]
"""

import html
import json
import re
import sys
import time
import urllib.request

ROOT = 'https://www.springsteenlyrics.com/'
GAP_S = 1.2
LETTER_RE = re.compile(r'href="(lyrics\.php\?cmd=list&(?:amp;)?letter=([^"&]+))"')
LINE_RE = re.compile(
    r'<span class="monospaced">\s*<i class="([^"]*)"></i>\s*'
    r'<a href="lyrics\.php\?song=([^"]+)">([^<]*)</a>\s*([^<]*)</span>')
_last = [0.0]


def fetch(url):
    """Fetches one URL as text, rate-limited; returns (status, body)."""
    wait = _last[0] + GAP_S - time.time()
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/129.0 Safari/537.36',
        'Accept': 'text/html',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            _last[0] = time.time()
            return resp.status, resp.read().decode('utf-8', 'replace')
    except Exception as e:  # noqa: BLE001 - a probe reports, it does not crash
        _last[0] = time.time()
        return 0, str(e)


def rule_plain(title):
    """Lower-case, keep [a-z0-9] only."""
    return re.sub(r'[^a-z0-9]', '', title.lower())


def rule_paren(title):
    """rule_plain after dropping one trailing parenthetical."""
    return rule_plain(re.sub(r'\s*\([^()]*\)\s*$', '', title))


def main():
    """Fetches the index, writes the JSON, prints the report."""
    out = sys.argv[1] if len(sys.argv) > 1 else 'debug/sl-song-index.json'
    status, body = fetch(ROOT + 'lyrics.php')
    if status != 200:
        sys.exit(f'landing page: {status} {body[:200]}')
    letters = []
    for href, key in LETTER_RE.findall(body):
        href = html.unescape(href)
        if key.lower() not in [k.lower() for _, k in letters]:
            letters.append((href, key))
    print(f'{len(letters)} letters: {" ".join(k for _, k in letters)}')
    lines = []
    for href, key in letters:
        status, page = fetch(ROOT + href)
        found = LINE_RE.findall(page) if status == 200 else []
        print(f'  {key}: HTTP {status}, {len(found)} lines', flush=True)
        for icon, slug, title, bracket in found:
            lines.append({
                'letter': key, 'slug': html.unescape(slug), 'title': html.unescape(title).strip(),
                'lyrics': 'bi-file-earmark-text' in icon, 'bracket': html.unescape(bracket).strip(),
            })
    when = time.strftime('%Y-%m-%dT%H:%M:%S%z')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'fetched': when, 'lines': lines}, f, ensure_ascii=False, indent=1)
    base = [ln for ln in lines if '_' not in ln['slug']]
    titles = {}
    for ln in base:
        titles.setdefault(ln['title'], []).append(ln['slug'])
    plain_ok = sum(1 for t, s in titles.items() if rule_plain(t) in s)
    paren_ok = sum(1 for t, s in titles.items() if rule_paren(t) in s)
    print(f'\n{len(lines)} lines, {len(base)} base slugs, {len(titles)} distinct base titles '
          f'({len({ln["title"] for ln in lines})} distinct titles overall)')
    print(f'rule plain: {plain_ok} right, rule paren: {paren_ok} right')
    suffixes = {}
    for ln in lines:
        if '_' in ln['slug']:
            suf = re.sub(r'\d{4}-\d{2}-\d{2}', 'DATE', ln['slug'].split('_', 1)[1])
            suf = re.sub(r'\d+$', 'N', suf)
            suffixes[suf] = suffixes.get(suf, 0) + 1
    print('version suffixes:', ', '.join(f'{k} {v}' for k, v in sorted(suffixes.items(), key=lambda x: -x[1])[:25]))
    print('\nException list (paren rule wrong):')
    for t, s in sorted(titles.items()):
        if rule_paren(t) not in s:
            print(f'  {t!r}: rule {rule_paren(t)!r}, site {s}')
    print('\nDuplicate base titles:')
    for t, s in sorted(titles.items()):
        if len(s) > 1:
            print(f'  {t!r}: {s}')
    # Versions whose base song is missing (no slug without "_").
    bases = {ln['slug'] for ln in base}
    orphans = sorted({ln['slug'].split('_', 1)[0] for ln in lines if '_' in ln['slug']} - bases)
    print(f'\nVersion stems without a base page: {len(orphans)}: {orphans[:30]}')


if __name__ == '__main__':
    main()
