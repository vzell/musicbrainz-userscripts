#!/usr/bin/env python3
"""Probe: a Brucebase show's expected tags against its actual tags.

Track A batch 3 (org/bbp-parity.org): bb-tag-missing, bb-tag-spurious. Reads
every event page of BruceParser's mirror (gig, nogig, rehearsal, recording,
interview) with the pages that keep more of its tags (its "-N" siblings, its
On stage page and that page's siblings, as _bbTagPagesStart() reads them),
applies BruceBaseParser's rules (annotateDetailPageTags and what it calls;
the code, not its doc/TAGS.md), and compares the date parts with BruceParser's
own report REPORTING/MISSING-date-parts-in-tags.org.

Read-only. No network.

Usage:
    python3 scripts/probe-bb-batch3-findings.py [--mirror DIR] [--json FILE]
            [--rows FILE] [--list FAMILY] [--show NAME] [--limit N]

    --mirror DIR   the mirror (default ~/git/scripts/BruceParser/bb/latest)
    --json FILE    write every flagged event as JSON
    --rows FILE    write EVERY event with its tags and result as JSON: the
                   input of scripts/check-bb-batch3-findings.js
    --list FAMILY  print every miss of this family (date, letter, type,
                   content, prem, tour, place, cast, song) or "spurious"
    --show NAME    print one event in full (gig:1985-01-04-…)
    --limit N      read only the first N events (a quick look)
"""
import argparse
import datetime
import html
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from html.parser import HTMLParser

KINDS = ('gig', 'nogig', 'rehearsal', 'recording', 'interview')
ONSTAGE_KINDS = ('gig', 'nogig', 'rehearsal', 'interview')
TAG_PAGE_FULL = 450
NAME_MAX = 60

MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
          'september', 'october', 'november', 'december']
DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
MANAGED_CONTENT = {
    'gig', 'interview', 'nobruce', 'nogig', 'offstage', 'onstage', 'recording', 'rehearsal',
    'soundcheck', 'bootleg', 'livedl', 'news', 'memorabilia', 'ticket', 'setlist',
    'handwritten', 'printed', 'storyteller', 'eyewitness', 'help', 'underconstruction',
    'featured', 'prem', 'rescheduled'}
CONTENT_TAGS = MANAGED_CONTENT - {
    'gig', 'interview', 'nobruce', 'nogig', 'offstage', 'onstage', 'recording', 'rehearsal'}
SORRY_RE = re.compile(r'^Sorry,? no ', re.I)

TOURS = [
    ('tour_gfap', [('1972-10-28', '1973-09-22')]),
    ('tour_wiess', [('1973-09-28', '1975-03-09')]),
    ('tour_btr', [('1975-07-20', '1975-12-31'), ('1976-03-25', '1976-05-28')]),
    ('tour_cs', [('1976-03-25', '1976-05-28')]),
    ('tour_lwst', [('1976-09-26', '1976-11-04'), ('1977-02-07', '1977-03-25')]),
    ('tour_doteot', [('1978-05-23', '1979-01-01')]),
    ('tour_rvr', [('1980-10-03', '1981-06-08'), ('1981-07-02', '1981-09-14')]),
    ('tour_bitusa', [('1984-06-29', '1985-01-27'), ('1985-03-21', '1985-04-23'),
                     ('1985-06-01', '1985-07-07'), ('1985-08-05', '1985-10-02')]),
    ('tour_tol', [('1988-02-25', '1988-05-23'), ('1988-06-11', '1988-08-03')]),
    ('tour_hrn', [('1988-09-02', '1988-10-15')]),
    ('tour_htlt', [('1992-06-15', '1992-12-17'), ('1993-03-31', '1993-06-01')]),
    ('tour_gotj', [('1995-11-22', '1996-01-28'), ('1996-02-12', '1996-05-08'),
                   ('1996-09-16', '1996-12-14'), ('1997-01-27', '1997-02-17'),
                   ('1997-05-06', '1997-05-26')]),
    ('tour_rnn', [('1999-04-09', '1999-06-27'), ('1999-07-15', '1999-11-29'),
                  ('2000-02-28', '2000-07-01')]),
    ('tour_rsng', [('2002-08-07', '2002-10-27'), ('2002-11-03', '2002-12-17'),
                   ('2003-02-28', '2003-04-19'), ('2003-05-06', '2003-10-04')]),
    ('tour_vfc', [('2004-10-01', '2004-10-13')]),
    ('tour_dd', [('2005-04-25', '2005-06-28'), ('2005-07-13', '2005-11-22')]),
    ('tour_sgrs', [('2006-04-30', '2006-06-25'), ('2006-10-01', '2006-11-21')]),
    ('tour_mgc', [('2007-10-02', '2007-12-19'), ('2008-02-28', '2008-05-02'),
                  ('2008-05-22', '2008-07-20'), ('2008-07-27', '2008-08-24')]),
    ('tour_woad', [('2009-04-01', '2009-08-02'), ('2009-08-19', '2009-11-22')]),
    ('tour_wb', [('2012-03-18', '2012-05-02'), ('2012-05-13', '2012-07-31'),
                 ('2012-08-14', '2012-12-10'), ('2013-03-14', '2013-03-31'),
                 ('2013-04-29', '2013-07-28'), ('2013-09-12', '2013-09-21')]),
    ('tour_hh', [('2014-01-26', '2014-03-02'), ('2014-04-08', '2014-05-18')]),
    ('tour_rvr16', [('2016-01-16', '2016-04-25'), ('2016-05-14', '2016-09-14')]),
    ('tour_book', [('2016-09-27', '2016-12-02')]),
    ('tour_sumr17', [('2017-01-22', '2017-02-25')]),
    ('tour_sob', [('2017-10-03', '2018-12-15'), ('2021-06-26', '2021-09-04')]),
    ('tour_23int', [('2023-02-01', '2023-04-14'), ('2023-04-28', '2023-12-12')]),
    ('tour_23int', [('2024-03-19', '2024-04-21'), ('2024-05-05', '2024-07-27'),
                    ('2024-08-15', '2024-11-22'), ('2025-05-14', '2025-07-03')]),
    ('tour_lohad', [('2025-05-14', '2025-07-03'), ('2026-03-31', '2026-05-30')]),
    ('tour_lohadnk', [('2026-03-31', '2026-05-30')]),
]
TOUR_TAGS = {t for t, _ in TOURS}
TOUR_NO = 'tour_no'

SONG_ALIAS = {
    '634-5789 (soulsville, u.s.a.)': '6345789',
    'devils & dust': 'dad',
    'does this bus stop at 82nd street?': 'dtbsa82s',
    'incident on 57th street': 'io57s',
    'rosalita (come out tonight)': 'rosalita',
    '4th of july, asbury park (sandy)': 'sandy',
    'tenth avenue freeze-out': '10th',
    'wreck on the highway': 'wroth',
    'you can look (but you better not touch)': 'youcanlook',
}
SONG_COMBO = {'land of hope and dreams - people get ready': 'lohad.pgr'}
US_STATES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'DC': 'District of Columbia',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois',
    'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana',
    'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
    'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon',
    'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota',
    'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia',
    'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'}
CA_PROVINCES = {
    'AB': 'Alberta', 'BC': 'British Columbia', 'MB': 'Manitoba', 'NB': 'New Brunswick',
    'NL': 'Newfoundland and Labrador', 'NS': 'Nova Scotia', 'NT': 'Northwest Territories',
    'NU': 'Nunavut', 'ON': 'Ontario', 'PE': 'Prince Edward Island', 'QC': 'Quebec',
    'SK': 'Saskatchewan', 'YT': 'Yukon'}
_UK = ['unitedkingdom', 'europe']
_SC = ['europe', 'scandinavia']
COUNTRY_EXTRA = {
    'England': _UK, 'Scotland': _UK, 'Wales': _UK, 'Northern Ireland': _UK,
    'Ireland': ['europe'], 'Finland': _SC, 'Sweden': _SC, 'Norway': _SC, 'Denmark': _SC,
    'Iceland': _SC, 'Germany': ['europe'], 'France': ['europe'], 'Italy': ['europe'],
    'Spain': ['europe'], 'Portugal': ['europe'], 'Netherlands': ['europe'],
    'Belgium': ['europe'], 'Switzerland': ['europe'], 'Austria': ['europe'],
    'Poland': ['europe'], 'Czech Republic': ['europe'], 'Greece': ['europe'],
    'Australia': ['oceania'], 'New Zealand': ['oceania'], 'Japan': ['asia'],
    'Brazil': ['southamerica'], 'Mexico': ['northamerica']}
VENUE_ALIAS = {'bruce springsteen center for american music': 'bscfam'}
RELATION_ALIAS = {'the 1992–93 world tour band': 'otherband'}
ESB_DOTTED = {
    'charles giordano': 'charles.giordano', 'clarence clemons': 'clarence.clemons',
    'danny federici': 'danny.federici', 'garry tallent': 'garry.tallent',
    'jake clemons': 'jake.clemons', 'max weinberg': 'max.weinberg',
    'nils lofgren': 'nils.lofgren', 'patti scialfa': 'patti.scialfa',
    'roy bittan': 'roy.bittan', 'soozie tyrell': 'soozie.tyrell',
    'steven van zandt': 'steven.vanzandt'}
RELATION_TABS = [('On Stage', 'onstage'), ('In Studio', 'studio'), ('On Audio', None), ('On Set', None)]
NON_DECOMPOSABLE = {
    'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE',
    'ß': 'ss', 'ð': 'd', 'Ð': 'D', 'þ': 'th', 'Þ': 'Th',
    'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D'}

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param',
        'source', 'track', 'wbr'}


class Node:
    """An element of the small tree: tag, attributes, children (Node or str)."""

    __slots__ = ('tag', 'attrs', 'kids', 'parent')

    def __init__(self, tag, attrs=None, parent=None):
        self.tag = tag
        self.attrs = attrs or {}
        self.kids = []
        self.parent = parent

    def children(self):
        """The element children."""
        return [k for k in self.kids if isinstance(k, Node)]

    def walk(self):
        """Every descendant element, in document order."""
        for k in self.kids:
            if isinstance(k, Node):
                yield k
                yield from k.walk()

    def find_all(self, tag=None, test=None):
        """Descendants by tag and/or a test."""
        return [n for n in self.walk()
                if (tag is None or n.tag == tag) and (test is None or test(n))]

    def find(self, tag=None, test=None):
        """The first such descendant, or None."""
        for n in self.walk():
            if (tag is None or n.tag == tag) and (test is None or test(n)):
                return n
        return None

    def text(self):
        """textContent."""
        out = []
        for k in self.kids:
            out.append(k if isinstance(k, str) else k.text())
        return ''.join(out)

    def has_class(self, name):
        """Whether the class attribute names it."""
        return name in (self.attrs.get('class') or '').split()

    def inside(self, tag):
        """Whether an ancestor (or the node) has this tag: closest()."""
        n = self
        while n is not None:
            if n.tag == tag:
                return True
            n = n.parent
        return False


class Tree(HTMLParser):
    """html.parser into Nodes; the wiki's markup is well formed."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#root')
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, {k: (v if v is not None else '') for k, v in attrs}, self.cur)
        self.cur.kids.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, {k: (v if v is not None else '') for k, v in attrs}, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def parse(markup):
    """A page as a tree."""
    t = Tree()
    t.feed(markup)
    t.close()
    return t.root


def by_id(root, ident):
    """getElementById."""
    return root.find(test=lambda n: n.attrs.get('id') == ident)


def strip(s):
    """JavaScript's trim()."""
    return s.strip()


def strip_diacritics(s):
    """BBP's stripDiacritics()."""
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if not '̀' <= c <= 'ͯ')
    return ''.join(NON_DECOMPOSABLE.get(c, c) for c in s)


def slug(s):
    """Lower case, a-z and 0-9 only (songTagSlug, relationTagSlug)."""
    return re.sub(r'[^a-z0-9]', '', strip_diacritics(s).lower())


def loc_slug(s):
    """BBP's toLocationTagSlug()."""
    s = re.sub(r'^(the|le|de)\s+', '', s.strip(), flags=re.I)
    s = re.sub(r'\s*\((?:the|le|de)\)\s*$', '', s, flags=re.I)
    return slug(s)


def present(tag, tags):
    """BBP's isTagPresent(): a number matches padded or not."""
    if tag in tags:
        return True
    if re.fullmatch(r'\d+', tag):
        s = str(int(tag))
        return s in tags or s.zfill(2) in tags
    return False


def managed(tag):
    """BBP's isManagedTag()."""
    return (tag in MANAGED_CONTENT or tag in MONTHS or tag in DAYS
            or bool(re.fullmatch(r'\d{4}', tag))
            or (bool(re.fullmatch(r'\d{1,2}', tag)) and 0 <= int(tag) <= 31)
            or tag == '9+' or bool(re.fullmatch(r'[a-z]', tag))
            or tag == TOUR_NO or tag in TOUR_TAGS)


def page_tags(markup):
    """A page's tags as written (div.page-tags links)."""
    m = re.search(r'<div class="page-tags">(.*?)</div>', markup, re.S)
    if not m:
        return []
    return [html.unescape(t).strip() for t in
            re.findall(r'<a href="/system:page-tags/tag/[^"]*"[^>]*>(.*?)</a>', m.group(1), re.S)]


class Mirror:
    """The mirror's pages by wiki name ("gig:1985-…")."""

    def __init__(self, root):
        self.root = root

    def path(self, name):
        """The file of a page name."""
        if ':' in name:
            cat, rest = name.split(':', 1)
            return os.path.join(self.root, cat, f'{cat}_{rest}.html')
        return os.path.join(self.root, f'{name}.html')

    def read(self, name):
        """The page's markup, or None."""
        p = self.path(name)
        if not os.path.isfile(p):
            return None
        with open(p, encoding='utf-8', errors='replace') as fh:
            return fh.read()

    def events(self):
        """Every event page name, sorted."""
        out = []
        for kind in KINDS:
            d = os.path.join(self.root, kind)
            if not os.path.isdir(d):
                continue
            for fn in os.listdir(d):
                if fn.startswith(kind + '_') and fn.endswith('.html'):
                    out.append(f'{kind}:{fn[len(kind) + 1:-5]}')
        return sorted(out)


def sibling_name(name, n):
    """_bbSiblingName(): the name cut so that "-N" fits 60 characters."""
    suffix = f'-{n}'
    return name[:NAME_MAX - len(suffix)].rstrip('-') + suffix


def tag_pages(mirror, name, own_tags, cast_tab):
    """The other pages that keep this show's tags: [(page name, tags)].

    As _bbTagPagesStart(): the page's own siblings while the page read last
    is over 450 characters; then the On stage page (or its "-1"), and that
    page's siblings the same way.
    """
    out = []

    def chain(base, last_tags):
        n = 2
        while len(' '.join(last_tags)) > TAG_PAGE_FULL and n <= 9:
            sib = sibling_name(base, n)
            markup = mirror.read(sib)
            if markup is None:
                break
            last_tags = page_tags(markup)
            out.append((sib, last_tags))
            n += 1

    if not re.search(r'-\d$', name):
        chain(name, own_tags)
    kind, rest = name.split(':', 1)
    if cast_tab and kind in ONSTAGE_KINDS:
        # The On stage page's own name is cut to 60 characters too (101 shows).
        base = f'onstage:{rest}'[:NAME_MAX].rstrip('-')
        on = base
        markup = mirror.read(on)
        if markup is None:
            on = sibling_name(base, 1)
            markup = mirror.read(on)
        if markup is not None:
            tags = page_tags(markup)
            out.append((on, tags))
            chain(base, tags)
    return out


def tab_map(doc):
    """BBP's buildTabMap(): label -> index."""
    out = {}
    i = 0
    for nav in doc.find_all(test=lambda n: n.has_class('yui-nav')):
        for em in nav.find_all('em'):
            out[strip(em.text())] = i
            i += 1
    return out


def tab_el(doc, tabs, label):
    """BBP's getTabEl()."""
    return by_id(doc, f'wiki-tab-0-{tabs[label]}') if label in tabs else None


def song_links(node):
    """a[href^="/song:"] under a node."""
    return node.find_all('a', lambda a: (a.attrs.get('href') or '').startswith('/song:'))


def clean_song(text):
    """BBP's cleanSongName()."""
    return re.sub(r'\s*\([^)]*[a-z][^)]*\)', '', text).strip()


def setlist_container(doc):
    """BBP's getSetlistContainer()."""
    tab = by_id(doc, 'wiki-tab-0-1')
    if tab is not None:
        return tab.find('td') or tab
    return by_id(doc, 'page-content')


def setlist_songs(doc):
    """The songs of BBP's parseDetailSetlist(), every section's, in order."""
    td = setlist_container(doc)
    if td is None:
        return []
    songs = []

    def from_list(lst):
        got = []
        for li in lst.find_all('li'):
            links = song_links(li)
            name = None
            if links:
                name = clean_song(' - '.join(strip(a.text()) for a in links))
            else:
                text = strip(li.text())
                if text and not re.match(r'\d{4}-\d{2}-\d{2}', text):
                    name = clean_song(text)
            if name:
                got.append(name)
        return got

    sections = 0
    for child in td.children():
        if child.tag == 'p':
            strong = child.find('strong')
            if strong is not None and strip(child.text()) == strip(strong.text()):
                continue
            if (strong is not None and not song_links(child) and all(
                    (isinstance(k, str) and not k.strip()) or
                    (isinstance(k, Node) and k.tag in ('strong', 'span')) for k in child.kids)):
                continue
            links = song_links(child)
            if links:
                name = clean_song(' - '.join(strip(a.text()) for a in links))
                if name:
                    songs.append(name)
                    sections += 1
        elif child.tag in ('ol', 'ul'):
            got = from_list(child)
            if got:
                sections += 1
            songs.extend(got)
    if not sections:
        for lst in td.find_all(test=lambda n: n.tag in ('ol', 'ul')):
            songs.extend(from_list(lst))
    return songs


def song_alias(title):
    """BBP's computeSongTagAlias()."""
    out = ''
    for raw in strip_diacritics(title).strip().split():
        if re.fullmatch(r'([A-Za-z]\.)+', raw):
            out += raw.replace('.', '').lower()
            continue
        word = re.sub(r"[()'\-&,.]", '', raw)
        if not word:
            continue
        out += word if re.fullmatch(r'\d+', word) else word[0].lower()
    return out


def check_songs(songs, tags):
    """Missing song tags: [(candidate tag, song)]."""
    out = []
    seen = set()
    uniq = list(dict.fromkeys(songs))
    for raw in uniq:
        combo = SONG_COMBO.get(raw.lower().strip())
        if combo is not None:
            if not present(combo, tags):
                out.append((combo, raw))
            continue
        for part in re.split(r'\s+-\s+', raw):
            if part in seen:
                continue
            seen.add(part)
            exact = slug(part)
            alias = song_alias(part)
            over = SONG_ALIAS.get(part.lower().strip())
            if present(exact, tags) or (alias and present(alias, tags)) or (over and present(over, tags)):
                continue
            out.append((alias or exact, part))
    return out


def event_alias(doc):
    """BBP's extractEventAlias()."""
    tab = by_id(doc, 'wiki-tab-0-0')
    if tab is None:
        return None
    kids = tab.children()
    if len(kids) < 2 or kids[1].tag != 'hr' or kids[0].tag != 'p':
        return None
    strong = kids[0].find('strong')
    if strong is None or strip(kids[0].text()) != strip(strong.text()):
        return None
    return strip(strong.text()) or None


def relations(doc):
    """BBP's extractRelations(), flat: [(name, extra)] with members."""
    tab = by_id(doc, 'wiki-tab-0-0')
    if tab is None:
        return []
    kids = tab.children()
    start = 0
    if len(kids) >= 2 and kids[0].tag == 'p' and kids[1].tag == 'hr':
        strong = kids[0].find('strong')
        if strong is not None and strip(kids[0].text()) == strip(strong.text()):
            start = 2

    def rel_link(li):
        for k in li.children():
            if k.tag == 'a' and (k.attrs.get('href') or '').startswith('/relation:'):
                return k
        return None

    def extra_of(li):
        sp = li.find('span', lambda n: 'font-size' in (n.attrs.get('style') or ''))
        return strip(sp.text()) if sp is not None else None

    out = []
    for el in kids[start:]:
        if el.tag in ('hr', 'ol'):
            break
        if el.tag == 'p':
            if el.find('strong') is None:
                break
        elif el.tag == 'ul':
            for li in [k for k in el.children() if k.tag == 'li']:
                a = rel_link(li)
                if a is None:
                    continue
                out.append((strip(a.text()), extra_of(li)))
                member_ul = next((k for k in li.children() if k.tag == 'ul'), None)
                if member_ul is not None:
                    for mli in [k for k in member_ul.children() if k.tag == 'li']:
                        ma = rel_link(mli)
                        if ma is not None:
                            out.append((strip(ma.text()), extra_of(mli)))
    return out


def check_one_relation(name, tags, prefer_dotted):
    """BBP's checkSingleRelationName(): (candidate tag, matched tag or None)."""
    the = re.sub(r'^the\s+', '', name, flags=re.I)
    suffix = re.sub(r'\s+(?:Jr\.?|Sr\.?|III|II|IV)$', '', name, flags=re.I).strip()
    nick = re.sub(r'\s+', ' ', re.sub(r'\s*"[^"]*"\s*', ' ', name)).strip()
    dotted = ESB_DOTTED.get(name.lower().strip())
    cands = [slug(name), slug(the), slug(suffix), slug(nick)]
    if dotted:
        cands.append(dotted)
    seen = set()
    for c in cands:
        if c in seen:
            continue
        seen.add(c)
        if present(c, tags):
            return c, c
    over = RELATION_ALIAS.get(name.lower().strip())
    if over and present(over, tags):
        return over, over
    return (dotted if (prefer_dotted and dotted) else cands[0]), None


def check_relation(name, tags, prefer_dotted):
    """BBP's checkRelationNameTags(): [(label, candidate, matched)]."""
    m = re.match(r'^(.+?)\s*&\s*(.+)$', name)
    if not m:
        c, hit = check_one_relation(name, tags, prefer_dotted)
        return [(name, c, hit)]
    a, b = m.group(1).strip(), m.group(2).strip()
    ca, ha = check_one_relation(a, tags, prefer_dotted)
    cb, hb = check_one_relation(b, tags, prefer_dotted)
    if ha and hb:
        return [(a, ca, ha), (b, cb, hb)]
    combined = slug(re.sub(r'\s*&\s*', '', re.sub(r'^the\s+', '', name, flags=re.I)))
    if present(combined, tags):
        return [(name, combined, combined)]
    return [(a, ca, ha), (b, cb, hb)]


def check_cast(doc, tabs, tags, kind):
    """BBP's checkOnStageRelationTags(): [(label, candidate, matched)]."""
    entry = next(((lab, fixed) for lab, fixed in RELATION_TABS if lab in tabs), None)
    if entry is None:
        return []
    label, fixed = entry
    rels = relations(doc)
    names = list(dict.fromkeys(n for n, _ in rels))
    out = []
    if fixed and not (label == 'On Stage' and kind == 'interview'):
        out.append((f'tab {label}', fixed, fixed if present(fixed, tags) else None))
    guests = list(dict.fromkeys(n for n, x in rels if x and re.search('guest', x, re.I)))
    if guests:
        out.append(('(Guest): ' + ', '.join(guests), 'guest', 'guest' if present('guest', tags) else None))
    prefer = ('On Stage' in tabs and kind in ('gig', 'rehearsal')
              and not any(n.lower() == 'the e street band' for n in names))
    for n in names:
        out.extend(check_relation(n, tags, prefer))
    return out


def location_parts(parts):
    """BBP's parseLocationParts()."""
    if len(parts) < 3:
        return None
    last = parts[-1]
    abbr = last if re.fullmatch(r'[A-Z]{2}', last) and (last in US_STATES or last in CA_PROVINCES) else None
    return {'venue': parts[0], 'detail': ', '.join(parts[1:-2]) if len(parts) >= 4 else None,
            'city': parts[-2], 'state': abbr, 'country': None if abbr else last}


def title_location(title):
    """BBP's parseEventNameLocation()."""
    m = re.match(r'^\d{4}-\d{2}-\d{2}\s+(.+)$', title.strip(), re.S)
    if not m:
        return None
    rest = re.sub(r'\s*\((?:Early|Late|Afternoon|Evening)\)\s*$', '', m.group(1), flags=re.I)
    return location_parts([p.strip() for p in rest.split(',') if p.strip()])


def venue_detail_extra(venue_title, detail_part):
    """BBP's findVenueDetailExtra()."""
    m = re.search(r'\s*(\((?:Early|Late|Afternoon|Evening)\))\s*$', detail_part, re.I)
    if m and detail_part[:m.start()].strip() == venue_title:
        return m.group(1)
    loc = location_parts([p.strip() for p in detail_part.split(',') if p.strip()])
    if not loc or not loc['detail']:
        return None
    tail = loc['state'] or loc['country']
    if not tail:
        return None
    return loc['detail'] if f"{loc['venue']}, {loc['city']}, {tail}" == venue_title else None


def check_loc_name(label, name, tags, city=None):
    """BBP's checkLocationNameTag(): (label, candidate, matched) or None."""
    key = name.lower().strip()
    if key in VENUE_ALIAS:
        over = VENUE_ALIAS[key]
        if over is None:
            return None
        return (f'{label}: {name}', over, over if present(over, tags) else None)
    s = loc_slug(name)
    if present(s, tags):
        return (f'{label}: {name}', s, s)
    if city:
        if name.strip().lower().startswith(city.strip().lower() + ' '):
            rem = loc_slug(name.strip()[len(city.strip()):].strip())
            if rem:
                return (f'{label}: {name}', rem, rem if present(rem, tags) else None)
    return (f'{label}: {name}', s, None)


def check_location(title, tags):
    """BBP's checkEventNameLocationTags(): [(label, candidate, matched)]."""
    loc = title_location(title)
    if not loc:
        return []
    out = []
    m = re.match(r'^(.+?)\s+at\s+the\s+(.+)$', loc['venue'], re.I)
    if m:
        out.append(check_loc_name('Venue', m.group(1).strip(), tags, loc['city']))
        out.append(check_loc_name('Venue', m.group(2).strip(), tags, loc['city']))
    else:
        out.append(check_loc_name('Venue', loc['venue'], tags, loc['city']))
    if loc['detail']:
        out.append(check_loc_name('Venue detail', loc['detail'], tags))
    out.append(check_loc_name('City', loc['city'], tags))
    if loc['state']:
        us = loc['state'] in US_STATES
        full = US_STATES[loc['state']] if us else CA_PROVINCES[loc['state']]
        st = f"{loc_slug(full)}({loc['state'].lower()})"
        out.append((f"State: {loc['state']}", st, st if present(st, tags) else None))
        c = 'usa' if us else 'canada'
        out.append((f'Country: {c}', c, c if present(c, tags) else None))
    elif loc['country']:
        c = loc_slug(loc['country'])
        out.append((f"Country: {loc['country']}", c, c if present(c, tags) else None))
        for extra in COUNTRY_EXTRA.get(loc['country'], []):
            out.append((f'Region: {extra}', extra, extra if present(extra, tags) else None))
    return [x for x in out if x]


def expected_tags(doc, tabs, date, kind, letter, has_help, has_featured, tour_tags):
    """BBP's computeExpectedTags(): {tag: family}."""
    exp = {}
    m = re.fullmatch(r'(\d{4})-(\d{2})-(\d{2})', date or '')
    if m:
        yr, mo, dd = m.groups()
        exp[yr] = 'date'
        if int(mo) > 0:
            exp[MONTHS[int(mo) - 1]] = 'date'
        exp[dd] = 'date'
        if int(dd) > 0 and int(mo) > 0:
            # JavaScript's Date rolls an impossible day over (Feb 30 -> Mar 2)
            d = datetime.date(int(yr), int(mo), 1) + datetime.timedelta(days=int(dd) - 1)
            exp[DAYS[(d.weekday() + 1) % 7]] = 'date'
    if letter:
        exp[letter] = 'letter'
    if has_help:
        exp['help'] = 'content'
    if has_featured:
        exp['featured'] = 'content'
    if any(re.search('under construction', em.text(), re.I)
           for sup in doc.find_all('sup') for em in sup.find_all('em')):
        exp['underconstruction'] = 'content'
    if kind:
        exp[kind.lower()] = 'type'

    def filled(tab):
        return tab is not None and not SORRY_RE.match(strip(tab.text()))

    rec = tab_el(doc, tabs, 'Recording')
    if filled(rec):
        live = (rec.find(test=lambda n: n.has_class('image-container')) is not None
                or rec.find('a', lambda a: 'nugs.net' in (a.attrs.get('href') or '')) is not None
                or re.search(r'official\s+concert\s+recording', rec.text(), re.I) is not None)
        if live:
            exp['livedl'] = 'content'
        if not live or rec.find('hr') is not None:
            exp['bootleg'] = 'content'
    news = tab_el(doc, tabs, 'News/Memorabilia')
    if news is None:
        news = tab_el(doc, tabs, 'News')
    if filled(news):
        exp['news'] = 'content'
        srcs = [i.attrs.get('src') or '' for i in news.find_all('img')]
        if 'News/Memorabilia' in tabs and srcs:
            exp['memorabilia'] = 'content'
        if any(re.search('ticket', s, re.I) or re.search(r'/(?:files:)?pass', s, re.I) for s in srcs):
            exp['ticket'] = 'content'
        sets = [s for s in srcs if re.search('setlist', s, re.I) and not re.search('ticket', s, re.I)]
        if sets:
            exp['setlist'] = 'content'
            if any(re.search('handwritten', s, re.I) for s in sets):
                exp['handwritten'] = 'content'
            if any(re.search('printed', s, re.I) for s in sets):
                exp['printed'] = 'content'
    cont = setlist_container(doc)
    content = by_id(doc, 'page-content') or doc
    head = cont is not None and any(
        re.fullmatch('soundcheck', strip(s.text()), re.I)
        for p in cont.find_all('p') for s in p.find_all('strong'))
    if head or re.search(r'\bsoundcheck\s*:', content.text(), re.I):
        exp['soundcheck'] = 'content'
    notes = []
    pc = by_id(doc, 'page-content')
    if pc is not None:
        for child in pc.children():
            if child.has_class('yui-navset'):
                break
            if child.tag != 'script':
                notes.append(notes_text(child))
    if re.search(r'rescheduled\s+from', ''.join(notes), re.I):
        exp['rescheduled'] = 'content'
    for label, tag in (('Storyteller', 'storyteller'), ('Eyewitness', 'eyewitness')):
        if filled(tab_el(doc, tabs, label)):
            exp[tag] = 'content'
    prem = 0
    if cont is not None:
        prem = sum(1 for a in song_links(cont) if a.inside('strong'))
    if prem > 0:
        exp[str(prem) if prem <= 9 else '9+'] = 'prem'
        exp['prem'] = 'prem'
    for t in tour_tags or ():
        exp[t] = 'tour'
    return exp


def notes_text(node):
    """textContent without script elements."""
    out = []
    for k in node.kids:
        if isinstance(k, str):
            out.append(k)
        elif k.tag != 'script':
            out.append(notes_text(k))
    return ''.join(out)


def tour_check(date, alias):
    """BBP's checkEventTourTags(): the expected tour tags, or None."""
    hit = [t for t, ranges in TOURS if any(a <= date <= b for a, b in ranges)]
    if not hit:
        return None
    return {TOUR_NO} if alias else set(hit)


FOUR = ('date', 'letter', 'type', 'prem')
# The help-icon check (vzell, 2026-11-16): a show marked with the Help Us
# or the Featured icon (on its year page, or on its own page) carries the
# tag; a show with neither icon does not. Family "icon".
ICON_TAGS = ('help', 'featured')
FOUR_TYPES = ('gig', 'interview', 'nobruce', 'nogig', 'offstage', 'recording', 'rehearsal')


def checked_family(tag):
    """The family of a tag batch 3 may call not expected, '' for the rest.

    The four families vzell chose (2026-11-15). A single digit is a premiere
    count before it is a day, as BBP's spuriousTagMsg() reads it; "onstage"
    belongs to the cast family and "soundcheck" to the content family.
    """
    if re.fullmatch(r'\d{4}', tag) or tag in MONTHS or tag in DAYS:
        return 'date'
    if re.fullmatch(r'[1-9]', tag) or tag in ('9+', 'prem'):
        return 'prem'
    if re.fullmatch(r'\d{1,2}', tag) and int(tag) <= 31:
        return 'date'
    if re.fullmatch(r'[a-z]', tag):
        return 'letter'
    if tag in FOUR_TYPES:
        return 'type'
    return ''


def four_families(exp, own, tags, icons=None, facts_icons=None):
    """What batch 3 ships: {missing: [[tag, family]], spurious: [[tag, family]]}."""
    ship = {t: fam for t, fam in exp.items() if fam in FOUR}
    # the icon family: the year page's icon by its file, or the page's own
    for t in ICON_TAGS:
        if (icons or {}).get(t) or (facts_icons or {}).get(t):
            ship[t] = 'icon'
    want = set(ship)
    missing = [[t, fam] for t, fam in ship.items() if not present(t, tags)]
    spurious = []
    for t in dict.fromkeys(own):
        fam = 'icon' if t in ICON_TAGS else checked_family(t)
        if fam and not present(t, want):
            spurious.append([t, fam])
    return {'missing': missing, 'spurious': spurious}


def has_icon(doc, title):
    """img.image[title=…] anywhere on the page."""
    return doc.find('img', lambda i: i.has_class('image') and i.attrs.get('title') == title) is not None


def year_icons(mirror):
    """Events the YEAR page marks with a Help Us / Featured icon.

    BBP's eventHasHelpIcon(): an img.image with that title after the event's
    link and before the next a[name].
    """
    # 'file:help' / 'file:featured': the same by the icon's FILE (00Help,
    # 00Star), which is what the page shows: 12 entries have the star with no
    # title (1968-06-22a), so BBP's title rule misses them (2026-11-16).
    out = {'Help Us': set(), 'Featured': set(), 'file:help': set(), 'file:featured': set()}
    for fn in sorted(os.listdir(mirror.root)):
        if not re.fullmatch(r'\d{4}(-\d\d)?\.html', fn):
            continue
        with open(os.path.join(mirror.root, fn), encoding='utf-8', errors='replace') as fh:
            page = fh.read()
        marks = []
        # The entry's own link is its heading's (<strong><a …>). A link to a
        # show in another entry's notes is not its entry: taken as one, the
        # 1993-01-12 gig got the Help Us icon of a 1969 entry that mentions it
        # (found by scripts/check-bb-batch3-findings.js against the shipped
        # year reader, 2026-11-16).
        for m in re.finditer(r'<strong><a href="/((?:%s):[^"#]+)"|<a name="|<img\b[^>]*>' % '|'.join(KINDS), page):
            s = m.group(0)
            if s.startswith('<strong><a href'):
                marks.append(('link', m.group(1)))
            elif s.startswith('<a name'):
                marks.append(('anchor', None))
            else:
                t = re.search(r'title="([^"]*)"', s)
                c = re.search(r'class="([^"]*)"', s)
                if t and c and 'image' in c.group(1).split() and t.group(1) in out:
                    marks.append(('img', t.group(1)))
                f = re.search(r'/00(Help|Star)-\d+\.png', s)
                if f or (t and t.group(1) in ('Help Us', 'Featured')):
                    star = (f.group(1) == 'Star') if f else t.group(1) == 'Featured'
                    marks.append(('img', 'file:featured' if star else 'file:help'))
        first = {}
        for i, (k, v) in enumerate(marks):
            if k == 'link' and v not in first:
                first[v] = i
        for name, i in first.items():
            for k, v in marks[i + 1:]:
                if k == 'anchor':
                    break
                if k == 'img':
                    out[v].add(name)
    return out


def analyse(mirror, name, icons):
    """One event: its tags, the expected ones, what is missing and spurious."""
    markup = mirror.read(name)
    doc = parse(markup)
    kind, rest = name.split(':', 1)
    own = [t.lower() for t in page_tags(markup)]
    tabs = tab_map(doc)
    cast_tab = any(re.fullmatch(r'On ?Stage', lab, re.I) for lab in tabs)
    pages = tag_pages(mirror, name, own, cast_tab)
    tags = set(own)
    for _, more in pages:
        tags.update(t.lower() for t in more)
    title_el = by_id(doc, 'page-title')
    title = strip(title_el.text()) if title_el is not None else ''
    dm = re.match(r'(\d{4}-\d{2}-\d{2})', title)
    date = dm.group(1) if dm else ''
    am = re.match(r'(\d{4}-\d{2}-\d{2})([a-z])?(?:-|$)', rest)
    letter = am.group(2) if am else None
    alias = event_alias(doc)
    tour = tour_check(date, alias) if date else None
    help_page = has_icon(doc, 'Help Us')
    feat_page = has_icon(doc, 'Featured')
    help_year = name in icons['Help Us']
    feat_year = name in icons['Featured']
    exp = expected_tags(doc, tabs, date, kind, letter, help_page or help_year,
                        feat_page or feat_year, tour)
    missing = [(t, fam, '') for t, fam in exp.items() if not present(t, tags)]
    cast = check_cast(doc, tabs, tags, kind)
    matched_rel = {hit for _, _, hit in cast if hit}
    missing += [(c, 'cast', lab) for lab, c, hit in cast if not hit]
    songs = setlist_songs(doc)
    missing += [(c, 'song', s) for c, s in check_songs(songs, tags)]
    venue_title = None
    vm = re.search(r'<a href="/(venue:[^"#]+)"[^>]*>Venue</a>', markup)
    if vm:
        vpage = mirror.read(vm.group(1))
        if vpage:
            vt = re.search(r'<div id="page-title">(.*?)</div>', vpage, re.S)
            venue_title = html.unescape(re.sub(r'<[^>]+>', '', vt.group(1))).strip() if vt else None
    extra = None
    tm = re.match(r'^\d{4}-\d{2}-\d{2}\s+(.+)$', title, re.S)
    if venue_title and tm:
        extra = venue_detail_extra(venue_title, tm.group(1))
    place_venue_dropped = 0
    for lab, c, hit in check_location(title, tags):
        if hit:
            continue
        if extra and lab == f'Venue detail: {extra}':
            place_venue_dropped += 1
            continue
        missing.append((c, 'place', lab))
    exp_set = set(exp)
    spurious = [t for t in own if managed(t) and not present(t, exp_set) and t not in matched_rel]
    return {
        'name': name, 'title': title, 'date': date, 'kind': kind,
        'tags': own, 'pages': [[p, t] for p, t in pages],
        'missing': [list(m) for m in missing], 'spurious': spurious,
        'expected': exp, 'helpYear': help_year, 'featYear': feat_year,
        'four': four_families(exp, own, tags,
                              {'help': name in icons['file:help'], 'featured': name in icons['file:featured']},
                              {'help': help_page, 'featured': feat_page}),
        'iconsYear': {'help': name in icons['file:help'], 'featured': name in icons['file:featured']},
        'facts': {'title': title, 'kind': kind, 'date': date, 'letter': letter or '',
                  'prem': sum(1 for a in song_links(setlist_container(doc) or doc) if a.inside('strong')),
                  'help': help_page, 'featured': feat_page},
        'dateDiffers': bool(am and date and am.group(1) != date),
        'helpYearOnly': (help_year and not help_page), 'featYearOnly': (feat_year and not feat_page),
        'venueDropped': place_venue_dropped, 'noTitleDate': not date,
        'castTab': cast_tab, 'tabs': list(tabs),
    }


def date_report(mirror):
    """BruceParser's date-part report: {page name: [what]} for the event kinds."""
    out = defaultdict(list)
    p = os.path.join(mirror.root, 'REPORTING', 'MISSING-date-parts-in-tags.org')
    if not os.path.isfile(p):
        return None
    with open(p, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            cells = [c.strip() for c in line.split('|')]
            if len(cells) < 5 or cells[1] not in KINDS:
                continue
            m = re.search(r'brucebase\.wikidot\.com/(\S+)', cells[2])
            if m:
                out[m.group(1)].append(re.sub(r'\s+', ' ', cells[3]))
    return out


def main(argv):
    """Run the probe."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--json')
    ap.add_argument('--rows')
    ap.add_argument('--list')
    ap.add_argument('--show')
    ap.add_argument('--limit', type=int)
    args = ap.parse_args(argv)
    mirror = Mirror(os.path.realpath(args.mirror))
    icons = year_icons(mirror)
    if args.show:
        print(json.dumps(analyse(mirror, args.show, icons), indent=1, ensure_ascii=False))
        return 0
    names = mirror.events()
    skipped = []
    rows = []
    for name in names[:args.limit] if args.limit else names:
        markup = mirror.read(name)
        if re.search(r'-\d$', name) and 'class="yui-navset"' not in markup:
            skipped.append(name)
            continue
        rows.append(analyse(mirror, name, icons))

    print(f'mirror {mirror.root}')
    print(f'{len(rows)} events read, {len(skipped)} "-N" pages without tabs left out')
    print(f'year pages mark Help Us on {len(icons["Help Us"])} events, Featured on {len(icons["Featured"])} (by title); '
          f'by the icon file {len(icons["file:help"])} and {len(icons["file:featured"])}')
    kinds = Counter(r['kind'] for r in rows)
    print('by kind: ' + ', '.join(f'{k} {kinds[k]}' for k in KINDS))
    print(f'with other tag pages: {sum(1 for r in rows if r["pages"])}; '
          f'title date differs from the address: {sum(1 for r in rows if r["dateDiffers"])}; '
          f'no date in the title: {sum(1 for r in rows if r["noTitleDate"])}')
    miss_rows = [r for r in rows if r['missing']]
    spur_rows = [r for r in rows if r['spurious']]
    print(f'\nevents with a missing tag: {len(miss_rows)}; with a spurious tag: {len(spur_rows)}; '
          f'with either: {sum(1 for r in rows if r["missing"] or r["spurious"])}; '
          f'clean: {sum(1 for r in rows if not r["missing"] and not r["spurious"])}')
    fam_events = Counter()
    fam_tags = Counter()
    fam_top = defaultdict(Counter)
    for r in rows:
        for fam in {m[1] for m in r['missing']}:
            fam_events[fam] += 1
        for t, fam, _ in r['missing']:
            fam_tags[fam] += 1
            fam_top[fam][t] += 1
    print('\nmissing, by family (events / tags; the most frequent):')
    for fam in ('date', 'letter', 'type', 'content', 'prem', 'tour', 'place', 'cast', 'song'):
        top = ', '.join(f'{t} {n}' for t, n in fam_top[fam].most_common(8))
        print(f'  {fam:8} {fam_events[fam]:5} / {fam_tags[fam]:6}   {top}')
    spur = Counter(t for r in rows for t in r['spurious'])
    print(f'\nspurious: {sum(spur.values())} tags on {len(spur_rows)} events; '
          + ', '.join(f'{t} {n}' for t, n in spur.most_common(25)))
    fm = Counter()
    fs = Counter()
    for r in rows:
        for fam in {f for _, f in r['four']['missing']}:
            fm[fam] += 1
        for fam in {f for _, f in r['four']['spurious']}:
            fs[fam] += 1
    print('\nthe families that are shipped, batch 3\'s four and the icons (events):')
    print(f'  missing   {sum(1 for r in rows if r["four"]["missing"]):4}   ' + ', '.join(f'{f} {fm[f]}' for f in FOUR + ("icon",)))
    print(f'  spurious  {sum(1 for r in rows if r["four"]["spurious"]):4}   ' + ', '.join(f'{f} {fs[f]}' for f in FOUR + ("icon",)))
    print(f'  either    {sum(1 for r in rows if r["four"]["missing"] or r["four"]["spurious"]):4}')
    print('\nwhat the surfaces would see differently:')
    print(f'  Help Us only on the year page: {sum(1 for r in rows if r["helpYearOnly"])}; '
          f'Featured only there: {sum(1 for r in rows if r["featYearOnly"])}')
    print(f'  a venue-detail miss the venue page excuses: {sum(r["venueDropped"] for r in rows)}')
    print(f'  interview with "onstage" spurious: '
          f'{sum(1 for r in rows if r["kind"] == "interview" and "onstage" in r["spurious"])}')
    print(f'  day "00" missing: {sum(1 for r in rows for m in r["missing"] if m[0] == "00")}')

    rep = date_report(mirror)
    if rep is None:
        print('\nno REPORTING/MISSING-date-parts-in-tags.org in this mirror')
    else:
        ours = {}
        for r in rows:
            what = [m[0] for m in r['missing'] if m[1] == 'date']
            # a single digit 1-9 is a premiere count to BBP, not a day
            what += [t for t in r['spurious']
                     if t in MONTHS or t in DAYS or re.fullmatch(r'\d{2}|\d{4}|0', t)]
            if what:
                ours[r['name']] = what
        both = sorted(set(ours) & set(rep))
        only_rep = sorted(set(rep) - set(ours))
        only_here = sorted(set(ours) - set(rep))
        print(f"\ndate parts against BruceParser's report: {len(rep)} pages there, {len(ours)} here, "
              f'{len(both)} in both')
        for n in only_rep:
            print(f'  only there: {n}  {rep[n]}')
        for n in only_here[:60]:
            print(f'  only here:  {n}  {ours[n]}')
        if len(only_here) > 60:
            print(f'  … {len(only_here) - 60} more only here')

    if args.list:
        print(f'\n--list {args.list}')
        for r in rows:
            if args.list == 'spurious':
                if r['spurious']:
                    print(f'  {r["name"]}  {r["spurious"]}')
            else:
                hit = [m for m in r['missing'] if m[1] == args.list]
                if hit:
                    print(f'  {r["name"]}  ' + '; '.join(f'{m[0]} ({m[2]})' if m[2] else m[0] for m in hit))
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump([r for r in rows if r['missing'] or r['spurious']], fh, ensure_ascii=False, indent=1)
    if args.rows:
        with open(args.rows, 'w', encoding='utf-8') as fh:
            json.dump(rows, fh, ensure_ascii=False)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
