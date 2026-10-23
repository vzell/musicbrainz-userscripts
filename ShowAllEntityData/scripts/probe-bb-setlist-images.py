"""Brucebase entry pages behind a Setlist Media icon: which wiki folder do
their gallery images live in (org/TODO.org "Some enhancements", item e)?

The year table's Media column rings an icon only for the kinds in
`_BB_FI_MEDIA_KINDS`, and `_bbImageKind()` names an image's kind by its
folder (`local--resized-images/<folder>/<file>/thumbnail.jpg`). This probe
takes, from the cached year pages in debug/bb-year-cache/, the first entry
with a Setlist icon and a `/gig:` page in each sampled year, reads that page
(cached in debug/foreign-images/, 1.1 s apart, one at a time) and reports
every gallery-box image's folder, so the folder rule rests on the site and not
on one page.

usage: python3 -I scripts/probe-bb-setlist-images.py [--refresh] [YEAR ...]
"""
import collections
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YEARS_DIR = os.path.join(ROOT, 'debug', 'bb-year-cache')
OUT = os.path.join(ROOT, 'debug', 'foreign-images')
UA = 'ShowAllEntityData-bb-setlist-probe/1.0 ( info@volkerzell.de )'
SPACING_S = 1.1
DEFAULT_YEARS = ['1975', '1978', '1985', '1993', '1999', '2003', '2009', '2012', '2016', '2024']

_last = [0.0]


def _wait():
    """Keep requests SPACING_S apart."""
    d = _last[0] + SPACING_S - time.time()
    if d > 0:
        time.sleep(d)
    _last[0] = time.time()


def first_setlist_gig(year):
    """The first `/gig:` path of an entry with a Setlist icon in a year page, or None."""
    path = os.path.join(YEARS_DIR, f'{year}.html')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8', errors='replace') as f:
        text = f.read()
    for chunk in text.split('<a name="')[1:]:
        m = re.search(r'href="(/gig:[^"#]+)"', chunk)
        if m and '00Setlist-32.png' in chunk:
            return m.group(1)
    return None


def fetch(path, refresh):
    """The entry page's HTML, from the cache or the site; '' on a failure."""
    url = 'https://brucebase.wikidot.com' + path
    name = 'brucebase.wikidot.com_' + path.strip('/').replace(':', '_').replace('/', '_') + '.html'
    file = os.path.join(OUT, name)
    if os.path.exists(file) and not refresh:
        with open(file, encoding='utf-8', errors='replace') as f:
            return f.read(), 'cache'
    _wait()
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode('utf-8', 'replace')
            status = r.status
    except urllib.error.HTTPError as e:
        return '', f'HTTP {e.code}'
    except Exception as e:  # noqa: BLE001
        return '', type(e).__name__
    os.makedirs(OUT, exist_ok=True)
    with open(file, 'w', encoding='utf-8') as f:
        f.write(text)
    return text, f'HTTP {status}'


def gallery_folders(text):
    """Folder of every gallery-box thumbnail (`.gallery-box … img`) in a page."""
    out = []
    for box in re.findall(r'<div class="gallery-box[^"]*".*?</div>\s*</div>', text, re.S):
        out += re.findall(r'local--resized-images/([^/"]+)/[^/"]+/thumbnail\.jpg', box)
    if not out:
        # A box whose markup the lazy pattern above cut short: fall back to
        # every thumbnail, which on an entry page is the gallery's.
        out = re.findall(r'local--resized-images/([^/"]+)/[^/"]+/thumbnail\.jpg', text)
    return out


def main(argv):
    """Print, per sampled year, the entry read and its image folders by kind."""
    refresh = '--refresh' in argv
    years = [a for a in argv if re.fullmatch(r'\d{4}', a)] or DEFAULT_YEARS
    total = collections.Counter()
    for y in years:
        gig = first_setlist_gig(y)
        if not gig:
            print(f'{y}: no entry with a Setlist icon and a /gig: page')
            continue
        text, how = fetch(gig, refresh)
        folders = gallery_folders(text)
        kinds = collections.Counter(re.sub(r'\d{4}$', 'YYYY', f) for f in folders)
        total.update(kinds)
        print(f'{y}: {gig} ({how}) ' + (', '.join(f'{k} x{n}' for k, n in sorted(kinds.items())) or 'no gallery images'))
    print('all:', ', '.join(f'{k} x{n}' for k, n in sorted(total.items())))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
