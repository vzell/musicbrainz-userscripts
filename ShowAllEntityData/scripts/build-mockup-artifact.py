"""Build the publishable copy of a design mockup (org/*-mockups.html).

The mockups hotlink their thumbnails from the archive (coverartarchive.org /
eventartarchive.org) when opened from disk. The claude.ai Artifact sandbox
blocks outside images, so the published copy carries the 250 px thumbnails
inline instead: this script downloads each image's 250 px thumbnail named in
an archive record (the JSON the mockup was built from) and writes

    <script>window.__EMBED = {"<image id>": "data:image/jpeg;base64,…", …};</script>

where the mockup has its `<!--EMBED-->` marker. It also drops everything up to
the `SKELETON-END` comment and the closing `</head>` / `<body>` / `</body>` /
`</html>` tags, because the Artifact publisher wraps the page in its own
document skeleton.

The release mockup's published copy was built the same way by hand on
2026-10-06; this is that step, committed so it is not re-derived.

usage:
  python3 scripts/build-mockup-artifact.py org/event-overview-mockups.html \
      org/event-overview-eaa-3f2ca30a.json <out.html>
"""

import base64
import json
import re
import sys
import time
import urllib.request

UA = 'ShowAllEntityData-mockup-builder/1.0 (https://github.com/vzell/mb-userscripts)'


def fetch(url):
    """Downloads `url` (following redirects) and returns (bytes, content type)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), r.headers.get_content_type() or 'image/jpeg'


def main():
    """Builds the publishable copy."""
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    src, record_path, out = sys.argv[1:]
    with open(src, encoding='utf-8') as f:
        html = f.read()
    with open(record_path, encoding='utf-8') as f:
        record = json.load(f)
    if '<!--EMBED-->' not in html or 'SKELETON-END' not in html:
        sys.exit(f'{src}: needs both the <!--EMBED--> marker and the SKELETON-END comment')

    embed = {}
    for im in record.get('images', []):
        thumbs = im.get('thumbnails') or {}
        url = (thumbs.get('250') or thumbs.get('small') or '').replace('http://', 'https://')
        if not url:
            continue
        data, ctype = fetch(url)
        embed[str(im['id'])] = f'data:{ctype};base64,' + base64.b64encode(data).decode('ascii')
        print(f"  {im['id']}: {len(data)} bytes")
        time.sleep(0.3)

    html = html.split('SKELETON-END', 1)[1].split('-->', 1)[1]
    html = html.replace('<!--EMBED-->', '<script>window.__EMBED = ' + json.dumps(embed) + ';</script>', 1)
    html = re.sub(r'</head>\s*<body>', '', html, count=1)
    html = re.sub(r'</body>\s*</html>\s*$', '', html.rstrip()) + '\n'
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html.lstrip())
    print(f'{out}: {len(embed)} thumbnails inlined, {len(html)} characters')


if __name__ == '__main__':
    main()
