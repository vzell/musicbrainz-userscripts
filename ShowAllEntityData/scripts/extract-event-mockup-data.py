"""Extract the data of org/event-overview-mockups.html from a saved event page.

Design helper for the event-overview pageType study (branch design/event-overview,
org/event-overview-pt.org). It reads a MusicBrainz event overview snapshot and
writes what the mockup needs as JSON:

  - "relationships": one entry per target of every `table.details` row under
    `h2.relationships` and `h2.related-series` — the phrase (the row's <th>),
    the target's entity type and name, its href, and the rest of the line
    (attributes such as "(time: 19:40 - 22-29)", a disambiguation, the area
    chain after a place);
  - "setlist": the `p.setlist` paragraph split into its <br>-separated lines,
    each classified as artist / join / blank / header / note / song (a song
    line keeps every /work/ link it holds, so a medley stays one line).

Only the standard library is used (html.parser), as in the other build-*
scripts. Third-party userscript markup in the snapshot is ignored where it
would otherwise leak into text (flag wrappers, "[info]" links are kept as-is).

usage:
  python3 scripts/extract-event-mockup-data.py debug/event-PT.html org/event-overview-data.json
"""

import json
import re
import sys
from html.parser import HTMLParser

VOID = {'br', 'img', 'hr', 'input', 'meta', 'link', 'col', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'track'}


class Node:
    """A minimal DOM node: tag, attributes, children (Node or str)."""

    def __init__(self, tag, attrs, parent):
        self.tag = tag
        self.attrs = dict(attrs)
        self.parent = parent
        self.children = []

    def cls(self):
        """Returns the node's class list."""
        return (self.attrs.get('class') or '').split()

    def text(self):
        """Returns the node's text content."""
        out = []
        for c in self.children:
            out.append(c if isinstance(c, str) else c.text())
        return ''.join(out)

    def walk(self):
        """Yields every descendant node, depth first."""
        for c in self.children:
            if isinstance(c, Node):
                yield c
                yield from c.walk()


class TreeBuilder(HTMLParser):
    """Builds a Node tree; tolerant of unclosed tags."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#root', [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        """Opens a node (void tags close at once)."""
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        """A self-closed tag."""
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        """Closes the nearest open node with this tag."""
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        """Appends text."""
        self.cur.children.append(data)


def squash(s):
    """Collapses whitespace."""
    return re.sub(r'\s+', ' ', s).strip()


def split_br(td):
    """Splits a node's children into lists of children, one per <br>-separated line."""
    lines = [[]]
    for c in td.children:
        if isinstance(c, Node) and c.tag == 'br':
            lines.append([])
        else:
            lines[-1].append(c)
    return lines


def line_text(parts):
    """Text of a list of children."""
    return squash(''.join(p if isinstance(p, str) else p.text() for p in parts))


ENTITY_RE = re.compile(r'^/(artist|place|area|recording|release|release-group|work|series|label|event|instrument|url)/')


def first_entity(parts):
    """The first entity link in a line: (type, name, href) or None. URL lines give ('url', text, href)."""
    for p in parts:
        if not isinstance(p, Node):
            continue
        anchors = [p] if p.tag == 'a' else [n for n in p.walk() if n.tag == 'a']
        for a in anchors:
            href = a.attrs.get('href') or ''
            m = ENTITY_RE.match(href)
            if m:
                return m.group(1), squash(a.text()), href
            if href.startswith('http'):
                return 'url', squash(a.text()), href
    return None


def relationships(root):
    """Every target of every table.details row under the Relationships / Related series h2s."""
    out = []
    group = None
    for n in root.walk():
        if n.tag == 'h2':
            c = n.cls()
            group = 'Relationships' if 'relationships' in c else ('Related series' if 'related-series' in c else None)
            continue
        if group is None or n.tag != 'table' or 'details' not in n.cls():
            continue
        for tr in (x for x in n.walk() if x.tag == 'tr'):
            th = next((x for x in tr.children if isinstance(x, Node) and x.tag == 'th'), None)
            td = next((x for x in tr.children if isinstance(x, Node) and x.tag == 'td'), None)
            if th is None or td is None:
                continue
            phrase = squash(th.text()).rstrip(':')
            for parts in split_br(td):
                ent = first_entity(parts)
                full = line_text(parts)
                if not ent and not full:
                    continue
                etype, name, href = ent if ent else ('text', full, '')
                rest = squash(full.replace(name, '', 1)) if name else full
                out.append({'group': group, 'phrase': phrase, 'type': etype, 'name': name, 'href': href, 'rest': rest})
    return out


def setlist(root):
    """The p.setlist lines, classified."""
    p = next((n for n in root.walk() if n.tag == 'p' and 'setlist' in n.cls()), None)
    if p is None:
        return []
    out = []
    prev_blank = True
    for parts in split_br(p):
        nodes = [x for x in parts if isinstance(x, Node)]
        txt = line_text(parts)
        works = []
        for x in nodes:
            for a in ([x] if x.tag == 'a' else [y for y in x.walk() if y.tag == 'a']):
                if (a.attrs.get('href') or '').startswith('/work/'):
                    works.append({'name': squash(a.text()), 'href': a.attrs['href']})
        if not txt:
            out.append({'kind': 'blank'})
            prev_blank = True
            continue
        strong = next((x for x in nodes if x.tag == 'strong'), None)
        comment = next((x for x in nodes if x.tag == 'span' and 'comment' in x.cls()), None)
        if strong is not None and txt.startswith('Artist:'):
            ent = first_entity(parts)
            out.append({'kind': 'artist', 'name': ent[1] if ent else txt[7:].strip(), 'href': ent[2] if ent else ''})
        elif works:
            out.append({'kind': 'song', 'text': txt, 'works': works})
        elif comment is not None and prev_blank:
            out.append({'kind': 'header', 'text': txt})
        elif comment is not None and txt.lower() in ('&', 'and', 'with', 'feat.', 'featuring', '+'):
            out.append({'kind': 'join', 'text': txt})
        elif comment is not None:
            out.append({'kind': 'note', 'text': txt})
        else:
            out.append({'kind': 'song', 'text': txt, 'works': []})
        prev_blank = False
    return out


def main():
    """Reads the snapshot, writes the JSON."""
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    with open(sys.argv[1], encoding='utf-8-sig') as f:
        tb = TreeBuilder()
        tb.feed(f.read())
    root = tb.root
    data = {'source': sys.argv[1], 'relationships': relationships(root), 'setlist': setlist(root)}
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    kinds = {}
    for ln in data['setlist']:
        kinds[ln['kind']] = kinds.get(ln['kind'], 0) + 1
    types = {}
    for r in data['relationships']:
        types[r['type']] = types.get(r['type'], 0) + 1
    print(f"relationships: {len(data['relationships'])} targets {types}")
    print(f"setlist: {len(data['setlist'])} lines {kinds}")


if __name__ == '__main__':
    main()
