"""What does coverartarchive.org/release/<mbid> answer for the release-page
Cover art section (org/CAA-release-tracks-handling.org, P0)?

The section reads one archive record per release page and renders every image
as a tile. This probe records the facts that code depends on, so they rest on
a measurement rather than on the archive's documentation:

  1. HTTP status per release (expected: 200 with images, 404 with none — the
     section must treat 404 as "no artwork", never as a failure)
  2. the key set of the record and of each image (`front`, `back`, `types`,
     `comment`, `approved`, `edit`, `id`, `image`, `thumbnails`)
  3. the thumbnail ladder keys and the URL scheme the archive hands out
     (`http:` vs `https:` vs `//`) — the section strips a leading `http:` the
     same way `_artBuildImageLi()` does
  4. how many images carry `front: true` vs the Front type (they can differ)
  5. whether the MusicBrainz page's tab count ("Cover art (N)") can be trusted
     to equal `len(images)`: the WS/2 release `cover-art-archive.count` is
     fetched alongside, as the stand-in for that tab text

Default releases: the design study's example (16 images), and the two
release-tracks fixtures the specs use (`release-tracks-medley.html`, 13 per its
tab; `release-tracks-eti-keywords.html`, 0 per its tab).

One request per release to each host, one second apart.

usage: python3 scripts/probe-caa-release-images.py [mbid ...]
"""
import collections
import json
import sys
import time
import urllib.error
import urllib.request

DEFAULTS = [
    'd0adda7e-86de-4aef-af95-ee7da122d175',  # design study example, 16 images
    'a9a3b139-cf22-4d28-801e-3f3d49521d0e',  # release-tracks-medley.html, tab says 13
    '5cf63c93-e27e-4d98-81bc-9aba8b6861a7',  # release-tracks-eti-keywords.html, tab says 0
]
UA = 'ShowAllEntityData-caa-release-images-probe/1.0 ( https://github.com/vzell/mb-userscripts )'


def get_json(url):
    """Fetch `url`; return (status, parsed JSON or None)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, None
    except urllib.error.URLError as e:
        # The archive answers with a 302 to archive.org, which is the half that
        # fails under load; report it as a transport failure, not a crash.
        return f'transport error ({e.reason})', None


def scheme(url):
    """Classify a URL's scheme as 'http', 'https', '//' or 'other'."""
    if url.startswith('https:'):
        return 'https'
    if url.startswith('http:'):
        return 'http'
    if url.startswith('//'):
        return '//'
    return 'other'


def probe(mbid):
    """Print the facts for one release."""
    print(f'== release {mbid}')
    status, rec = get_json(f'https://coverartarchive.org/release/{mbid}')
    time.sleep(1)
    ws_status, ws = get_json(f'https://musicbrainz.org/ws/2/release/{mbid}?fmt=json')
    time.sleep(1)
    ws_count = (ws or {}).get('cover-art-archive', {}).get('count')
    print(f'   archive HTTP {status}; WS/2 HTTP {ws_status}, cover-art-archive.count = {ws_count}')
    if rec is None:
        print('   no record (expected for a release without artwork)')
        return
    images = rec.get('images', [])
    print(f'   record keys: {sorted(rec.keys())}')
    print(f'   images: {len(images)} (WS/2 count agrees: {ws_count == len(images)})')
    keys = collections.Counter()
    thumbs = collections.Counter()
    schemes = collections.Counter()
    types = collections.Counter()
    for im in images:
        keys.update(im.keys())
        thumbs.update((im.get('thumbnails') or {}).keys())
        schemes[scheme(im.get('image', ''))] += 1
        for u in (im.get('thumbnails') or {}).values():
            schemes[scheme(u)] += 1
        types.update(im.get('types') or ['(none)'])
    print(f'   image keys: {dict(keys)}')
    print(f'   thumbnail keys: {dict(thumbs)}')
    print(f'   URL schemes (image + thumbnails): {dict(schemes)}')
    print(f'   types: {dict(types)}')
    print(f'   front:true {sum(1 for im in images if im.get("front"))}, '
          f'Front-typed {sum(1 for im in images if "Front" in (im.get("types") or []))}, '
          f'back:true {sum(1 for im in images if im.get("back"))}, '
          f'approved:false {sum(1 for im in images if im.get("approved") is False)}, '
          f'with comment {sum(1 for im in images if im.get("comment"))}')


def main():
    """Probe every MBID given on the command line, or the defaults."""
    for mbid in sys.argv[1:] or DEFAULTS:
        probe(mbid)


if __name__ == '__main__':
    main()
