#!/usr/bin/env python3
"""Re-check the "none-of-kind" notices of the batch 4 probe by a fresh lookup.

The probe compared a ℗/© notice in a release's annotation with the release's
OWN relationships only. MusicBrainz also has the same types on recordings
(label/artist → recording "phonographic copyright"), which a release page
shows in its tracklist. This looks up each sampled release with
inc=recordings+recording-level-rels+label-rels+artist-rels (paced 1.1 s, a 503
retried) and says, per notice, whether the release has the kind itself, on
every recording, on some recordings, or nowhere.

Usage:
    python3 scripts/check-apollo-findings-4-notices.py [N] [--src browse|annotation-search|all]
"""
import collections
import json
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
KIND = {'phonographic copyright': 'phonographic', 'copyright': 'copyright'}


def get(url):
    """One paced GET with 503 retries; None after six failures."""
    for attempt in range(7):
        time.sleep(1.1)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=90) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (503, 429):
                time.sleep(5 * (attempt + 1))
                continue
            return None
        except Exception:
            time.sleep(3)
    return None


def main():
    """Look up the sample and print where each notice's kind is."""
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    n = int(args[0]) if args else 30
    src = 'all'
    for a in sys.argv[1:]:
        if a.startswith('--src='):
            src = a.split('=', 1)[1]
    d = json.load(open('debug/probe-apollo-findings-4.json', encoding='utf-8'))
    by = collections.OrderedDict()
    for x in d['notices']:
        if x['verdict'] == 'none-of-kind' and (src == 'all' or x['src'] == src):
            by.setdefault(x['id'], []).append(x)
    print(f'{len(by)} releases with a none-of-kind notice ({src}); checking {min(n, len(by))}', flush=True)
    tally = collections.Counter()
    for rid, notes in list(by.items())[:n]:
        j = get(f'https://musicbrainz.org/ws/2/release/{rid}?inc=recordings+recording-level-rels+label-rels+artist-rels&fmt=json')
        if not j:
            print(f'  {rid}: lookup failed', flush=True)
            continue
        own = {KIND[x['type']] for x in j.get('relations', []) if x.get('type') in KIND}
        recs = [t.get('recording') or {} for m in j.get('media', []) for t in m.get('tracks', []) or []]
        for k in sorted({x['kind'] for x in notes}):
            on = sum(1 for r in recs if any(KIND.get(x.get('type')) == k for x in r.get('relations', [])))
            where = 'release' if k in own else ('every recording' if recs and on == len(recs) else ('some recordings' if on else 'nowhere'))
            tally[(k, where)] += 1
            print(f'  {k:12} {where:16} {on}/{len(recs)} rec  {j.get("title")!r} https://musicbrainz.org/release/{rid}', flush=True)
    print('tally:', dict(tally))


if __name__ == '__main__':
    main()
