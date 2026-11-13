#!/usr/bin/env python3
"""Build the Phase 13 mockups of Brucebase's stats pages (org/brucebase.org).

Reads sample pages from debug/bb-mirror/stats (scripts/copy-bb-stats-sample.sh)
and the survey debug/bb-stats-probe.json (scripts/probe-bb-stats-pages.py),
takes real rows out of them, and writes debug/bb-stats-mockups.html: one
interactive section per page shape, with the open questions. No network.

Usage: python3 scripts/build-bb-stats-mockups.py [stats_dir] [out_html]
"""
import collections
import importlib.util
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'debug', 'bb-mirror', 'stats')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', 'debug', 'bb-stats-mockups.html')
PROBE = os.path.join(HERE, '..', 'debug', 'bb-stats-probe.json')

_spec = importlib.util.spec_from_file_location('probe', os.path.join(HERE, 'probe-bb-stats-pages.py'))
probe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(probe)
Node = probe.Node


def load(name):
    """The parsed #page-content of stats_<name>.html (or <name>.html)."""
    path = os.path.join(SRC, f'stats_{name}.html')
    if not os.path.exists(path):
        path = os.path.join(SRC, f'{name}.html')
    b = probe.Builder()
    b.feed(probe.page_content(open(path, encoding='utf-8', errors='replace').read()))
    return b.root


def tab_path(node):
    """The tab labels a node sits under, outermost first."""
    path = []
    p = node
    while p is not None:
        par = p.parent
        if isinstance(par, Node) and 'yui-content' in par.cls() and p.tag == 'div':
            panels = [k for k in par.kids if isinstance(k, Node) and k.tag == 'div']
            i = panels.index(p)
            nav = par.parent
            uls = [k for k in nav.kids if isinstance(k, Node) and 'yui-nav' in k.cls()]
            labels = [li.text() for li in uls[0].kids if isinstance(li, Node) and li.tag == 'li'] if uls else []
            path.append(labels[i] if i < len(labels) else f'#{i}')
        p = par
    return list(reversed(path))


EVENT_RE = re.compile(r'^(\d{4}-\d\d-\d\d)\s+(.+)$')


def turn(venue):
    """'Left Foot (The)' → 'The Left Foot' (the wiki's sort form turned round)."""
    m = re.match(r'^(.*) \((The|A|An)\)$', venue)
    return f'{m.group(2)} {m.group(1)}' if m else venue


def split_event(text):
    """'2014-12-07 Kennedy Center, Washington, DC' → date, venue, city, state."""
    m = EVENT_RE.match(text)
    if not m:
        return None
    parts = [x.strip() for x in m.group(2).split(',')]
    state = parts.pop() if len(parts) >= 3 else ''
    city = parts.pop() if len(parts) >= 2 else ''
    return [m.group(1), turn(', '.join(parts)), city, state]


def link_items(name, prefix):
    """Every li > a[href^=prefix] with its tab path."""
    root = load(name)
    out = []
    for a in root.find_all('a'):
        href = a.attrs.get('href', '')
        if href.startswith(prefix) and a.parent is not None and a.parent.tag == 'li':
            out.append((a.text(), href, tab_path(a)))
    return out


def m1_pages():
    """Shape A: tabbed link lists, four real pages."""
    pages = []
    rows = [[t, h, ' › '.join(p).replace('=- ', '').replace(' -=', '')] for t, h, p in
            link_items('songs-official-video', '/song:')]
    pages.append({'id': 'songs-official-video', 'title': 'Songs - Official Video Available',
                  'cols': ['Song', 'Letter'], 'rows': [[{'t': r[0], 'h': r[1]}, r[2]] for r in rows]})
    rows = link_items('bootlegs-label', '/bootleg:')
    pages.append({'id': 'bootlegs-label', 'title': 'Bootleg - Label', 'cols': ['Bootleg', 'Label'],
                  'rows': [[{'t': t, 'h': h}, ' › '.join(p)] for t, h, p in rows]})
    for pid, title, pre in (('circulating-audio', 'Circulating Audio - Yes', '/'),
                            ('venues-in-new-jersey', 'Venues In New Jersey (NJ)', '/')):
        rows = []
        for t, h, p in link_items(pid, pre):
            kind = h[1:].split(':', 1)[0]
            if kind not in ('gig', 'nogig', 'interview', 'rehearsal', 'recording', 'venue', 'recnote'):
                continue
            ev = split_event(t)
            if ev:
                rows.append([{'t': t, 'h': h}, ev[0], ev[1], ev[2], ev[3], kind, ' › '.join(p)])
            else:
                parts = [x.strip() for x in t.split(',')]
                st = parts.pop() if len(parts) >= 3 else ''
                ci = parts.pop() if len(parts) >= 2 else ''
                rows.append([{'t': t, 'h': h}, '', ', '.join(parts), ci, st, kind, ' › '.join(p)])
        pages.append({'id': pid, 'title': title,
                      'cols': ['Event', 'Date', 'Venue', 'City', 'State', 'Kind', 'Tab'], 'rows': rows})
    return pages


def own_rows(t):
    """A table's own rows as lists of cells: [text, first href]."""
    rows = []
    for r in t.walk():
        if r.tag != 'tr' or probe.nearest(r.parent, 'table') is not t:
            continue
        cells = []
        for c in r.kids:
            if isinstance(c, Node) and c.tag in ('td', 'th'):
                a = c.find_all('a')
                cells.append({'t': c.text(), 'h': a[0].attrs.get('href', '') if a else ''})
        rows.append(cells)
    return rows


def prev_heading(t):
    """The nearest h1/h2/h3 before a table in document order."""
    seen = None
    stack = [t]
    while stack:
        n = stack.pop()
        par = n.parent
        if par is None:
            break
        i = par.kids.index(n)
        for k in reversed(par.kids[:i]):
            if isinstance(k, Node):
                hs = [k] if k.tag in ('h1', 'h2', 'h3') else [h for h in k.walk() if h.tag in ('h1', 'h2', 'h3')]
                if hs:
                    seen = hs[-1].text()
                    return seen
        stack.append(par)
    return seen


def tables_of(name, min_rows=2, group='tab'):
    """The page's top-level tables: header, rows, group (tab path or heading)."""
    root = load(name)
    out = []
    for t in root.find_all('table'):
        if probe.nearest(t.parent, 'table') is not None:
            continue
        rows = own_rows(t)
        if len(rows) < min_rows:
            continue
        g = ' › '.join(tab_path(t)) if group == 'tab' else (prev_heading(t) or '')
        out.append({'group': g, 'header': [c['t'] for c in rows[0]], 'rows': rows[1:]})
    return out


def m2_pages():
    """Shape B: the wiki's own tables."""
    pages = []
    aw = tables_of('awards')
    pages.append({'id': 'awards', 'title': 'Awards', 'mode': 'multi', 'groups': [
        {'name': x['group'], 'cols': x['header'], 'rows': x['rows']} for x in aw]})
    t = tables_of('song-count-by-tour-btr')[0]
    pages.append({'id': 'song-count-by-tour-btr', 'title': 'Song Count By Tour - Born To Run Tour',
                  'mode': 'single', 'groups': [{'name': '', 'cols': t['header'], 'rows': t['rows']}]})
    t = tables_of('city-performance-count')[0]
    pages.append({'id': 'city-performance-count', 'title': 'Performance Count Per City', 'mode': 'single',
                  'groups': [{'name': '', 'cols': t['header'], 'rows': t['rows']}]})
    tl = tables_of('on-the-tracks-timeline')
    pages.append({'id': 'on-the-tracks-timeline', 'title': 'On The Tracks - Timeline', 'mode': 'single',
                  'groups': [{'name': '', 'cols': tl[0]['header'],
                              'rows': [r for x in tl for r in x['rows']]}]})
    so = tables_of('set-openers-and-closers', group='heading')
    pages.append({'id': 'set-openers-and-closers', 'title': 'Set Openers And Closers', 'mode': 'multi',
                  'groups': [{'name': x['group'], 'cols': ['Opener', '#', 'Closer', '#'],
                              'rows': [r for r in x['rows'] if len(r) == 4]} for x in so[1:]]})
    return pages


TOUR_RE = re.compile(r'Performed at (\d+) show\(s\) of (\d+) on the (.+?)\.\s*(\((?:Excl|Incl)[^)]*\))?')


def m3_page(name):
    """Shape C: one song's per-tour counts."""
    text = load(name).text()
    rows = []
    for m in TOUR_RE.finditer(text):
        played, shows = int(m.group(1)), int(m.group(2))
        rows.append([m.group(3), played, shows, round(100 * played / shows, 1) if shows else 0,
                     (m.group(4) or '').strip('()')])
    return {'id': name, 'rows': rows}


def m4_page():
    """Shape D: an album's studio sessions page."""
    tabs = tables_of('born-to-run-studio-sessions', min_rows=1)
    released = [x for x in tabs if x['header'][:2] == ['#', 'Song Title']]
    addrec = [x for x in tabs if x['header'] and re.match(r'^[A-Z0-9 \'’,.&()!?-]+ - V\d', x['header'][0])]
    ver_rows = []
    for x in addrec[:6]:
        for r in [[{'t': c} for c in x['header']]] + x['rows']:
            t = r[0]['t'] if r else ''
            m = re.match(r'^(.+?) - (V\d+\w*)(?: - (take \d+\w*))?(?: \((.+)\))?$', t)
            if m:
                ver_rows.append([m.group(1).title(), m.group(2), m.group(3) or '', m.group(4) or '',
                                 r[1]['t'] if len(r) > 1 else '', r[2]['t'] if len(r) > 2 else ''])
    return {'released': released[0] if released else None, 'versions': ver_rows[:24],
            'tabs': [t['labels'] for t in json.load(open(PROBE))['pages']['born-to-run-studio-sessions']['tabviews']]}


def m5_page():
    """Shape E: the discography's cover tiles."""
    root = load('discography-album')
    out = []
    for img in root.find_all('img'):
        src = img.attrs.get('src', '')
        if '/local--files/' not in src:
            continue
        a = img.parent if img.parent is not None and img.parent.tag == 'a' else None
        out.append({'href': a.attrs.get('href', '') if a else '', 'file': src.rsplit('/', 1)[-1],
                    'alt': img.attrs.get('alt', ''), 'tab': ' › '.join(tab_path(img))})
    return out


def m6_page():
    """Shape F: songs-registered — plain li titles, matched against stats:songs."""
    root = load('songs-registered')
    titles = [li.text() for li in root.find_all('li') if not li.find_all('a')]
    songs = {}
    for t, h, _ in link_items('songs', '/song:'):
        songs.setdefault(t.lower(), h)
    rows = [[t, songs.get(t.lower(), '')] for t in titles]
    return {'rows': rows, 'known': sum(1 for r in rows if r[1])}


def main():
    survey = json.load(open(PROBE))
    shapes = collections.Counter()
    for r in survey['pages'].values():
        shapes[r['shape'][0] if r['shape'] else 'small'] += 1
    data = {
        'env': survey['env'], 'pages_read': survey['pages_read'], 'families': survey['families'],
        'm1': m1_pages(), 'm2': m2_pages(),
        'm3': [m3_page(n) for n in ('hungry-heart-tour', 'downbound-train-tour', 'seaside-bar-song-tour')],
        'm4': m4_page(), 'm5': m5_page(), 'm6': m6_page(),
        'pages': sorted([n, '+'.join(r['shape']), r['family'] or '', r['title'],
                         max([t['rows'] for t in r['tables']] or [0]), r['li_linked']]
                        for n, r in survey['pages'].items()),
    }
    tpl = open(os.path.join(HERE, 'bb-stats-mockups.template.html'), encoding='utf-8').read()
    html = tpl.replace('/*__DATA__*/null', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(html)
    print(f'm1 {[len(p["rows"]) for p in data["m1"]]} m2 {[sum(len(g["rows"]) for g in p["groups"]) for p in data["m2"]]} '
          f'm3 {[len(p["rows"]) for p in data["m3"]]} m4 versions {len(data["m4"]["versions"])} '
          f'm5 {len(data["m5"])} m6 {len(data["m6"]["rows"])} known {data["m6"]["known"]}')
    print(f'wrote {os.path.abspath(OUT)} ({os.path.getsize(OUT)} bytes)')


if __name__ == '__main__':
    main()
