#!/usr/bin/env python3
"""Find real MusicBrainz examples for the release-check findings.

org/majkinetor.org, TODO "Findings from the release checks of Mission Control /
Platform Check / ISRC Scout", asks for real examples before any code:

- barcode-zero:       a release whose barcode is all zeros (release search
                      ``barcode:000000000000``);
- barcode-missing:    a release with no barcode at all (``barcode`` null), as
                      opposed to MusicBrainz's "[none]" (``barcode`` == "");
- catno-missing:      a release with a label but no catalog number on that
                      label entry;
- release-event-none: a release with neither a date nor a country;
- len-unknown:        a release with a track whose length is unknown;
- isrc-shared:        a release where two DIFFERENT recordings carry one ISRC.

The last five come from one browse of an artist's releases with
``inc=labels+recordings+isrcs`` (the MB API documents ``inc=recordings`` and
``isrcs`` on a release browse). Requests are paced at one per 2 s, a 503 retried six times
(https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

Usage:
    python3 scripts/probe-release-check-examples.py [--artist MBID] [--pages N] [--isrcs N]
        [--out debug/probe-release-check-examples.json]
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
WS = 'https://musicbrainz.org/ws/2/'
SPRINGSTEEN = '70248960-cb53-4ea4-943a-edb18f7d336f'
_last = [0.0]


def get(path, params):
    """GET one /ws/2 JSON document, paced at one request per 2 s.

    Retries a 503 up to six times with a growing wait.
    """
    url = WS + path + '?' + urllib.parse.urlencode({**params, 'fmt': 'json'})
    for attempt in range(7):
        wait = 2.0 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 503 and attempt < 6:
                time.sleep(5 + 5 * attempt)
                continue
            raise
    return None


def rel_url(mbid):
    """The release page's URL."""
    return 'https://musicbrainz.org/release/' + mbid


def check_release(rel, found, cap):
    """Record which findings one browsed release shows, up to `cap` each."""
    def add(key, item):
        if len(found[key]) < cap:
            found[key].append(item)

    mbid = rel['id']
    title = rel.get('title', '')
    base = {'mbid': mbid, 'title': title, 'url': rel_url(mbid)}
    bc = rel.get('barcode')
    if bc is None:
        add('barcode-missing', base)
    elif bc == '':
        add('barcode-none-marker', base)
    elif bc.strip('0') == '' and bc:
        add('barcode-zero', {**base, 'barcode': bc})
    for li in rel.get('label-info') or []:
        if li.get('label') and not (li.get('catalog-number') or '').strip():
            add('catno-missing', {**base, 'label': li['label'].get('name')})
            break
    if not rel.get('date') and not rel.get('country') and not rel.get('release-events'):
        add('release-event-none', base)
    isrc_recs = {}
    no_len = []
    for med in rel.get('media') or []:
        for tr in med.get('tracks') or []:
            rec = tr.get('recording') or {}
            if tr.get('length') is None:
                no_len.append(f"{med.get('position')}.{tr.get('number')} {tr.get('title')}")
            for isrc in rec.get('isrcs') or []:
                isrc_recs.setdefault(isrc, {})[rec.get('id')] = rec.get('title')
    if no_len:
        add('len-unknown', {**base, 'tracks': no_len[:5], 'count': len(no_len)})
    shared = {k: v for k, v in isrc_recs.items() if len(v) > 1}
    if shared:
        k, v = next(iter(shared.items()))
        add('isrc-shared', {**base, 'isrc': k, 'recordings': v, 'count': len(shared)})


def main():
    """Run the probe and write the JSON report."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--artist', default=SPRINGSTEEN)
    ap.add_argument('--pages', type=int, default=12)
    ap.add_argument('--cap', type=int, default=5)
    ap.add_argument('--isrcs', type=int, default=40)
    ap.add_argument('--report-pages', type=int, default=3)
    ap.add_argument('--out', default='debug/probe-release-check-examples.json')
    a = ap.parse_args()

    keys = ['barcode-zero', 'barcode-missing', 'barcode-none-marker', 'catno-missing',
            'release-event-none', 'len-unknown', 'isrc-shared']
    found = {k: [] for k in keys}

    zero = get('release', {'query': 'barcode:000000000000', 'limit': 10})
    zero_hits = [{'mbid': r['id'], 'title': r.get('title'), 'barcode': r.get('barcode'),
                  'url': rel_url(r['id'])} for r in (zero or {}).get('releases', [])]

    seen = 0
    total = None
    for page in range(a.pages):
        try:
            doc = get('release', {'artist': a.artist, 'inc': 'labels+recordings+isrcs',
                                  'limit': 25, 'offset': page * 25})
        except urllib.error.HTTPError as e:
            print(f'page {page + 1}: gave up ({e.code}); keeping what was found', file=sys.stderr)
            break
        rels = doc.get('releases', [])
        total = doc.get('release-count', total)
        for rel in rels:
            check_release(rel, found, a.cap)
        seen += len(rels)
        print(f'page {page + 1}: {seen}/{total} releases; ' +
              ', '.join(f'{k} {len(v)}' for k, v in found.items()), file=sys.stderr)
        if len(rels) < 25:
            break

    # No release event: a search, since 400 browsed releases held none.
    # A negated clause needs a positive one beside it (arid).
    ev = get('release', {'query': f'arid:{a.artist} AND -date:* AND -country:*', 'limit': 10})
    no_event = [{'mbid': r['id'], 'title': r.get('title'), 'url': rel_url(r['id']),
                 'date': r.get('date'), 'country': r.get('country')}
                for r in (ev or {}).get('releases', [])]

    # One ISRC on two different recordings of ONE release: the ISRCs of
    # MusicBrainz's report "ISRCs with multiple recordings" (one row per
    # ISRC, then one row per recording). The /ws/2 ISRC lookup returns no
    # releases even with inc=releases (probed 2026-11-19), so each recording
    # is looked up with inc=releases. ISRCs whose recordings carry DIFFERENT
    # titles come first: two tracks of one release sharing an ISRC are
    # usually a copy-paste slip onto another song, while equal titles are
    # mostly the same song on different releases.
    shared = []
    tried = 0
    if a.isrcs:
        groups = {}
        for pg in range(1, a.report_pages + 1):
            req = urllib.request.Request(
                f'https://musicbrainz.org/report/ISRCsWithManyRecordings?page={pg}',
                headers={'User-Agent': UA})
            time.sleep(2.0)
            with urllib.request.urlopen(req, timeout=60) as r:
                html = r.read().decode('utf-8', 'replace')
            cur = None
            for row in html.split('<tr')[1:]:
                m = re.search(r'href="/isrc/([A-Z0-9]{12})"', row)
                if m:
                    cur = m.group(1)
                    groups.setdefault(cur, [])
                    continue
                m = re.search(r'href="/recording/([0-9a-f-]{36})"><bdi>([^<]*)</bdi>', row)
                if m and cur:
                    groups[cur].append((m.group(1), m.group(2)))
        order = sorted(groups, key=lambda k: len({t.lower() for _, t in groups[k]}) < 2)
        for isrc in order[:a.isrcs]:
            tried += 1
            by_rel = {}
            try:
                for rid, rtitle in groups[isrc][:3]:
                    doc = get('recording/' + rid, {'inc': 'releases'})
                    for rel in doc.get('releases') or []:
                        by_rel.setdefault(rel['id'], {'title': rel.get('title'), 'recs': {}})
                        by_rel[rel['id']]['recs'][rid] = rtitle
            except urllib.error.HTTPError as e:
                print(f'isrc {isrc}: gave up ({e.code})', file=sys.stderr)
                break
            for relid, v in by_rel.items():
                if len(v['recs']) > 1:
                    shared.append({'isrc': isrc, 'mbid': relid, 'title': v['title'],
                                   'url': rel_url(relid), 'recordings': v['recs']})
                    break
            print(f'isrc {tried}/{min(len(order), a.isrcs)}: {len(shared)} shared', file=sys.stderr)
            if len(shared) >= a.cap:
                break

    report = {
        'when': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'artist': a.artist,
        'releases_checked': seen,
        'release_count': total,
        'barcode_zero_search': zero_hits,
        'no_event_search': no_event,
        'isrc_shared_from_report': {'tried': tried, 'found': shared},
        'from_browse': found,
    }
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
