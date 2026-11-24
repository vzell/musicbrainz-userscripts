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
RETAIL_TABS = ('overview', 'credits', 'addinfo', 'release', 'recgig')


def retail_tab(name):
    """A release's tab page: its name ends in a tab's word, or (Wikidot's 60
    characters) in the start of one, of at least three letters
    ("retail:the-concert-for-the-rock-and-roll-hall-of-fame-credit"; batch 4b)."""
    if RETAIL_TAB_RE.search(name):
        return True
    m = re.search(r'-([a-z]{3,})$', name)
    return len(name) == 60 and bool(m) and any(t.startswith(m.group(1)) for t in RETAIL_TABS)
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
    if kind == 'retail' and retail_tab(name):
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


# --- Batch 4b candidates (2026-11-24; not decided) ----------------------------
# vzell, 2026-11-24: take up the three families batch 4 left out. Each
# candidate follows what the wiki does (measured here) and the chat's rulings
# (org/brucebase-chat.org), not BruceBaseParser's guesses:
# - venue place: batch 3b's place rule (probe-bb-place-tags.py
#   rule_expected(): city, US/Canadian state, country, the expected regions,
#   the feed's placeTags) on the venue's own title, and the venue's own tag
#   from the feed's venueTags (what its shows carry); never "not expected";
# - relation own name: a person's (Bands tab, "Surname, Name") or band's
#   (Members tab) own name tag in SAED's cast forms (_bbTagCastItems());
#   the Bands/Members entries are NOT checked: both tabs are ListPages boxes
#   built from the tags, so an entry IS a shared tag;
# - release dates: every date of the "Commercially Released(*):" line in
#   "Month D, YYYY", "Month, YYYY" or "YYYY"; one listed date with all its
#   parts tagged is enough, else the first date's year, month and day
#   (zero-padded) are named missing (first-date-plus-later-years flagged 18,
#   this 9); a month, day or year tag of no listed date is "not expected";
# - release letter: the title's first letter, a leading "The "/"A " dropped
#   (measured as two variants).

_PLACE_SPEC = importlib.util.spec_from_file_location(
    'place', os.path.join(_HERE, 'probe-bb-place-tags.py'))
place_probe = importlib.util.module_from_spec(_PLACE_SPEC)
_PLACE_SPEC.loader.exec_module(place_probe)


def cand_place(name, title, have, feed):
    """Venue place candidate: ({tag: why} missing, checked parts count)."""
    tables = feed.get('tagTables') or {}
    exp = place_probe.rule_expected('2000-01-01 ' + title, tables) or []
    vt = (feed.get('venueTags') or {}).get(name)
    if vt:
        exp = exp + [('venue', name, vt)]
    miss = {}
    for part, pname, tags in exp:
        if not any(t in have for t in tags):
            miss[tags[0]] = f'{part} "{pname}"'
    return miss, len(exp)


def cast_items(name, tables):
    """SAED's _bbTagCastItems(): [(label, [alts])]."""
    dotted_table = tables.get('eStreetDotted') or {}
    alias = tables.get('relationAlias') or {}

    def nslug(s):
        return re.sub(r'[^a-z0-9]', '', b3.strip_diacritics(s).lower())

    def nickless(n):
        return re.sub(r'\s+', ' ', re.sub(r'\s*"[^"]*"\s*', ' ', n)).strip()

    def dotted(n):
        out = []
        for v in (n, nickless(n)):
            parts = [p for p in re.sub(r'^the\s+', '', v, flags=re.I).split() if p]
            if len(parts) >= 2:
                out.append(f'{nslug(parts[0])}.{nslug(" ".join(parts[1:]))}')
        return out

    def one(n):
        key = n.lower().strip()
        alts = [nslug(n), nslug(re.sub(r'^the\s+', '', n, flags=re.I)),
                nslug(re.sub(r'\s+(?:Jr\.?|Sr\.?|III|II|IV)$', '', n, flags=re.I).strip()), nslug(nickless(n))]
        alts += [dotted_table[key]] if key in dotted_table else []
        alts += [alias[key]] if key in alias else []
        alts += dotted(n)
        return list(dict.fromkeys(a for a in alts if a))
    m = re.match(r'^(.+?)\s*&\s*(.+)$', name)
    if not m:
        return [(name, one(name))]
    combined = nslug(re.sub(r'\s*&\s*', '', re.sub(r'^the\s+', '', name, flags=re.I)))
    return [(p.strip(), list(dict.fromkeys(one(p.strip()) + [combined]))) for p in (m.group(1), m.group(2))]


def cand_relation(page, title, labels, have, feed):
    """Relation own-name candidate: {tag: why} missing; None when not checked.

    Each name's forms, and the page's tags in the feed's relationTags
    (feed 1.10: the wiki's own name for it, a stage name), count.
    """
    tables = feed.get('tagTables') or {}
    mapped = (feed.get('relationTags') or {}).get(page) or []
    if 'Bands' in labels:
        p = relation_person(title)
        if not p:
            return None
        name = f'{p[1]} {p[0]}'
    elif 'Members' in labels:
        name = re.sub(r'\s*\(The\)$', '', re.sub(r',\s*The$', '', title.strip(), flags=re.I)).strip()
        if '&' in name:
            return None
    else:
        return None
    miss = {}
    for label, alts in cast_items(name, tables):
        if alts and not any(a in have for a in alts + mapped):
            miss[alts[0]] = f'its own name "{label}"'
    return miss


_DATE_RE = re.compile(r'(?:\b(' + '|'.join(sorted(MONTHS)) + r')\b\.?\s*(\d{1,2})?\s*,?\s*)?\b(\d{4})\b', re.I)


def cand_retail_dates(markup):
    """Every date of the "Commercially Released(*):" line: [(month, day, year)]; None when no line."""
    m = re.search(r'Commercially Released\*?:([^\n<]*)', markup, re.I)
    if not m:
        return None
    out = []
    for d in _DATE_RE.finditer(m.group(1)):
        mon, day, year = d.group(1), d.group(2), d.group(3)
        out.append(((mon or '').lower(), day.zfill(2) if day else '', year))
    return out


def cand_retail(markup, title, own, have):
    """Release candidate: ({tag: why} missing, {tag: why} not expected, letters, dates)."""
    dates = cand_retail_dates(markup)
    miss, spur = {}, {}
    if dates:
        # one listed date with all its parts is enough (the wiki tags the
        # later date on some releases, and a later date's year on few); else
        # the first date's parts are named
        if not any(all(not p or b3.present(p, have) for p in d) for d in dates):
            mon, day, year = dates[0]
            for t in (year, mon, day):
                if t and not b3.present(t, have):
                    miss[t] = 'the first release date'
        parts = {p for d in dates for p in d if p}
        for t in own:
            if (t in MONTHS or re.fullmatch(r'\d{4}', t) or (re.fullmatch(r'\d{1,2}', t) and 1 <= int(t) <= 31)) \
                    and not any(b3.present(p, {t}) for p in parts):
                spur[t] = 'no date of the "Commercially Released" line'
    t = title.lower()
    letters = {}
    for variant, tt in (('plain', t), ('the', re.sub(r'^(?:the|a)\s+', '', t))):
        c = b3.strip_diacritics(tt[:1]).lower()
        if c in ('"', "'"):
            c = b3.strip_diacritics(tt[1:2]).lower()
        if re.fullmatch(r'[0-9]', c):
            c = '0-9'
        letters[variant] = c if re.fullmatch(r'[a-z]|0-9', c) else ''
    return miss, spur, letters, dates


def page_names(mirror, kind):
    """Every page name of a kind in the mirror, sorted."""
    d = os.path.join(mirror.root, kind)
    if not os.path.isdir(d):
        return []
    return sorted(f'{kind}:{fn[len(kind) + 1:-5]}' for fn in os.listdir(d)
                  if fn.startswith(kind + '_') and fn.endswith('.html'))


def analyse_cand(kind, name, markup, doc, title, own, more, skip, feed):
    """The batch 4b candidates of one page (None for a page the shipped rule skips)."""
    if skip or not feed:
        return None
    have = set(own) | set(more)
    if kind == 'venue':
        miss, n = cand_place(name, title, have, feed)
        return {'place': {'missing': miss, 'parts': n}}
    if kind == 'relation':
        return {'name': {'missing': cand_relation(name, title, tab_labels(doc), have, feed)}}
    if kind == 'retail':
        miss, spur, letters, dates = cand_retail(markup, title, own, have)
        return {'date': {'missing': miss, 'spurious': spur, 'dates': dates},
                'letter': {v: (c, bool(c) and c in have) for v, c in letters.items()}}
    return None


def ship4b(kind, ship, cand):
    """The shipped rule with batch 4b's three families on (vzell, 2026-11-24):
    {missing, spurious, skip}. Venue place, a relation's own name, a
    release's dates, and a release's first letter where the page has a
    "Commercially Released" line (the plain first letter; only missing)."""
    miss = {f: list(v) for f, v in ship['missing'].items()}
    spur = {f: list(v) for f, v in ship['spurious'].items()}
    if cand:
        if kind == 'venue' and cand['place']['missing']:
            miss['place'] = sorted(cand['place']['missing'])
        if kind == 'relation' and cand['name']['missing']:
            miss['name'] = sorted(cand['name']['missing'])
        if kind == 'retail':
            if cand['date']['missing']:
                miss['date'] = sorted(cand['date']['missing'])
            if cand['date']['spurious']:
                spur['date'] = sorted(cand['date']['spurious'])
            letter, has = cand['letter']['plain']
            if cand['date']['dates'] is not None and letter and not has:
                miss['letter'] = [letter]
    return {'missing': miss, 'spurious': spur, 'skip': ship['skip']}


def analyse(mirror, name, feed=None):
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
    cand = analyse_cand(kind, name, markup, doc, title, own, more, skip, feed)
    rdates = cand_retail_dates(markup) if kind == 'retail' and not skip else None
    rletter = ''
    if rdates is not None:
        rletter = cand_retail(markup, title, own, set(own))[2]['plain']
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
            # batch 4b: a release's "Commercially Released" dates and its first letter
            'dates': [list(d) for d in rdates] if rdates is not None else None,
            'releaseLetter': rletter,
        },
        'bpLetter': bpl,
        'bpMissing': bool(own) and bpl is not None and bpl not in own_set,
        'noTags': not own,
        'cand': cand,
        'ship4b': ship4b(kind, {'missing': shm, 'spurious': shs, 'skip': skip}, cand),
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


def print_cand(kind, kept):
    """Batch 4b's candidate counts for one kind, with the most frequent tags and examples."""
    rows = [r for r in kept if r.get('cand')]
    if not rows:
        return

    def top(counter, n=8):
        return ', '.join(f'{t} {c}' for t, c in counter.most_common(n))
    if kind == 'venue':
        fl = [r for r in rows if r['cand']['place']['missing']]
        why = Counter(w.split(' ')[0] for r in fl for w in r['cand']['place']['missing'].values())
        print(f'  CANDIDATE place: {len(fl)} of {len(rows)} flagged; by part {dict(why)}; '
              + top(Counter(t for r in fl for t in r['cand']['place']['missing'])))
        for r in fl[:10]:
            print(f'      {r["name"]} "{r["title"]}" {r["cand"]["place"]["missing"]}')
    elif kind == 'relation':
        ch = [r for r in rows if r['cand']['name']['missing'] is not None]
        fl = [r for r in ch if r['cand']['name']['missing']]
        print(f'  CANDIDATE own name: {len(ch)} checked, {len(fl)} flagged; '
              + top(Counter(t for r in fl for t in r['cand']['name']['missing'])))
        for r in fl[:25]:
            print(f'      {r["name"]} "{r["title"]}" wants {list(r["cand"]["name"]["missing"])}; '
                  f'has {" ".join(sorted(r["tags"]))[:110]}')
    elif kind == 'retail':
        nd = Counter(len(r['cand']['date']['dates']) if r['cand']['date']['dates'] is not None else -1 for r in rows)
        dm = [r for r in rows if r['cand']['date']['missing']]
        ds = [r for r in rows if r['cand']['date']['spurious']]
        print(f'  CANDIDATE dates: dates per page {dict(sorted(nd.items()))} (-1: no line); missing on {len(dm)}, '
              f'not expected on {len(ds)}, flagged {len({r["name"] for r in dm + ds})}')
        for r in sorted(dm + [x for x in ds if x not in dm], key=lambda x: x['name'])[:30]:
            c = r['cand']['date']
            print(f'      {r["name"]} dates {c["dates"]} miss {list(c["missing"])} spur {list(c["spurious"])}')
        for v in ('plain', 'the'):
            have = sum(1 for r in rows if r['cand']['letter'][v][1])
            want = sum(1 for r in rows if r['cand']['letter'][v][0])
            print(f'  CANDIDATE letter ({v}): {have} of {want} carry it; missing on '
                  + ', '.join(f'{r["name"].split(":", 1)[1]}={r["cand"]["letter"][v][0]}' for r in rows
                              if r['cand']['letter'][v][0] and not r['cand']['letter'][v][1])[:600])


def main(argv):
    """Run the probe."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--rows')
    ap.add_argument('--list')
    ap.add_argument('--show')
    ap.add_argument('--limit', type=int)
    ap.add_argument('--feed', help="a bb-feed.json for batch 4b's candidates (default: the mirror's own)")
    args = ap.parse_args(argv)
    mirror = b3.Mirror(os.path.realpath(args.mirror))
    feed_path = args.feed or os.path.join(mirror.root, 'bb-feed.json')
    feed = None
    if os.path.isfile(feed_path):
        with open(feed_path, encoding='utf-8') as fh:
            feed = json.load(fh)
    if args.show:
        print(json.dumps(analyse(mirror, args.show, feed), indent=1, ensure_ascii=False))
        return 0
    print(f'mirror {mirror.root}')
    rows = []
    for kind in KINDS:
        names = page_names(mirror, kind)
        tabs = [n for n in names if kind == 'retail' and retail_tab(n)]
        main_names = [n for n in names if n not in set(tabs)]
        if args.limit:
            main_names = main_names[:args.limit]
        kr = [analyse(mirror, n, feed) for n in main_names]
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
        print_cand(kind, kept)
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
