#!/usr/bin/env python3
"""Real rows for the Brucebase feed mockup (debug/bb-feed-mockup.json).

Reads the published feed (or a local bb-feed.json) and the run's page list
(bb/<date>/all-sorted.txt, "name>title>tags" per line) and writes, for the
mockup's views:
  - relations: the relation pages around the flagged ones, sorted by title as
    the wiki's people list sorts them;
  - songs: the song pages around the flagged ones;
  - stories: the first story pages without a parent, with their titles;
  - year1967: the 1967 event pages, with any dependent page whose title
    differs (the feed's "event" field, read backwards);
  - counts: pages per kind and per category.

Usage: python3 scripts/extract-bb-feed-mockup.py FEED.json RUN_DIR OUT.json
"""
import json
import sys
from collections import Counter, defaultdict


def main():
    feed_path, run_dir, out_path = sys.argv[1:4]
    feed = json.load(open(feed_path, encoding='utf-8'))
    pages = feed['pages']
    titles, tags = {}, {}
    with open(f'{run_dir}/all-sorted.txt', encoding='utf-8', errors='replace') as f:
        for line in f:
            parts = line.rstrip('\n').split('>')
            if len(parts) >= 2:
                titles[parts[0]] = parts[1]
                tags[parts[0]] = parts[2] if len(parts) > 2 else ''

    def around(cat, n=4):
        names = sorted((k for k in titles if k.startswith(cat + ':')), key=lambda k: titles[k].lower())
        keep = set()
        for i, k in enumerate(names):
            if k in pages:
                keep.update(range(max(0, i - n), min(len(names), i + n + 1)))
        return [{'name': names[i], 'title': titles[names[i]], 'tags': tags[names[i]], 'feed': pages.get(names[i])}
                for i in sorted(keep)]

    by_event = defaultdict(list)
    for name, kinds in pages.items():
        dt = kinds.get('dependent-title')
        if dt and dt.get('event'):
            by_event[dt['event']].append({'name': name, **dt})

    def year(y):
        return [{'name': k, 'title': titles[k], 'dependents': by_event.get(k, [])}
                for k in sorted((k for k in titles if ':' in k), key=lambda k: k.split(':')[1])
                if k.split(':')[0] in ('gig', 'recording', 'rehearsal', 'nogig', 'interview') and k.split(':')[1].startswith(y + '-')]
    year1967 = year('1967')
    year1975 = [e for e in year('1975') if e['name'].split(':')[1][:7] in ('1975-11',)]

    out = {
        'run': feed['run'],
        'reports': feed['reports'],
        'relations': around('relation'),
        'songs': around('song'),
        'stories': [{'name': k, 'title': titles.get(k, ''), 'feed': v}
                    for k, v in sorted(pages.items()) if 'no-parent' in v][:8],
        'year1967': year1967,
        'year1975nov': year1975,
        'eventsWithDependents': {k: v for k, v in by_event.items()},
        'counts': {
            'byKind': {k: v['count'] for k, v in feed['reports'].items()},
            'byCategory': Counter(k.split(':')[0] for k in pages),
        },
    }
    json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"relations {len(out['relations'])}, songs {len(out['songs'])}, stories {len(out['stories'])}, "
          f"1967 events {len(year1967)} ({sum(1 for e in year1967 if e['dependents'])} with a dependent), "
          f"events with dependents {len(by_event)}")


if __name__ == '__main__':
    main()
