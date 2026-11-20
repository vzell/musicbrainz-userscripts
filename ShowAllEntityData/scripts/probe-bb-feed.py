#!/usr/bin/env python3
"""Probe: BruceParser's Brucebase feed against the mirror it was made from.

  python3 scripts/probe-bb-feed.py FEED.json RUN_DIR OUT.json

For every page the feed names:
  1. the page exists in the mirror (RUN_DIR/<category>/<category>_<rest>.html);
  2. its kind holds on the mirror page as the userscript will see it:
     - no-tags: the page's div.page-tags has no tag;
     - first-letter: the page's tags lack the letter;
     - dependent-title: the page's own #page-title, compared with the feed's
       "title" the way the userscript compares (whitespace squeezed, a
       leading category word like "Web " or "Notes " dropped) - this decides
       the "the page in front wins" rule;
     - no-parent: the page's breadcrumbs div has no link;
     - date-parts (feed 1.1): each missing tag is absent, each wrong tag
       present;
     - files-no-images (feed 1.1): the page is tagged files and its
       #page-content shows no picture: no <img> but the wiki's shared
       includes (src under /local--files/content:files/, the social icons
       every page has). The userscript's live check uses the same rule.
       Checked against BruceParser's own yes/no over its 7,023 pages
       (2026-11-17): it never misses a page with pictures; it counts a
       picture on 290 pages BruceParser calls "no", retail and news pages
       showing a cover stored under files:artwork-*. A rule of "stored under
       the page's own name" missed 836 (gallery pages store theirs
       elsewhere).
  3. the reverse index: which shows have a dependent page with a differing
     title (the feed's "event"), and on which year pages they are; and
     (feed 1.6) which shows have a dependent page named differently
     (dependent-name's "event"), which the userscript marks too.
  4. the rows each Brucebase list would mark: songs and relations from the
     links the mirror's stats:songs and stats:relations pages really have
     (stats:songs does NOT link every song: page: 1,679 of 1,685 on the run
     of 2026-11-15, and the four first-letter songs of the feed are among the
     6 it leaves out; until 2026-11-17 this probe assumed it did), the pages
     of the category no list links, the storyteller tag page (every story:
     page tagged storyteller, from the mirror's tags), and the year tables
     (the shows of point 3).
  6. (feed 1.3) the MusicBrainz part: every event of BruceParser's
     search/event_linked_to_artist.org with a Brucebase link, classified here
     independently (no-entry: the anchor is not in brucebase-event.txt;
     shared: two or more events link one entry; not-anchor: no year-page
     anchor; since feed 1.7 date-differs: a link of none of those three
     whose anchor's date is not the event's date, compared as far as both
     go: an anchor's "00" and a date without month or day leave that part
     out), against the feed's "mb"; and the test fixtures holding such
     events.
  5. (feed 1.2) the year listings: every row of every <year>-list.html links
     "/<year>#<anchor>" with its own date first; the feed's "anchors" give
     its page (one page, or among several the one whose name has the row's
     date right after the category, else none: the userscript's rule), and
     the row is marked with that page's kinds; also the anchors no listing
     row links.

Counts and every mismatch go to OUT.json; a summary is printed.
"""
import html
import json
import os
import re
import sys
from collections import Counter, defaultdict

SITE = 'https://brucebase.wikidot.com/'


def page_file(run_dir, name):
    cat, rest = name.split(':', 1)
    return os.path.join(run_dir, cat, f'{cat}_{rest}.html')


def read(path):
    with open(path, encoding='utf-8', errors='replace') as f:
        return f.read()


def page_title(src):
    m = re.search(r'<div id="page-title">(.*?)</div>', src, re.S)
    return html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else None


def page_tags(src):
    m = re.search(r'<div class="page-tags">(.*?)</div>', src, re.S)
    if not m:
        return None
    return [html.unescape(t).strip() for t in re.findall(r'<a [^>]*href="/system:page-tags/tag/[^"]*"[^>]*>(.*?)</a>', m.group(1), re.S)]


def breadcrumb_links(src):
    m = re.search(r'<div id="breadcrumbs">(.*?)</div>', src, re.S)
    return re.findall(r'href="([^"]+)"', m.group(1)) if m else []


def content_images(src):
    """The pictures inside #page-content (up to #page-info): every <img>
    but the wiki's shared includes (src under /local--files/content:files/)."""
    i = src.find('id="page-content"')
    j = src.find('id="page-info"', i)
    if i < 0:
        return None
    return sum(1 for m in re.finditer(r'<img\b[^>]*\bsrc="([^"]*)"', src[i:j if j > 0 else len(src)])
               if '/local--files/content:files/' not in m.group(1))


def saed_kinds(kinds):
    """A feed page's kinds as the userscript has them: feed 1.1's
    date-parts is date-missing and/or date-wrong, one per list it has."""
    out = []
    for k, v in kinds.items():
        if k == 'date-parts':
            out += [x for x, part in (('date-missing', 'missing'), ('date-wrong', 'wrong')) if v.get(part)]
        else:
            out.append(k)
    return out


def squeeze(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def without_kind_word(title):
    """The userscript's comparison: a title that does not start with its date
    loses the word(s) before the date ("Web 1973-12-22 …", "Story 1972-…")."""
    m = re.match(r'^(.*?)\s*(\d{4}-\d{2}-\d{2}\b.*)$', title)
    return m.group(2) if m and m.group(1) else title


def main():
    feed_path, run_dir, out_path = sys.argv[1:4]
    feed = json.load(open(feed_path, encoding='utf-8'))
    out = {'missing': [], 'kindFalse': [], 'titleCompare': Counter(), 'titleOdd': [], 'byKind': Counter(),
           'reverse': {}, 'lists': {}, 'dateParts': {}, 'filesImages': Counter()}
    for name, kinds in sorted(feed['pages'].items()):
        path = page_file(run_dir, name)
        if not os.path.exists(path):
            out['missing'].append(name)
            continue
        src = read(path)
        tags = page_tags(src)
        for kind, val in kinds.items():
            out['byKind'][kind] += 1
            if kind == 'no-tags' and tags:
                out['kindFalse'].append([name, kind, f'{len(tags)} tags'])
            elif kind == 'first-letter' and tags is not None and val in tags:
                out['kindFalse'].append([name, kind, f'has {val}'])
            elif kind == 'no-parent' and breadcrumb_links(src):
                out['kindFalse'].append([name, kind, 'has a breadcrumb link'])
            elif kind == 'date-parts':
                have = [t for t in val.get('missing', []) if tags and t in tags]
                gone = [t for t in val.get('wrong', []) if not tags or t not in tags]
                if have or gone:
                    out['kindFalse'].append([name, kind, f'has {have}, lacks {gone}'])
                out['dateParts'][name] = {'value': val, 'tags': tags}
            elif kind == 'files-no-images':
                imgs = content_images(src)
                out['filesImages'][imgs] += 1
                if not tags or 'files' not in tags or imgs:
                    out['kindFalse'].append([name, kind, f'tags {tags and "files" in tags}, images {imgs}'])
            elif kind == 'dependent-title':
                own = squeeze(page_title(src))
                feedt = squeeze(val['title'])
                if own == feedt:
                    out['titleCompare']['equal'] += 1
                elif squeeze(without_kind_word(own)) == feedt:
                    out['titleCompare']['equal without the kind word'] += 1
                else:
                    out['titleCompare']['different'] += 1
                    out['titleOdd'].append([name, own, feedt])
                if squeeze(without_kind_word(own)) == squeeze(val['eventTitle']):
                    out['kindFalse'].append([name, kind, 'own title equals the event title'])

    # 3. reverse index: show -> dependents, and the year pages that list the show
    rev = defaultdict(list)
    for name, kinds in feed['pages'].items():
        dt = kinds.get('dependent-title')
        if dt and dt.get('event'):
            rev[dt['event']].append(name)
    years = {}
    for ev in rev:
        y = re.match(r'^[a-z]+:(\d{4})-', ev)
        years[ev] = y.group(1) if y else None
    out['reverse'] = {'shows': len(rev), 'dependents': sum(len(v) for v in rev.values()),
                      'perYear': Counter(v for v in years.values()), 'showExists': sum(1 for ev in rev if os.path.exists(page_file(run_dir, ev)))}
    # feed 1.6: the shows a dependent page named differently marks (the userscript's _bbFeed.byEventName)
    rev_name = defaultdict(list)
    for name, kinds in feed['pages'].items():
        dn = kinds.get('dependent-name')
        if dn and dn.get('event'):
            rev_name[dn['event']].append(name)
    out['reverseName'] = {'shows': len(rev_name), 'dependents': sum(len(v) for v in rev_name.values())}

    # 4. list rows: songs, relations, story pages tagged storyteller
    names = []
    with open(os.path.join(run_dir, 'all-sorted.txt'), encoding='utf-8', errors='replace') as f:
        for line in f:
            p = line.rstrip('\n').split('>')
            if len(p) >= 3:
                names.append((p[0], p[2].split()))
    flagged = feed['pages']

    def kinds_of(n):
        """A row's kinds as the userscript marks them: the page's own, and
        for a show dependent-title when one of its pages is titled
        differently, dependent-name when one is named differently (the
        reverse indexes of point 3; feed 1.6's dependent-name was missing
        here until 2026-11-20, so the checker showed the shows it marks on
        the news tag list and the year listings as differences)."""
        k = saed_kinds(flagged.get(n, {}))
        if n in rev and 'dependent-title' not in k:
            k = k + ['dependent-title']
        if n in rev_name and 'dependent-name' not in k:
            k = k + ['dependent-name']
        return k
    for label, cat, list_page in [('songs (stats:songs)', 'song', 'stats:songs'),
                                  ('relations (stats:relations)', 'relation', 'stats:relations')]:
        linked = set(re.findall(r'href="/(' + cat + r':[^"#?/]+)"', read(page_file(run_dir, list_page))))
        every = {n for n, t in names if n.startswith(cat + ':')}
        rows = sorted(every & linked)
        hit = [n for n in rows if kinds_of(n)]
        unlinked = sorted(every - linked)
        out['lists'][label] = {'rows': len(rows), 'marked': len(hit), 'kinds': Counter(k for n in hit for k in kinds_of(n)),
                               'pagesOfCategory': len(every), 'unlinked': unlinked,
                               'unlinkedInFeed': {n: sorted(flagged[n]) for n in unlinked if n in flagged}}
    for label, tag in [('tag storyteller (story:)', 'storyteller'), ('tag files', 'files'), ('tag news', 'news'), ('tag media', 'media')]:
        rows = [n for n, t in names if tag in t and (tag != 'storyteller' or n.startswith('story:'))]
        hit = [n for n in rows if kinds_of(n)]
        out['lists'][label] = {'rows': len(rows), 'marked': len(hit), 'kinds': Counter(k for n in hit for k in kinds_of(n))}

    # 5. the year listings, through the feed's anchors (feed 1.2)
    anchors = feed.get('anchors') or {}
    lst = {'rows': 0, 'marked': 0, 'kinds': Counter(), 'shared': [], 'markedRows': [], 'anchorsUnlinked': []}
    linked = set()
    for fn in sorted(os.listdir(run_dir)):
        if not re.match(r'^\d{4}(-\d\d)?-list\.html$', fn):
            continue
        src = read(os.path.join(run_dir, fn))
        for m in re.finditer(r'<li><a href="/(\d{4}(?:-\d\d)?#[0-9a-z]+)">(.*?)</a>', src, re.S):
            key, text = m.group(1), html.unescape(re.sub(r'<[^>]+>', '', m.group(2)))
            d = re.match(r'\s*(\d{4}-\d{2}-\d{2})', text)
            date = d.group(1) if d else ''
            lst['rows'] += 1
            linked.add(key)
            pages = anchors.get(key, [])
            if len(pages) > 1:
                fit = [x for x in pages if date and x.split(':', 1)[1].startswith(date)]
                page = fit[0] if len(fit) == 1 else ''
                lst['shared'].append({'list': fn, 'anchor': key, 'date': date, 'pages': pages, 'picked': page})
            else:
                page = pages[0] if pages else ''
            k = kinds_of(page) if page else []
            if k:
                lst['marked'] += 1
                lst['kinds'].update(k)
                lst['markedRows'].append([fn, key, date, page, k])
    lst['anchorsUnlinked'] = sorted(set(anchors) - linked)
    out['listings'] = lst

    # 6. the MusicBrainz part (feed 1.3)
    mbmap = feed.get('mb') or {}
    if mbmap:
        wiki = set()
        for line in open(os.path.join(run_dir, 'brucebase-event.txt'), encoding='utf-8', errors='replace'):
            f = [x.strip() for x in line.split('|')]
            if len(f) > 5 and f[4]:
                wiki.add(f[4])
        bp = os.path.dirname(os.path.dirname(os.path.realpath(run_dir)))
        evs = []
        dates = {}
        for line in open(os.path.join(bp, 'search/event_linked_to_artist.org'), encoding='utf-8', errors='replace'):
            m = re.search(r'musicbrainz\.org/event/([0-9a-f-]{36})\]', line)
            b = re.search(r'\[\[https?://brucebase\.wikidot\.com/([^\]]+)\]\[BB\]\]', line)
            if m and b:
                evs.append((m.group(1), b.group(1)))
                cols = line.split('|')
                # the Date column: the begin date, or "begin - end" (a span)
                dates[m.group(1)] = cols[5].strip() if len(cols) > 5 else ''
        cnt = Counter(b for _, b in evs)

        def anchor_date(b):
            """'1985#050185b' -> '1985-01-05'; '1976#000276' -> '1976-02'; '1949-64#230949' -> '1949-09-23'."""
            am = re.match(r'^(\d{4}|1949-64)#(\d\d)(\d\d)(\d\d)[a-z]?$', b)
            if not am:
                return None
            d = '19' + am.group(4) if am.group(1) == '1949-64' else am.group(1)
            if am.group(3) != '00':
                d += '-' + am.group(3) + ('-' + am.group(2) if am.group(2) != '00' else '')
            return d

        def date_differs(date, b):
            """The anchor's date outside the event's date or span, each pair cut to the shorter."""
            a = anchor_date(b)
            lo, _, hi = (date or '').partition(' - ')
            hi = hi or lo
            if not a or not all(re.match(r'^\d{4}(-\d\d){0,2}$', x) for x in (lo, hi)):
                return False
            n, k = min(len(a), len(lo)), min(len(a), len(hi))
            return a[:n] < lo[:n] or a[:k] > hi[:k]

        mine = {}
        for mbid, b in evs:
            if not re.match(r'^(\d{4}|1949-64)#[0-9a-z]+$', b):
                mine[mbid] = 'not-anchor'
            elif b not in wiki:
                mine[mbid] = 'no-entry'
            elif cnt[b] > 1:
                mine[mbid] = 'shared'
            elif date_differs(dates.get(mbid, ''), b):
                mine[mbid] = 'date-differs'
        theirs = {k: v['kind'] for k, v in mbmap.items()}
        fixtures = {}
        for fn in sorted(os.listdir(os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures'))):
            if fn.endswith('.html'):
                src = read(os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', fn))
                hit = sorted(set(re.findall(r'/event/([0-9a-f-]{36})', src)) & set(mbmap))
                if hit:
                    fixtures[fn] = hit
        out['mb'] = {'events': len(evs), 'byKind': Counter(mine.values()), 'feedByKind': Counter(theirs.values()),
                     'differ': sorted(set(mine.items()) ^ set(theirs.items())), 'fixtures': fixtures}

    json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=dict)
    print(f"feed pages {len(feed['pages'])}, missing in the mirror {len(out['missing'])}: {out['missing'][:5]}")
    print(f"by kind {dict(out['byKind'])} (feed reports {({k: v['count'] for k, v in feed['reports'].items()})})")
    print(f"kind not true on the mirror page: {len(out['kindFalse'])}")
    print(f"date-parts pages: {out['dateParts']}")
    print(f"files-no-images: images in #page-content {dict(out['filesImages'])}")
    for x in out['kindFalse'][:10]:
        print('   ', x)
    print(f"dependent-title, own title vs feed title: {dict(out['titleCompare'])}")
    for x in out['titleOdd'][:10]:
        print('    odd:', x)
    print(f"reverse index: {out['reverse']['shows']} shows, {out['reverse']['dependents']} dependents, "
          f"{out['reverse']['showExists']} show pages in the mirror, years {dict(out['reverse']['perYear'])}")
    print(f"reverse index of dependent-name: {out['reverseName']['shows']} shows, {out['reverseName']['dependents']} pages")
    if out.get('mb'):
        M = out['mb']
        print(f"mb: {M['events']} events with a Brucebase link; here {dict(M['byKind'])}, the feed {dict(M['feedByKind'])}, differing {len(M['differ'])}")
        print(f"    fixtures holding such events: {M['fixtures']}")
    L = out['listings']
    print(f"listings: {L['rows']} rows, {L['marked']} marked {dict(L['kinds'])}")
    for r in L['shared']:
        print(f"    shared anchor {r['anchor']} on {r['list']}, row date {r['date']}: picked {r['picked'] or 'none'} of {r['pages']}")
    print(f"    anchors no listing row links: {L['anchorsUnlinked']}")
    for k, v in out['lists'].items():
        print(f"list {k}: {v['rows']} rows, {v['marked']} marked {dict(v['kinds'])}")
        if 'unlinked' in v:
            print(f"    {len(v['unlinked'])} of {v['pagesOfCategory']} pages not on the list: {v['unlinked']}")
            print(f"    of them in the feed: {v['unlinkedInFeed']}")


if __name__ == '__main__':
    main()
