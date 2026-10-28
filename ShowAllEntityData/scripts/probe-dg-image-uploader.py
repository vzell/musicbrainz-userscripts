"""Probe where Discogs' image editor (`/release/<id>/images/update`) gets its
images (org/MB-POH-sync-withDiscogs.org Phase 4, follow-up 2026-10-28).

The editor's page arrives with `#image_uploader_app` EMPTY: its React 0.14
uploader (`ds(function(require){ require("imageUploaderApp"); })`, the
script `javascripts/image/image-uploader-app.js` on st.discogs.com) draws the
list in the browser — there is no `data-react-checksum` in any saved copy —,
so a fetched page holds no image (vzell's final rendered page,
debug/discogs-release-image-update-final.html: our table had # and Type
only). This probe downloads that public script and prints every URL-like
string and every place it names images, uploads or a JSON endpoint, so the
data source can be read from it.

Result 2026-10-28T00:30+01:00 (NB-3641, browser n/a): 200, 31,532 bytes.
The store's `fetchImages()` asks `$.get("/" + type + "/" + id +
"/images/data", {history_revision: …})`; save, upload, remove and report go
to `/images/save`, `/images/upload`, `/editimage/remove/`,
`/editimage/report/`. An image's fields as the components read them: id,
type, username, userUrl, timestamp, width, height, original_width,
original_height, size, thumbSrc, originalSrc, pending, disabled,
abuse_report. vzell's copy of the answer for release 1313481
(debug/discogs-release-images-data.json, saved with a leading BOM): a JSON
array of 17, `primary` as the STRING "true"/"false", `sortOrder` 0-16,
`size` in bytes (126806), `timestamp` ISO UTC ("2008-05-19T23:46:48+00:00"),
`uid` too.

usage: python3 scripts/probe-dg-image-uploader.py [script URL]
"""
import pathlib
import re
import sys
import urllib.request

UA = 'ShowAllEntityData-dg-uploader-probe/1.0 (info@volkerzell.de)'
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (sys.argv[1] if len(sys.argv) > 1 else
       'https://st.discogs.com/db681b492b68fd84ae46bd8780c9ef2b013f6a24/dst/javascripts/image/image-uploader-app.js')


def main():
    req = urllib.request.Request(URL, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        body = res.read().decode('utf-8', 'replace')
        print('status', res.status, 'bytes', len(body), 'type', res.headers.get('content-type'))
    out = ROOT / 'debug' / 'poh-sync' / 'image-uploader-app.js'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(body, encoding='utf-8')
    print('saved', out.relative_to(ROOT))
    strings = sorted(set(re.findall(r'["\'](/[a-zA-Z_][^"\'\s]{2,120})["\']', body)))
    print('path-like strings:')
    for s in strings:
        print('  ', s)
    for pat in (r'ajax|fetch\(|\$\.get|\.getJSON|XMLHttpRequest|url\s*:', r'images?_?(?:list|data|json)|bootstrap|initial(?:State|Data)|window\.\w+'):
        print(f'-- /{pat}/')
        for m in list(re.finditer(pat, body))[:25]:
            print('  ', re.sub(r'\s+', ' ', body[max(0, m.start() - 120):m.end() + 160]))


if __name__ == '__main__':
    main()
