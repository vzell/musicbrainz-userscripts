"""Copy vzell's saved Discogs image revision answers into the fixtures.

debug/d-image-rev-{4,5,6}.json are the answers of
https://www.discogs.com/release/1313481/images/data?history_revision=N
(saved signed in, 2026-11-10; each with a leading UTF-8 BOM). The fixtures
tests/fixtures/dg-image-rev-{4,5,6}.json are the same JSON without the BOM,
as dg-release-images-data.json was made (the BOM itself is pinned by
popup-ext.spec.js's "leading BOM" test). Read by popup-ext.spec.js,
"Discogs image revisions (dgimgrev)".

usage: python3 scripts/copy-dg-image-rev-fixtures.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main():
    for rev in (4, 5, 6):
        src = ROOT / 'debug' / f'd-image-rev-{rev}.json'
        text = src.read_text(encoding='utf-8-sig')
        data = json.loads(text)
        out = ROOT / 'tests' / 'fixtures' / f'dg-image-rev-{rev}.json'
        out.write_text(text.strip() + '\n', encoding='utf-8')
        print(out.relative_to(ROOT), len(data), 'images:', [x['id'] for x in data])


if __name__ == '__main__':
    main()
