#!/usr/bin/env python3
"""Probe: a Brucebase venue, song, relation or retail page's tags.

Parity batch 4 (org/bbp-parity.org, "VENUE / SONG / RELATION / RETAIL page
tag checks"): BruceBaseParser's annotateVenuePageTags,
annotateSongPageTags, annotateRelationPageTags and annotateRetailPageTags,
as its CODE has them (doc/TAGS.md is older in several places). Reads EVERY
page of the four families in BruceParser's mirror, applies the rules per
family, and compares the first-letter family with BruceParser's own report
MISSING-first-character-tag-in-title_<kind>.txt.

Two readings per page:
- "bbp": BruceBaseParser's own, the page's own tags, Set.has for the fixed
  tags and isTagPresent() for the title, place and name tags (the input of
  scripts/check-bbp-page-tag-oracle.js);
- "saed": what SAED's chip box would say, the tags of the page and of its
  "-N" siblings (read while the page read last is over 450 characters, as
  _bbTagPagesStart() does), a number present padded or not.

Retail tab pages (-overview, -credits, -addinfo, -release, -recgig) and
playlist pages are counted, never checked (vzell, 2026-11-18).

Read-only. No network.

Usage:
    python3 scripts/probe-bb-page-tags.py [--mirror DIR] [--rows FILE]
            [--list KIND:FAMILY|KIND:spurious] [--show NAME] [--limit N]

    --mirror DIR   the mirror (default ~/git/scripts/BruceParser/bb/latest)
    --rows FILE    write EVERY checked page with its tags and both results as
                   JSON: the input of the oracle and of the shipped checker
    --list K:F     print every page of kind K with a missing tag of family F
                   (or K:spurious, K:bp for BruceParser's letter differences)
    --show NAME    print one page in full (venue:stone-pony-asbury-park-nj)
    --limit N      read only the first N pages of each kind (a quick look)
"""
import argparse
import importlib.util
import json
import os
import re
import sys
from collections import Counter, defaultdict

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location(
    'b3', os.path.join(_HERE, 'probe-bb-batch3-findings.py'))
b3 = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(b3)

KINDS = ('venue', 'song', 'relation', 'retail')
COUNTED = ('playlist',)
RETAIL_TAB_RE = re.compile(r'-(?:overview|credits|addinfo|release|recgig)$')
MONTHS = b3.MONTHS
TYPE_TAG = {'venue': 'venue', 'song': 'song', 'retail': 'retail'}
FAMILIES = {
    'venue': ('type', 'letter', 'construction', 'place'),
    'song': ('type', 'letter', 'construction', 'lyricsheet', 'title'),
    'relation': ('type', 'letter', 'construction', 'name'),
    'retail': ('type', 'letter', 'construction', 'date'),
}


def page_title(doc):
    """#page-title's text, trimmed (BBP: pageTitle.textContent.trim())."""
    el = b3.by_id(doc, 'page-title')
    return el.text().strip() if el is not None else ''


def under_construction(doc):
    """BBP's hasUnderConstructionBanner(): a sup em saying so."""
    for sup in doc.find_all('sup'):
        for em in sup.find_all('em'):
            if re.search(r'under construction', em.text(), re.I):
                return True
    return False


def first_letter(title):
    """BBP: the title's first character when it is a-z, lower case; else None."""
    t = title.strip()
    return t[0].lower() if t and re.fullmatch(r'[a-z]', t[0], re.I) else None


def bp_letter(kind, title, name):
    """BruceParser's efc.sh: the first-character tag it asks for, or None.

    Lower case; a relation drops a leading "the "; a quote is skipped; a digit
    is "0-9"; a relation with "&" anywhere is "&"; a relation "-N" page is
    left out; retail is never checked.
    """
    if kind == 'retail':
        return None
    t = title.lower()
    if kind == 'relation':
        if t.startswith('the '):
            t = t[4:]
        if re.search(r'-[1-9]$', name):
            return None
    if not t:
        return None
    c = t[0]
    if c == 'ō':
        c = 'o'
    if c in ('"', "'"):
        c = t[1:2]
    if re.fullmatch(r'[0-9]', c or ''):
        c = '0-9'
    if kind == 'relation' and '&' in t:
        c = '&'
    return c


def retail_dates(doc):
    """BBP's parseRetailReleaseDates(): [(month, day, year)]."""
    code = None
    for n in doc.walk():
        if n.tag == 'code' and n.inside('pre'):
            code = n
            break
    if code is None:
        return []
    line = next((l for l in code.text().split('\n')
                 if re.match(r'Commercially Released:', l, re.I)), None)
    if line is None:
        return []
    out = []
    for m in re.finditer(r'([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s*\(([^)]+)\))?', line):
        mon = m.group(1).lower()
        if mon not in MONTHS:
            continue
        out.append((mon, m.group(2).zfill(2), m.group(3)))
    return out


def tab_labels(doc):
    """The .yui-nav em labels."""
    return [b3.strip(em.text()) for nav in doc.find_all(test=lambda n: n.has_class('yui-nav'))
            for em in nav.find_all('em')]


def lyricsheet(doc, tabs):
    """BBP: the Gallery tab has an image whose src says lyricsheet."""
    tab = b3.tab_el(doc, tabs, 'Gallery')
    return bool(tab is not None and any(re.search(r'lyricsheet', img.attrs.get('src') or '', re.I)
                                        for img in tab.find_all('img')))


def relation_person(title):
    """BBP's parseRelationPersonTitle(): (surname, name) or None."""
    parts = [p.strip() for p in title.split(',') if p.strip()]
    return (parts[0], parts[1]) if len(parts) == 2 else None


def rel_norm(name):
    """BBP's normalizeRelationTagName()."""
    return re.sub(r'[.\s]', '', b3.strip_diacritics(name).lower())


def list_links(tab):
    """BBP's collectRelationListLinks(): clean single-entry relation links."""
    if tab is None:
        return []

    def norm(s):
        return re.sub(r'\s+', ' ', s.strip())
    return [a for a in tab.find_all('a', lambda a: (a.attrs.get('href') or '').startswith('/relation:'))
            if norm(a.parent.text() if a.parent is not None else '') == norm(a.text())]


def relation_names(doc, title, labels, tabs):
    """BBP's computeExpectedRelationNameTags(): {tag: (family, why)}."""
    out = {}

    def add(tag, fam, why):
        if tag not in out:
            out[tag] = (fam, why)
    if 'Bands' in labels:
        p = relation_person(title)
        if p:
            add(p[0][0].lower(), 'letter', f'the first letter of the surname "{p[0]}"')
            add(rel_norm(p[1] + p[0]), 'name', f'"{p[1]}" + "{p[0]}"')
        for a in list_links(b3.tab_el(doc, tabs, 'Bands')):
            raw = a.text().strip()
            for part in [s.strip() for s in raw.split(' & ') if s.strip()]:
                band = re.sub(r'^The\s+', '', re.sub(r',\s*The$', '', part, flags=re.I).strip(),
                              flags=re.I).strip()
                if band:
                    add(rel_norm(band), 'name', f'"{raw}" on the Bands tab')
    if 'Members' in labels:
        band = re.sub(r',\s*The$', '', title, flags=re.I).strip()
        if band:
            add(band[0].lower(), 'letter', f'the first letter of the band name "{band}"')
        for a in list_links(b3.tab_el(doc, tabs, 'Members')):
            m = relation_person(a.text().strip())
            if m:
                add(rel_norm(m[1] + m[0]), 'name', f'"{m[0]}, {m[1]}" on the Members tab')
    return out


def venue_place(title, has):
    """BBP's checkVenuePageLocationTags(): [(label, candidate, present)]."""
    loc = b3.location_parts([p.strip() for p in title.strip().split(',') if p.strip()])
    if not loc:
        return []
    out = []
    m = re.match(r'^(.+?)\s+at\s+the\s+(.+)$', loc['venue'], re.I)
    names = [m.group(1).strip(), m.group(2).strip()] if m else [loc['venue']]
    for n in names:
        out.append(b3.check_loc_name('Venue', n, has, loc['city']))
    if loc['detail']:
        out.append(b3.check_loc_name('Venue detail', loc['detail'], has))
    out.append(b3.check_loc_name('City', loc['city'], has))
    if loc['state']:
        us = loc['state'] in b3.US_STATES
        full = b3.US_STATES[loc['state']] if us else b3.CA_PROVINCES[loc['state']]
        st = f"{b3.loc_slug(full)}({loc['state'].lower()})"
        out.append((f"State: {loc['state']}", st, st if b3.present(st, has) else None))
        c = 'usa' if us else 'canada'
        out.append((f'Country: {c}', c, c if b3.present(c, has) else None))
    elif loc['country']:
        c = b3.loc_slug(loc['country'])
        out.append((f"Country: {loc['country']}", c, c if b3.present(c, has) else None))
        for extra in b3.COUNTRY_EXTRA.get(loc['country'], []):
            out.append((f'Region: {extra}', extra, extra if b3.present(extra, has) else None))
    return [x for x in out if x]


def managed(kind, tag):
    """BBP's isManaged<Kind>Tag(): the family of a tag that can be spurious, or None."""
    if tag == 'underconstruction':
        return 'construction'
    if kind == 'relation':
        return 'type' if tag in ('person', 'band') else None
    if tag == TYPE_TAG[kind]:
        return 'type'
    if kind == 'song' and tag == 'lyricsheet':
        return 'lyricsheet'
    if re.fullmatch(r'[a-z]', tag):
        return 'letter'
    if kind == 'retail':
        if tag in MONTHS or re.fullmatch(r'\d{4}', tag):
            return 'date'
        if re.fullmatch(r'\d{1,2}', tag) and 1 <= int(tag) <= 31:
            return 'date'
    return None


def expected(kind, doc, title):
    """The expected tags: {tag: (family, why, loose)}; loose = isTagPresent().

    Only the fixed tags of BBP's computeExpected<Kind>Tags() can be spurious;
    the title, place and name tags are "loose" (BBP compares them with
    isTagPresent(), and never calls one spurious).
    """
    exp = {}
    labels = tab_labels(doc)
    tabs = b3.tab_map(doc)
    if kind in TYPE_TAG:
        exp[TYPE_TAG[kind]] = ('type', f'this is a {kind} page', False)
        letter = first_letter(title)
        if letter:
            exp[letter] = ('letter', f'the first letter of "{title}"', False)
    if under_construction(doc):
        exp['underconstruction'] = ('construction', 'the page shows the Under Construction banner', False)
    if kind == 'song':
        if lyricsheet(doc, tabs):
            exp['lyricsheet'] = ('lyricsheet', 'the Gallery tab has a lyric sheet', False)
        s = b3.slug(title)
        if s and s not in exp:
            exp[s] = ('title', f'the title "{title}" as a tag', True)
    if kind == 'retail':
        for mon, day, year in retail_dates(doc):
            why = f'released {mon.title()} {int(day)}, {year}'
            for t in (mon, day, year):
                exp.setdefault(t, ('date', why, False))
    if kind == 'relation':
        if 'Bands' in labels:
            exp['person'] = ('type', 'the page has a Bands tab', False)
        if 'Members' in labels:
            exp['band'] = ('type', 'the page has a Members tab', False)
        for t, (fam, why) in relation_names(doc, title, labels, tabs).items():
            exp.setdefault(t, (fam, why, True))
    return exp


def judge(kind, exp, own, place, more, saed):
    """Missing and spurious tags: ({family: [tag]}, {family: [tag]}).

    bbp (saed False): own tags only; a fixed tag by Set.has, a loose one by
    isTagPresent(). saed: own + more, every tag by present().
    """
    have = set(own) | (set(more) if saed else set())
    miss = defaultdict(list)
    spur = defaultdict(list)
    for t, (fam, _why, loose) in exp.items():
        ok = b3.present(t, have) if (saed or loose) else t in have
        if not ok:
            miss[fam].append(t)
    for label, cand, _hit in place:
        if not b3.present(cand, have):
            miss['place'].append(cand)
    for t in own:
        fam = managed(kind, t)
        if fam is None:
            continue
        if saed:
            wanted = any(not lo and b3.present(e, {t}) for e, (_f, _w, lo) in exp.items())
        else:
            wanted = t in exp and not exp[t][2]
        if not wanted:
            spur[fam].append(t)
    return ({f: sorted(set(v)) for f, v in miss.items()},
            {f: sorted(set(v)) for f, v in spur.items()})


# --- The shipped rule (vzell, 2026-11-18) ------------------------------------
# Core: the kind tag; the first letter by BruceParser's rule, missing only;
# "underconstruction" against the banner (either shape); "lyricsheet" on a
# song. Plus the song's own title tag, with the wiki's variants. Never
# flagged: a second letter tag. A relation's person/band by its tabs, "not
# expected" only against the opposite tab. Left out: retail dates and
# letters, venue place tags, relation name tags (noisy).

SHIP_FAMILIES = {
    'venue': ('type', 'letter', 'construction'),
    'song': ('type', 'letter', 'construction', 'lyricsheet', 'title'),
    'relation': ('type', 'letter', 'construction'),
    'retail': ('type', 'construction'),
}


def ship_skip(kind, name, markup, own):
    """Why a page gets no check: a redirect, a "-N" page without tabs (a
    continuation that keeps another page's tags), a retail tab page; or ''."""
    if 'redirect' in own:
        return 'redirect'
    if re.search(r'-[1-9]$', name) and 'class="yui-navset' not in markup:
        return 'continuation'
    if kind == 'retail' and RETAIL_TAB_RE.search(name):
        return 'retail tab'
    return ''


def ship_letter(kind, title, name):
    """BruceParser's first-letter rule, as shipped: lower case, a relation
    drops a leading "the ", a quote is skipped, accents are folded, a digit
    is "0-9", a relation with "&" is "&"; '' when that leaves no a-z, 0-9
    or "&" (and on retail pages, which BruceParser does not check)."""
    if kind == 'retail':
        return ''
    t = title.lower()
    if kind == 'relation' and t.startswith('the '):
        t = t[4:]
    c = t[:1]
    if c in ('"', "'"):
        c = t[1:2]
    c = b3.strip_diacritics(c).lower()[:1]
    if re.fullmatch(r'[0-9]', c):
        c = '0-9'
    if kind == 'relation' and '&' in t:
        c = '&'
    return c if re.fullmatch(r'[a-z]|0-9|&', c) else ''


def ship_banner(doc):
    """The Under Construction banner: an em in #page-content that says so
    (the wiki writes it as sup>em, "!! Under Construction !! …", or as a
    plain p>em)."""
    pc = b3.by_id(doc, 'page-content')
    return bool(pc is not None and any(re.search(r'under construction', em.text(), re.I)
                                       for em in pc.find_all('em')))


def ship_title_tags(title, name):
    """A song's own title as tags: the slug of the title without a cover's
    "( - Artist - )", also without a last "(…)", also with "&" as "and";
    each also with "song" after it, and with the page's number after it on
    a "-N" page. The first is the one named."""
    base = re.sub(r'\s*\(\s*-\s.*?-\s*\)\s*$', '', title)
    m = re.search(r'-(\d)$', name)
    out = []
    for v in (base, re.sub(r'\s*\([^)]*\)\s*$', '', base), base.replace('&', 'and')):
        s = b3.slug(v)
        if not s:
            continue
        for c in (s, s + 'song') + ((s + m.group(1),) if m else ()):
            if c not in out:
                out.append(c)
    return out


def ship_judge(kind, name, doc, markup, title, own, more):
    """The shipped rule's result: ({family: [tag]}, {family: [tag]}, skip)."""
    skip = ship_skip(kind, name, markup, own)
    if skip:
        return {}, {}, skip
    have = set(own) | set(more)
    labels = tab_labels(doc)
    tabs = b3.tab_map(doc)
    miss = defaultdict(list)
    spur = defaultdict(list)
    if kind == 'relation':
        bands, members = 'Bands' in labels, 'Members' in labels
        if bands and 'person' not in have:
            miss['type'].append('person')
        if members and 'band' not in have:
            miss['type'].append('band')
        if 'person' in own and members and not bands:
            spur['type'].append('person')
        if 'band' in own and bands and not members:
            spur['type'].append('band')
    elif TYPE_TAG[kind] not in have:
        miss['type'].append(TYPE_TAG[kind])
    letter = ship_letter(kind, title, name)
    if letter and letter not in have:
        miss['letter'].append(letter)
    banner = ship_banner(doc)
    if banner and 'underconstruction' not in have:
        miss['construction'].append('underconstruction')
    if not banner and 'underconstruction' in own:
        spur['construction'].append('underconstruction')
    if kind == 'song':
        ls = lyricsheet(doc, tabs)
        if ls and 'lyricsheet' not in have:
            miss['lyricsheet'].append('lyricsheet')
        if not ls and 'lyricsheet' in own:
            spur['lyricsheet'].append('lyricsheet')
        cands = ship_title_tags(title, name)
        if cands and not any(c in have for c in cands):
            miss['title'].append(cands[0])
    return dict(miss), dict(spur), ''


def page_names(mirror, kind):
    """Every page name of a kind in the mirror, sorted."""
    d = os.path.join(mirror.root, kind)
    if not os.path.isdir(d):
        return []
    return sorted(f'{kind}:{fn[len(kind) + 1:-5]}' for fn in os.listdir(d)
                  if fn.startswith(kind + '_') and fn.endswith('.html'))


def analyse(mirror, name):
    """One page: its facts, tags and both results."""
    kind = name.split(':', 1)[0]
    markup = mirror.read(name)
    doc = b3.parse(markup)
    title = page_title(doc)
    own = [t.lower() for t in b3.page_tags(markup)]
    pages = b3.tag_pages(mirror, name, own, False)
    more = [t.lower() for _, tags in pages for t in tags]
    exp = expected(kind, doc, title)
    own_set = set(own)
    place_b = venue_place(title, own_set) if kind == 'venue' else []
    place_s = venue_place(title, own_set | set(more)) if kind == 'venue' else []
    bm, bs = judge(kind, exp, own, place_b, more, False)
    sm, ss = judge(kind, exp, own, place_s, more, True)
    bpl = bp_letter(kind, title, name)
    shm, shs, skip = ship_judge(kind, name, doc, markup, title, own, more)
    return {
        'name': name, 'kind': kind, 'title': title, 'tags': own, 'pages': [p for p, _ in pages],
        'more': more,
        'expected': {t: [f, w] for t, (f, w, _l) in exp.items()},
        'place': [[l, c] for l, c, _h in place_b],
        'construction': 'underconstruction' in exp,
        'dates': retail_dates(doc) if kind == 'retail' else [],
        'tabs': tab_labels(doc),
        'bbp': {'missing': bm, 'spurious': bs},
        'saed': {'missing': sm, 'spurious': ss},
        'ship': {'missing': shm, 'spurious': shs, 'skip': skip},
        'facts': {
            'letter': ship_letter(kind, title, name), 'construction': ship_banner(doc),
            'lyricsheet': lyricsheet(doc, b3.tab_map(doc)) if kind == 'song' else False,
            'bands': 'Bands' in tab_labels(doc), 'members': 'Members' in tab_labels(doc),
            'titleTags': ship_title_tags(title, name) if kind == 'song' else [],
        },
        'bpLetter': bpl,
        'bpMissing': bool(own) and bpl is not None and bpl not in own_set,
        'noTags': not own,
    }


def bp_report(mirror, kind):
    """BruceParser's MISSING-first-character-tag-in-title_<kind>.txt: {name: letter}."""
    p = os.path.join(mirror.root, f'MISSING-first-character-tag-in-title_{kind}.txt')
    if not os.path.isfile(p):
        return None
    out = {}
    with open(p, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            m = re.search(r'wikidot\.com/(\S+)\s+is missing single first character tag ==> (\S+)', line)
            if m:
                out[m.group(1)] = m.group(2)
    return out


def main(argv):
    """Run the probe."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--rows')
    ap.add_argument('--list')
    ap.add_argument('--show')
    ap.add_argument('--limit', type=int)
    args = ap.parse_args(argv)
    mirror = b3.Mirror(os.path.realpath(args.mirror))
    if args.show:
        print(json.dumps(analyse(mirror, args.show), indent=1, ensure_ascii=False))
        return 0
    print(f'mirror {mirror.root}')
    rows = []
    for kind in KINDS:
        names = page_names(mirror, kind)
        tabs = [n for n in names if kind == 'retail' and RETAIL_TAB_RE.search(n)]
        main_names = [n for n in names if n not in set(tabs)]
        if args.limit:
            main_names = main_names[:args.limit]
        kr = [analyse(mirror, n) for n in main_names]
        # a page read as another page's "-N" tag sibling is no page of its own
        sib = {p for r in kr for p in r['pages']}
        kept = [r for r in kr if r['name'] not in sib]
        rows.extend(kept)
        print(f'\n== {kind}: {len(names)} files, {len(kept)} checked'
              + (f', {len(tabs)} tab pages counted only' if tabs else '')
              + (f', {len(sib & set(main_names))} tag siblings left out' if sib else '')
              + f'; no tags {sum(1 for r in kept if r["noTags"])}; '
              f'with siblings {sum(1 for r in kept if r["pages"])}; '
              f'under construction {sum(1 for r in kept if r["construction"])}')
        for mode in ('bbp', 'saed'):
            flagged = [r for r in kept if r[mode]['missing'] or r[mode]['spurious']]
            print(f'  {mode}: flagged {len(flagged)} '
                  f'(missing {sum(1 for r in kept if r[mode]["missing"])}, '
                  f'spurious {sum(1 for r in kept if r[mode]["spurious"])})')
        for mode in ('bbp', 'saed'):
            print(f'  {mode}, by family (pages missing / spurious; the most frequent):')
            for fam in FAMILIES[kind]:
                mp = [r for r in kept if fam in r[mode]['missing']]
                sp = [r for r in kept if fam in r[mode]['spurious']]
                mt = Counter(t for r in mp for t in r[mode]['missing'][fam])
                st = Counter(t for r in sp for t in r[mode]['spurious'][fam])
                print(f'    {fam:12} {len(mp):5} / {len(sp):5}   miss: '
                      + ', '.join(f'{t} {n}' for t, n in mt.most_common(6))
                      + ('   spur: ' + ', '.join(f'{t} {n}' for t, n in st.most_common(6)) if st else ''))
        sk = Counter(r['ship']['skip'] for r in kept if r['ship']['skip'])
        fl = [r for r in kept if r['ship']['missing'] or r['ship']['spurious']]
        print(f'  SHIPPED rule: flagged {len(fl)} (missing {sum(1 for r in kept if r["ship"]["missing"])}, '
              f'not expected {sum(1 for r in kept if r["ship"]["spurious"])}); skipped {dict(sk)}')
        for fam in SHIP_FAMILIES[kind]:
            mp = [r for r in kept if fam in r['ship']['missing']]
            sp = [r for r in kept if fam in r['ship']['spurious']]
            print(f'    {fam:12} {len(mp):5} / {len(sp):5}   '
                  + ', '.join(f'{r["name"].split(":", 1)[1]} {r["ship"]["missing"].get(fam, []) + r["ship"]["spurious"].get(fam, [])}'
                              for r in (mp + sp)[:6]))
        rep = bp_report(mirror, kind)
        ours = {r['name']: r['bpLetter'] for r in kept if r['bpMissing']}
        letter = {r['name']: r['bbp']['missing'].get('letter') for r in kept
                  if r['bbp']['missing'].get('letter')}
        if rep is None:
            print('  no BruceParser report for this kind')
        else:
            print(f"  BruceParser's report: {len(rep)} pages; its rule re-run here: {len(ours)}; "
                  f'the same {len(set(rep) & set(ours))}; '
                  f'only there {sorted(set(rep) - set(ours))}; only here {sorted(set(ours) - set(rep))}')
            print(f'  BBP letter missing: {len(letter)}; also in the report: {len(set(letter) & set(rep))}; '
                  f'BBP only: {sorted(set(letter) - set(rep))[:12]}; '
                  f'report only: {sorted(set(rep) - set(letter))[:12]}')
    for kind in COUNTED:
        names = page_names(mirror, kind)
        print(f'\n== {kind}: {len(names)} files, counted only (not checked)')

    if args.list:
        kind, fam = args.list.split(':', 1)
        print(f'\n--list {args.list}')
        for r in rows:
            if r['kind'] != kind:
                continue
            if fam == 'spurious':
                if r['bbp']['spurious']:
                    print(f'  {r["name"]}  {r["bbp"]["spurious"]}')
            elif fam == 'bp':
                bl = r['bbp']['missing'].get('letter')
                if r['bpMissing'] or bl:
                    print(f'  {r["name"]}  bp {r["bpLetter"]!r} bbp {bl}  "{r["title"]}"')
            elif fam in r['bbp']['missing']:
                print(f'  {r["name"]}  {r["bbp"]["missing"][fam]}  "{r["title"]}"')
    if args.rows:
        with open(args.rows, 'w', encoding='utf-8') as fh:
            json.dump(rows, fh, ensure_ascii=False)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
