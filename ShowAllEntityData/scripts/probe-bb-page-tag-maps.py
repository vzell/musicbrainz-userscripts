#!/usr/bin/env python3
"""Probe: a song or venue page's own tag, as the shows that link it carry it.

Track A batch 3b, the songs family and the place family's venue part
(org/springsteen-marriage.org; vzell, 2026-11-19: songs from the setlist link
AND a song->tag map from the feed; the venue through a venue->tag map from
the feed). Reads every event page of BruceParser's mirror (its setlist's song
links, its "Venue" link) with the rows of scripts/probe-bb-batch3-findings.py
--rows (the tags of all of a show's pages), and every song and venue page's
own tags, and decides each page's tag: of the page's own tags, the one with
the best F1 over the shows that link the page (recall: the share of those
shows carrying it; precision: the share of all shows carrying it that link
the page), which leaves out place, letter and kind tags a venue page shares
with many shows. Then it counts, for every (show, linked song) and (show,
venue):

- songs: the link's own title tags (batch 4's _bbTagSongTitleTags() over the
  link's text and address) carried; the map's tag carried; either; neither;
- venues: the map's tag carried or not.

Read-only. No network.

Usage:
    python3 scripts/probe-bb-page-tag-maps.py ROWS.json [--mirror DIR] [--json FILE] [--list WHAT]

    --json FILE  write {"songTags": {page: [tag]}, "venueTags": {page: [tag]}} (the maps as the feed would carry them)
    --list WHAT  songs-missing, venues-missing (the shows the rule flags, with the tag), songmap, venuemap (low-recall pages)
"""
import argparse
import importlib.util
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


b3 = load('b3', 'probe-bb-batch3-findings.py')
pt = load('pt', 'probe-bb-page-tags.py')

# Tags no song or venue page is named by: kinds, letters, the page states.
GENERIC = {'song', 'venue', 'lyricsheet', 'underconstruction', 'redirect', 'files', 'retail', 'cover', 'original',
           'unreleased', 'released', 'brucespringsteen', '0-9'}


def page_name(href):
    """"/song:fire-2" -> "song:fire-2"; '' for another link."""
    m = re.match(r'^/((?:song|venue):[^/#?]+)', href or '')
    return m.group(1) if m else ''


def links_of(doc):
    """A show's setlist song links [(page, text)] in order, and its venue page ('' without)."""
    cont = b3.setlist_container(doc)
    songs = []
    if cont is not None:
        for a in b3.song_links(cont):
            p = page_name(a.attrs.get('href'))
            if p:
                songs.append((p, b3.strip(a.text())))
    pc = b3.by_id(doc, 'page-content') or doc
    venue = ''
    for a in pc.find_all('a', lambda a: '/venue:' in (a.attrs.get('href') or '')):
        if b3.strip(a.text()) == 'Venue':
            venue = page_name(a.attrs.get('href'))
            break
    return songs, venue


PRECISION = 0.9


def choose(page_own, linking, carried_by):
    """The page's tags: its own non-generic tags carried (almost) only by shows that link it.

    Every tag with precision >= PRECISION (the share of all shows carrying it
    that link the page), most carried first (the page's order on a tie): a
    song is often tagged two ways, "btr" (1,618 shows) and "borntorun" (295),
    both only on shows of Born to Run. Returns (tags, recall of any of them),
    or ([], 0).
    """
    n = len(linking)
    if not n:
        return [], 0.0
    cands = []
    for i, t in enumerate(page_own):
        if (t in GENERIC or re.fullmatch(r'[a-z]', t) or re.fullmatch(r'\d+', t) or t.startswith(('tour_', 'r_', 'pl_'))
                or t in b3.MONTHS or t in b3.DAYS):
            continue
        hit = sum(1 for s in linking if t in carried_by[s])
        if not hit:
            continue
        total = sum(1 for tags in carried_by.values() if t in tags)
        if hit / total >= PRECISION:
            cands.append((-hit, i, t))
    tags = [t for _, _, t in sorted(cands)]
    if not tags:
        return [], 0.0
    covered = sum(1 for s in linking if any(t in carried_by[s] for t in tags))
    return tags, covered / n

def choose_f1(page_own, linking, carried_by):
    """A venue's tag: the best F1 among its own non-generic tags (a venue's tag can be shared by two venue
    pages, the Stone Pony and its Summer Stage, so a precision rule would drop it); ([tag], recall) or ([], 0)."""
    best = (None, 0.0, 0.0)
    n = len(linking)
    if not n:
        return [], 0.0
    for t in page_own:
        if (t in GENERIC or re.fullmatch(r'[a-z]', t) or re.fullmatch(r'\d+', t) or t.startswith(('tour_', 'r_', 'pl_'))
                or t in b3.MONTHS or t in b3.DAYS):
            continue
        hit = sum(1 for s in linking if t in carried_by[s])
        if not hit:
            continue
        recall = hit / n
        total = sum(1 for tags in carried_by.values() if t in tags)
        precision = hit / total if total else 0
        f1 = 2 * recall * precision / (recall + precision)
        if f1 > best[1] or (f1 == best[1] and recall > best[2]):
            best = (t, f1, recall)
    return ([best[0]], best[2]) if best[0] else ([], 0.0)


def song_rule(r, song_tags, combos):
    """The songs family's missing tags of one row, as the userscript must compute them (vzell, 2026-11-19).

    The setlist's linked songs (facts.songs, by line), each once: a song in
    the feed's songTags (the map keeps those whose tags at least 90 % of
    their shows carry) expects its first tag; its other tags, the link's own
    title tags (batch 4's) and, on a line the feed's songCombos names
    ("land of hope and dreams - people get ready"), the combination's tag
    count too. A song outside the map and an entry without a link are not
    checked.
    """
    groups = (r.get('facts') or {}).get('songs') or []
    tags = set(r['tags'])
    for _, more in r.get('pages') or []:
        tags.update(more)
    extra = {}
    order = []
    for g in groups:
        combo = combos.get(' - '.join(x['text'] for x in g).lower().strip())
        for x in g:
            if x['page'] not in extra:
                extra[x['page']] = []
                order.append((x['page'], x['text']))
            if combo and combo not in extra[x['page']]:
                extra[x['page']].append(combo)
    missing = []
    for page, text in order:
        mp = song_tags.get(page)
        if not mp:
            continue
        rest = mp[1:] + pt.ship_title_tags(text, page) + extra[page]
        if not b3.present(mp[0], tags) and not any(t in tags for t in rest) and mp[0] not in missing:
            missing.append(mp[0])
    return missing


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('rows')
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--json')
    ap.add_argument('--list')
    ap.add_argument('--own-only', action='store_true', help='derive the maps from the show pages\' own tags only')
    ap.add_argument('--feed', help='a bb-feed.json: --rule-json checks the songs with ITS songTags and songCombos')
    ap.add_argument('--rule-json', help='write the songs rule\'s findings of EVERY row as {name: {missing, spurious}}')
    args = ap.parse_args(argv)
    rows = json.load(open(args.rows, encoding='utf-8'))
    mirror = b3.Mirror(os.path.realpath(args.mirror))
    carried = {}
    show_songs = {}
    show_venue = {}
    song_links = defaultdict(list)
    venue_links = defaultdict(list)
    derive = {}
    for r in rows:
        tags = set(r['tags'])
        for _, more in r.get('pages') or []:
            tags.update(more)
        carried[r['name']] = tags
        derive[r['name']] = set(r['tags']) if args.own_only else tags
        songs, venue = links_of(b3.parse(mirror.read(r['name'])))
        show_songs[r['name']] = songs
        show_venue[r['name']] = venue
        for p, _ in songs:
            if r['name'] not in song_links[p]:
                song_links[p].append(r['name'])
        if venue:
            venue_links[venue].append(r['name'])
    maps = {'songTags': {}, 'venueTags': {}}
    recalls = {}
    low = {'song': [], 'venue': []}
    for kind, links in (('song', song_links), ('venue', venue_links)):
        for p, linking in links.items():
            markup = mirror.read(p)
            if markup is None:
                continue
            own = [t.lower() for t in b3.page_tags(markup)]
            tags, recall = (choose if kind == 'song' else choose_f1)(own, linking, derive)
            if tags:
                maps[f'{kind}Tags'][p] = tags
                recalls[p] = recall
            tag = tags[0] if tags else None
            if recall < 0.5:
                low[kind].append((p, tag, round(recall, 2), len(linking)))
    print(f'mirror {mirror.root}')
    print(f'pages linked: songs {len(song_links)} (map {len(maps["songTags"])}), venues {len(venue_links)} (map {len(maps["venueTags"])})')
    print(f'low recall (< 0.5): songs {len(low["song"])}, venues {len(low["venue"])}')

    # Songs: the link's own title tags, the map's tag.
    sc = Counter()
    song_missing = defaultdict(list)
    for show, songs in show_songs.items():
        tags = carried[show]
        seen = set()
        for p, text in songs:
            if p in seen:
                continue
            seen.add(p)
            own = pt.ship_title_tags(text, p)
            mp = maps['songTags'].get(p, [])
            a = any(t in tags for t in own)
            b = any(t in tags for t in mp)
            sc['links'] += 1
            sc['link rule'] += a
            sc['map'] += b
            sc['either'] += a or b
            if not (a or b):
                song_missing[show].append((mp[0] if mp else own[0] if own else p, text))
    # Variants: a song checked only when its map entry's recall reaches a threshold.
    for thr in (0.0, 0.5, 0.8, 0.9):
        shows = set()
        links = 0
        for show, miss in song_missing.items():
            for tag, text in miss:
                p = next((q for q, tx in show_songs[show] if tx == text), '')
                if maps['songTags'].get(p) and recalls.get(p, 0) >= thr:
                    shows.add(show)
                    links += 1
        print(f'  songs with a map entry of recall >= {thr}: {links} missing on {len(shows)} shows')
    medley = sum(1 for miss in song_missing.values() for tag, _ in miss if tag in ('lohad', 'pgr', 'peoplegetready'))
    print(f'  of the misses, lohad/pgr (the "LOHAD - PEOPLE GET READY" medley, tagged lohad.pgr): {medley}')
    print(f'\nsongs: {sc["links"]} (show, song) links; the link\'s title tags carried {sc["link rule"]}, the map\'s tag {sc["map"]}, '
          f'either {sc["either"]} ({100 * sc["either"] / max(sc["links"], 1):.1f} %); neither {sc["links"] - sc["either"]} '
          f'on {len(song_missing)} shows')
    vc = Counter()
    venue_missing = {}
    for show, v in show_venue.items():
        if not v:
            continue
        vc['shows'] += 1
        mp = maps['venueTags'].get(v)
        if not mp:
            vc['no map'] += 1
            continue
        if mp[0] in carried[show]:
            vc['carried'] += 1
        else:
            venue_missing[show] = mp[0]
    print(f'venues: {vc["shows"]} shows with a venue link; the map\'s tag carried {vc["carried"]}, missing {len(venue_missing)}, '
          f'no map entry {vc["no map"]}')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump(maps, fh, ensure_ascii=False, sort_keys=True)
    if args.feed and args.rule_json:
        feed = json.load(open(args.feed, encoding='utf-8'))
        combos = (feed.get('tagTables') or {}).get('songCombos') or {}
        every = {r['name']: song_rule(r, feed.get('songTags') or {}, combos) for r in rows}
        flagged = {n: m for n, m in every.items() if m}
        print(f'\nthe songs rule (the feed\'s songTags, title tags, songCombos): {len(flagged)} shows, '
              f'{sum(len(m) for m in flagged.values())} missing song tags')
        with open(args.rule_json, 'w', encoding='utf-8') as fh:
            json.dump({n: {'missing': m, 'spurious': []} for n, m in every.items()}, fh, ensure_ascii=False)
    if args.list == 'songs-missing':
        for show, miss in list(song_missing.items())[:60]:
            print(f'  {show}  {miss}')
    elif args.list == 'venues-missing':
        for show, t in list(venue_missing.items())[:60]:
            print(f'  {show}  {t}')
    elif args.list in ('songmap', 'venuemap'):
        for p, tag, rec, n in low['song' if args.list == 'songmap' else 'venue'][:60]:
            print(f'  {p}  {tag}  recall {rec} of {n}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
