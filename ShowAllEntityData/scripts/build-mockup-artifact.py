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

Without a record file, the image list is read from the mockup itself: a
`<script type="application/json" id="mockup-images">` block holding
`{"<id>": {"u": "<url>", "max": <px>?}, …}` (org/foreign-images-mockups.html,
whose images come from several sites, not from one archive record). An entry
with `max` is shrunk to fit `max` × `max` px through ImageMagick's `convert`,
so a full-size scan can sit on the viewer stage without weighing a megabyte.
Downloads are cached in debug/mockup-image-cache/ (gitignored), 1.1 s apart.

usage:
  python3 scripts/build-mockup-artifact.py org/event-overview-mockups.html \
      org/event-overview-eaa-3f2ca30a.json <out.html>
  python3 scripts/build-mockup-artifact.py org/foreign-images-mockups.html <out.html>
"""

import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'debug', 'mockup-image-cache')

UA = 'ShowAllEntityData-mockup-builder/1.0 (https://github.com/vzell/mb-userscripts)'


def fetch(url):
    """Downloads `url` (following redirects) and returns (bytes, content type)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), r.headers.get_content_type() or 'image/jpeg'


def fetch_cached(url):
    """`fetch()` through debug/mockup-image-cache/, 1.1 s between requests."""
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1(url.encode('utf-8')).hexdigest()
    path = os.path.join(CACHE, key)
    if os.path.exists(path):
        with open(path + '.type', encoding='ascii') as f:
            ctype = f.read().strip()
        with open(path, 'rb') as f:
            return f.read(), ctype
    time.sleep(1.1)
    data, ctype = fetch(url)
    with open(path, 'wb') as f:
        f.write(data)
    with open(path + '.type', 'w', encoding='ascii') as f:
        f.write(ctype)
    return data, ctype


def shrink(data, max_px):
    """The image fitted into max_px × max_px as a JPEG (ImageMagick)."""
    res = subprocess.run(['convert', '-', '-resize', f'{max_px}x{max_px}>', '-quality', '80', 'jpg:-'],
                         input=data, capture_output=True, check=True)
    return res.stdout, 'image/jpeg'


def inline_images(html):
    """The mockup's own image list, or None when it has none."""
    m = re.search(r'<script type="application/json" id="mockup-images">(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else None


def main():
    """Builds the publishable copy."""
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        sys.exit(2)
    src, out = sys.argv[1], sys.argv[-1]
    with open(src, encoding='utf-8') as f:
        html = f.read()
    if '<!--EMBED-->' not in html or 'SKELETON-END' not in html:
        sys.exit(f'{src}: needs both the <!--EMBED--> marker and the SKELETON-END comment')

    embed = {}
    if len(sys.argv) == 3:
        images = inline_images(html)
        if images is None:
            sys.exit(f'{src}: no record file given and no <script id="mockup-images"> block')
        for key, im in images.items():
            data, ctype = fetch_cached(im['u'])
            if im.get('max'):
                data, ctype = shrink(data, im['max'])
            embed[key] = f'data:{ctype};base64,' + base64.b64encode(data).decode('ascii')
            print(f'  {key}: {len(data)} bytes')
    else:
        with open(sys.argv[2], encoding='utf-8') as f:
            record = json.load(f)
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
