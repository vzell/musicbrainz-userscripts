#!/usr/bin/env python3
"""For the story pages whose name has no event page of the same slug in
the BruceParser mirror (scripts/probe-bb-story-pages.py's
debug/bb-story-probe.json), looks for the event another way: an event page
of the mirror whose slug starts with the story's (a truncated name) or
shares its date, and whether any event page's Storyteller tab names the
story page (an [[include]] leaves `story:` in the HTML?). Also counts how
many event pages of the mirror carry a Storyteller tab at all. No network.

    python3 scripts/probe-bb-story-events.py [mirror_dir]
"""
import collections
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIRROR = sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest'
DIRS = ['gig', 'nogig', 'recording', 'rehearsal', 'interview']


def main():
    """Prints what it finds."""
    with open(os.path.join(ROOT, 'debug', 'bb-story-probe.json'), encoding='utf-8') as fh:
        pages = json.load(fh)
    events = {}
    for d in DIRS:
        p = os.path.join(MIRROR, d)
        for f in os.listdir(p) if os.path.isdir(p) else []:
            m = re.match(rf'^{d}_(.+)\.html$', f)
            if m:
                events[m.group(1)] = d
    print(f'{len(events)} event pages in the mirror ({collections.Counter(events.values()).most_common()})')
    by_date = collections.defaultdict(list)
    for slug in events:
        by_date[slug[:10]].append(slug)
    missing = [p for p in pages if not p['event'] and re.match(r'^[a-z]+-\d{4}-\d\d-\d\d', p['name'])]
    print(f'{len(missing)} dated story pages without a same-slug event page')
    prefix = same_date = none = 0
    examples = collections.defaultdict(list)
    for p in missing:
        slug = re.sub(r'^[a-z]+-', '', p['name'])
        hits = [s for s in events if s.startswith(slug) or slug.startswith(s)]
        if hits:
            prefix += 1
            examples['prefix'].append((p['name'], hits[:2]))
            continue
        d = by_date.get(slug[:10], [])
        if d:
            same_date += 1
            examples['date'].append((p['name'], d[:3]))
        else:
            none += 1
            examples['none'].append(p['name'])
    print(f'  a prefix match: {prefix}; an event of the same date: {same_date}; nothing that day: {none}')
    for k, v in examples.items():
        print(f'  {k}: {v[:5]}')
    # Do event pages name their story page?
    named = tabbed = 0
    sample = []
    for slug, d in list(events.items()):
        with open(os.path.join(MIRROR, d, f'{d}_{slug}.html'), encoding='utf-8', errors='replace') as fh:
            h = fh.read()
        if re.search(r'<em>\s*Storyteller\s*</em>|>Storyteller<', h):
            tabbed += 1
        m = re.search(r'story:[a-z0-9-]+', h)
        if m:
            named += 1
            if len(sample) < 5:
                sample.append((slug, m.group(0), h[max(0, m.start() - 120):m.start()].replace('\n', ' ')[-120:]))
    print(f'event pages with a Storyteller tab: {tabbed}; naming a story: page: {named}')
    for s in sample:
        print(f'  {s[0]}: {s[1]} … {s[2]!r}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
