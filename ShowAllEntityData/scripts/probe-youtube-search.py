#!/usr/bin/env python3
"""Probe YouTube's search results page for the setlist.fm window's play links.

setlist.fm's setlist pages give each song a ▶ that searches YouTube for
"<artist> <song>" (its own YouTube Data API key, which the userscript must not
reuse) and plays the first video. vzell chose (2026-11-03) to read YouTube's
own search page instead: www.youtube.com/results?search_query=…, anonymous.
This records, before any code depends on it:

1. the status, the final URL (a consent redirect, consent.youtube.com, for an
   anonymous request from the EU?), the size;
2. whether the page embeds `ytInitialData` and where the first video sits
   (`videoRenderer.videoId`), with its title, channel and length;
3. how many video results the first screen holds, and whether the first is
   an ad or a channel/shelf rather than a video.

Run: python3 scripts/probe-youtube-search.py ["Bruce Springsteen War" ...]
     python3 scripts/probe-youtube-search.py --save
No key, no cookies; the User-Agent says what this is. `--save` writes the
first query's page, trimmed, as tests/fixtures/ext-yt-search-war.html: a bare
page whose `ytInitialData` keeps the real path to the results
(contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer
.contents[].itemSectionRenderer.contents[]) with its first three
videoRenderers (videoId, title, ownerText, lengthText) — what the userscript
reads, real data, a few KB instead of 1.4 MB.
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (https://github.com/vzell/mb-userscripts)'
QUERIES = ['Bruce Springsteen War', 'Bruce Springsteen Born in the U.S.A.', 'Bruce Springsteen Two Hearts']


def first_videos(data, n=3):
    """The first `n` videoRenderer entries anywhere in ytInitialData, in document order."""
    out = []

    def walk(x):
        if len(out) >= n:
            return
        if isinstance(x, dict):
            vr = x.get('videoRenderer')
            if isinstance(vr, dict) and vr.get('videoId'):
                title = ''.join(r.get('text', '') for r in (vr.get('title') or {}).get('runs', []))
                owner = ''.join(r.get('text', '') for r in (vr.get('ownerText') or {}).get('runs', []))
                length = (vr.get('lengthText') or {}).get('simpleText', '')
                out.append({'videoId': vr['videoId'], 'title': title, 'channel': owner, 'length': length})
                return
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(data)
    return out


def trimmed(data, n=3):
    """ytInitialData cut to the path the results take and the first `n` videoRenderers, each with the fields read."""
    keep = ('videoId', 'title', 'ownerText', 'lengthText')
    sections = data['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents']
    items = []
    for sec in sections:
        for it in (sec.get('itemSectionRenderer') or {}).get('contents', []):
            if 'videoRenderer' in it and len(items) < n:
                items.append({'videoRenderer': {k: it['videoRenderer'][k] for k in keep if k in it['videoRenderer']}})
    return {'contents': {'twoColumnSearchResultsRenderer': {'primaryContents': {'sectionListRenderer': {
        'contents': [{'itemSectionRenderer': {'contents': items}}]}}}}}


def main():
    """Probe each query and print what the page says; with --save, keep the first as a fixture."""
    save = '--save' in sys.argv
    if save:
        sys.argv.remove('--save')
    for q in (sys.argv[1:] or QUERIES):
        url = 'https://www.youtube.com/results?' + urllib.parse.urlencode({'search_query': q})
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en'})
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode('utf-8', 'replace')
            print(f'{q!r}: {r.status} final {r.geturl()} {len(body)} chars')
        m = re.search(r'var ytInitialData\s*=\s*(\{.*?\});\s*</script>', body, re.S)
        if not m:
            print('  no ytInitialData;', 'consent page' if 'consent' in body[:5000].lower() else 'unknown page', body[:200].replace('\n', ' '))
            continue
        data = json.loads(m.group(1))
        vids = first_videos(data)
        print(f'  ytInitialData {len(m.group(1))} chars; first videos:')
        for v in vids:
            print(f'    {v}')
        print(f'  "videoRenderer" occurrences: {body.count(chr(34) + "videoRenderer" + chr(34))}')
        if save:
            out = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'ext-yt-search-war.html')
            with open(out, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(f'<!-- scripts/probe-youtube-search.py --save: {url}, trimmed to the first three videos; do not edit by hand. -->\n'
                         '<!DOCTYPE html><html><head><meta charset="utf-8"><title>YouTube</title></head><body>\n'
                         f'<script nonce="x">var ytInitialData = {json.dumps(trimmed(data), ensure_ascii=False)};</script>\n</body></html>\n')
            print('  saved', out)
            save = False


if __name__ == '__main__':
    main()
