"""Builds the data of org/mb-edit-history-mockups.html, the editing-history
window of the MusicBrainz entity popup (org/mb-edit-history.org), and the
copy of it that is published as an Artifact.

The mockup renders REAL edits: the records come from
scripts/inventory-mb-edits.js --json (the prototype parser
scripts/lib/mb-edits-parser.browser.js over pages saved with
scripts/fetch-mb-page-fixture.js). This script picks the pages the mockup
shows, trims each to the entries it needs (page order kept), and writes them
between the mockup's `<!--DATA-START-->` and `<!--DATA-END-->` markers, in
place.

With --artifact OUT it also writes the publishable copy: the Artifact sandbox
blocks outside images, so every archive.org / coverartarchive.org image the
picked entries show is downloaded once (cached in --cache) and carried inline
as `window.__EMBED = {"<url>": "data:…"}` at the `<!--EMBED-->` marker; and
everything up to the `SKELETON-END` comment plus the closing tags are dropped,
because the publisher wraps the page in its own skeleton (as
scripts/build-mockup-artifact.py does for the other mockups).

usage:
  python3 scripts/build-mb-edit-history-mockups.py <records.json> org/mb-edit-history-mockups.html \
      [--artifact OUT.html --cache DIR]

Pages used (labels = the saved file names, captured 2026-10-20 logged in as
vzell unless marked; see org/mb-edit-history.org, "Probe"):
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.request

UA = 'ShowAllEntityData-mockup-builder/1.0 (https://github.com/vzell/mb-userscripts)'

# label -> (how many entries from the top, ids that must be kept as well)
PICK = {
    'recording': (99, []),
    'recording-loggedout': (99, []),
    'release-group': (99, []),
    'release-group-p2': (20, []),
    'event-stonepony': (30, ['120457154']),
    'artist-bruce': (30, ['155699211', '155355600', '155699165']),
    'event-manchester': (25, ['128197018', '128139205']),
}

__doc__ += ''.join(f'  {k}: first {n}{" + " + ", ".join(ids) if ids else ""}\n' for k, (n, ids) in PICK.items())


def pick(records):
    """The trimmed records the mockup embeds."""
    out = {}
    for label, (n, ids) in PICK.items():
        rec = records.get(label)
        if not rec:
            sys.exit(f'missing page {label!r} in the records')
        keep = [e for i, e in enumerate(rec['entries']) if i < n or e['id'] in ids]
        missing = set(ids) - {e['id'] for e in keep}
        if missing:
            sys.exit(f'{label}: ids not found: {sorted(missing)}')
        out[label] = dict(rec, entries=keep, trimmedFrom=len(rec['entries']))
    return out


def fetch(url):
    """Downloads `url`; returns (bytes, content type)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read(), r.headers.get_content_type() or 'image/jpeg'


def embed_images(data, cache):
    """`{url: data URI}` for every image the picked entries show."""
    urls = set()
    for rec in data.values():
        for e in rec['entries']:
            texts = [r.get(k, '') for r in e['rows'] for k in ('html', 'old', 'new')] + [n['html'] for n in e['notes']]
            for t in texts:
                urls.update(re.findall(r'<img src="(https://[^"]+)"', t or ''))
    urls = sorted(urls)
    os.makedirs(cache, exist_ok=True)
    out = {}
    for u in urls:
        path = os.path.join(cache, hashlib.sha1(u.encode()).hexdigest())
        if os.path.exists(path):
            with open(path, 'rb') as f:
                blob = f.read()
            ctype = 'image/jpeg'
        else:
            try:
                blob, ctype = fetch(u)
            except Exception as e:  # noqa: BLE001 - a missing thumbnail must not stop the build
                print(f'  skipped {u}: {e}')
                continue
            with open(path, 'wb') as f:
                f.write(blob)
            time.sleep(0.5)
        out[u] = f'data:{ctype};base64,{base64.b64encode(blob).decode()}'
        print(f'  embedded {u} ({len(blob)} bytes)')
    return out


def main():
    """Writes the data block, then the Artifact copy when asked."""
    ap = argparse.ArgumentParser()
    ap.add_argument('records')
    ap.add_argument('mockup')
    ap.add_argument('--artifact')
    ap.add_argument('--cache', default='mockup-image-cache')
    args = ap.parse_args()
    with open(args.records, encoding='utf-8') as f:
        data = pick(json.load(f))
    blob = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    with open(args.mockup, encoding='utf-8') as f:
        page = f.read()
    block = f'<!--DATA-START--><script type="application/json" id="mb-edits-data">{blob}</script><!--DATA-END-->'
    page, n = re.subn(r'<!--DATA-START-->.*?<!--DATA-END-->', lambda _: block, page, flags=re.S)
    if n != 1:
        sys.exit('the mockup needs exactly one <!--DATA-START-->…<!--DATA-END--> block')
    with open(args.mockup, 'w', encoding='utf-8') as f:
        f.write(page)
    print(f'wrote {args.mockup}: {sum(len(r["entries"]) for r in data.values())} entries, {len(blob)} bytes of data')
    if not args.artifact:
        return
    emb = embed_images(data, args.cache)
    art = page.split('SKELETON-END', 1)[1].split('-->', 1)[1]
    art = re.sub(r'</body>\s*</html>\s*$', '', art.strip())
    art = re.sub(r'</head>\s*<body>', '', art, count=1)
    art = art.replace('<!--EMBED-->', '<script>window.__EMBED = '
                      + json.dumps(emb, separators=(',', ':')) + ';</script>', 1)
    with open(args.artifact, 'w', encoding='utf-8') as f:
        f.write(art)
    print(f'wrote {args.artifact} ({len(art)} bytes, {len(emb)} images inline)')


if __name__ == '__main__':
    main()
