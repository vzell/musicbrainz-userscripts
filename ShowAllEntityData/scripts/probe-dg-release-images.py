"""Probe what a Discogs release's images look like from each source
(org/MB-POH-sync-withDiscogs.org, Phase 4): the API's `images`, the
release's Images page `/release/<id>/images` and its Image history (the
editor) `/release/<id>/images/update`, both asked WITHOUT a session, as a
link preview from musicbrainz.org asks (`_extGet()` is anonymous).

What it prints:
  - API: status, how many images, the keys of one image (is there a file
    size? an uploader? a date?), the types;
  - each page: status, final URL (a redirect to the login?), content type,
    whether Cloudflare's check answered (`cf-mitigated`, "Just a moment"),
    and how many images the page names.

With --fixture the API's answer is written, wrapped as the ext-*.json
fixtures are (url, status, contentType, body), to
tests/fixtures/ext-discogs-release-<id>.json (the specs' release).

Result 2026-10-27T23:45+01:00 (NB-3641, browser n/a), release 1313481:
  - API 200, 17 images (1 primary, 16 secondary); an image's keys are
    height, resource_url, type, uri, uri150, width — no file size, uploader
    or date. Width and height are the SERVED size, capped at 600 px
    ("600x599" for an image the editor lists as 2002 × 2000), not the
    image's own;
  - /images and /images/update: 403, `cf-mitigated: challenge` ("Just a
    moment…") for both, from Python. (A browser with a Discogs session gets
    through; the editor needs the login anyway.)
  - The API's `uri` and the editor's 300 px thumbnail of one image end in
    the same encoded storage path (`…/w:<n>/<path>.jpeg`), so the two
    sources are joined on it (`_dgImgKey()`).

usage: python3 scripts/probe-dg-release-images.py [release id] [--fixture]
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-dg-images-probe/1.0 (info@volkerzell.de)'
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
REL = ARGS[0] if ARGS else '1313481'


def get(url):
    """One GET; an HTTP error is returned, not raised."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, res.geturl(), dict(res.headers), res.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.geturl(), dict(e.headers), e.read().decode('utf-8', 'replace')


def main():
    st, final, hd, body = get(f'https://api.discogs.com/releases/{REL}')
    print(f'== API /releases/{REL}: {st}')
    if st == 200:
        imgs = json.loads(body).get('images', [])
        if '--fixture' in sys.argv:
            out = f'tests/fixtures/ext-discogs-release-{REL}.json'
            with open(out, 'w', encoding='utf-8', newline='\n') as fh:
                json.dump({"url": f"https://api.discogs.com/releases/{REL}", "status": st, "contentType": "application/json", "body": body}, fh, ensure_ascii=False, indent=1)
                fh.write('\n')
            print('  fixture', out)
        print('  images:', len(imgs), '· types:', [i.get('type') for i in imgs])
        if imgs:
            print('  keys of one:', sorted(imgs[0]))
            print('  first:', {k: imgs[0][k] for k in imgs[0] if k not in ('uri', 'uri150', 'resource_url')})
            print('  W x H:', [f"{i.get('width')}x{i.get('height')}" for i in imgs])
    for path in (f'/release/{REL}/images', f'/release/{REL}/images/update'):
        time.sleep(1.2)
        st, final, hd, body = get('https://www.discogs.com' + path)
        low = {k.lower(): v for k, v in hd.items()}
        print(f'== {path}: {st} → {final}')
        print('  content-type:', low.get('content-type'), '· cf-mitigated:', low.get('cf-mitigated'),
              '· "Just a moment":', 'Just a moment' in body)
        print('  thumbnail_link:', len(re.findall(r'thumbnail_link', body)), '· image_preview:', len(re.findall(r'image_preview', body)),
              '· login form:', bool(re.search(r'login|sign in', body, re.I)))


if __name__ == '__main__':
    main()
