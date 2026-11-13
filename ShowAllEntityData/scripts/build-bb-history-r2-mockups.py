#!/usr/bin/env python3
"""Build the History round-2 mockups (org/brucebase.org, "History round 2").

    python3 scripts/fetch-bb-history-mockup-data.py      # the real data, once
    python3 scripts/build-bb-history-r2-mockups.py [data.json] [out.html]

Reads the data fetched for song:streets-of-minneapolis (default
debug/bb-history-mockup-data.json) and writes one HTML page (default
debug/bb-history-r2-mockups.html, gitignored: it names the wiki's members)
that the Artifact tool publishes as is (no document skeleton of its own).

What it shows, all from the real answers:
  A. the window's History section with the three proposals together — type
     chips, From/To picks, the compare pane with the tag strip — working on
     this song's 44 revisions (the chips filter, the picks switch between the
     two comparisons the data holds: 40 → 41 and 28 → 43);
  B. the type chips and how they map to Wikidot's checkboxes;
  C. tag changes: in the list (read from the comment) and in the pane (from
     PageDiffModule's compare table);
  D. any two revisions;
  E. what each act asks of the wiki;
  F. the narrow window;
  and the open questions.
The line diff is computed here as `_bbHistDiffRows()` does it (common ends,
matched lines, each old line paired with the next close new line), the words
inside a changed line by token matching.
"""

import difflib
import html
import json
import os
import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BERLIN = ZoneInfo('Europe/Berlin')
FLAG_TEXT = {'N': 'new page created', 'S': 'content source text changed', 'T': 'title changed',
             'R': 'page renamed/moved', 'A': 'tags changed', 'M': 'meta data changed', 'F': 'file/attachment action'}
TYPES = [('all', 'All', ''), ('source', 'Source', 'S'), ('title', 'Title', 'T'), ('move', 'Page name', 'R'),
         ('tags', 'Tags', 'A'), ('meta', 'Metadata', 'M'), ('files', 'Files', 'F')]
TOKEN_RE = re.compile(r'\w+|\s+|[^\w\s]')


def esc(s):
    """HTML-escapes."""
    return html.escape(str(s), quote=True)


def when(at):
    """Epoch seconds as Berlin "YYYY-MM-DD HH:MM"."""
    return datetime.fromtimestamp(at, BERLIN).strftime('%Y-%m-%d %H:%M') if at else ''


def word_blocks(a, b):
    """(old html, new html, plain): the words of a changed line marked."""
    ta, tb = TOKEN_RE.findall(a), TOKEN_RE.findall(b)
    sm = difflib.SequenceMatcher(a=ta, b=tb, autojunk=False)
    oa, ob, shared = [], [], 0
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        x, y = ''.join(ta[i1:i2]), ''.join(tb[j1:j2])
        if op == 'equal':
            oa.append(esc(x))
            ob.append(esc(y))
            shared += len(x)
        else:
            if x:
                oa.append(f'<span class="w-rem">{esc(x)}</span>')
            if y:
                ob.append(f'<span class="w-add">{esc(y)}</span>')
    plain = bool(a) and bool(b) and 2 * shared / (len(a) + len(b)) < 0.4
    return ''.join(oa), ''.join(ob), plain


def diff_rows(a, b):
    """The rows of a line diff, as _bbHistDiffRows() makes them."""
    rows = []
    pre = 0
    while pre < len(a) and pre < len(b) and a[pre] == b[pre]:
        pre += 1
    suf = 0
    while suf < len(a) - pre and suf < len(b) - pre and a[len(a) - 1 - suf] == b[len(b) - 1 - suf]:
        suf += 1
    for i in range(pre):
        rows.append(('same', a[i], b[i], i + 1, i + 1))
    ma, mb = a[pre:len(a) - suf], b[pre:len(b) - suf]
    sm = difflib.SequenceMatcher(a=ma, b=mb, autojunk=False)
    ai = bi = 0

    def hunk(ea, eb):
        olds, news = ma[ai:ea], mb[bi:eb]
        j = 0
        for i, o in enumerate(olds):
            an = pre + ai + i + 1
            for k in range(j, min(len(news), j + 8)):
                if not word_blocks(o, news[k])[2]:
                    for x in range(j, k):
                        rows.append(('add', None, news[x], None, pre + bi + x + 1))
                    rows.append(('chg', o, news[k], an, pre + bi + k + 1))
                    j = k + 1
                    break
            else:
                rows.append(('rem', o, None, an, None))
        for x in range(j, len(news)):
            rows.append(('add', None, news[x], None, pre + bi + x + 1))

    for blk in sm.get_matching_blocks():
        hunk(blk.a, blk.b)
        for k in range(blk.size):
            rows.append(('same', ma[blk.a + k], mb[blk.b + k], pre + blk.a + k + 1, pre + blk.b + k + 1))
        ai, bi = blk.a + blk.size, blk.b + blk.size
    for i in range(suf):
        x, y = len(a) - suf + i, len(b) - suf + i
        rows.append(('same', a[x], b[y], x + 1, y + 1))
    return rows


def diff_html(rows, old_label, new_label, everything=False):
    """The OLD | NEW grid."""
    cells = [f'<div class="dh">{esc(old_label)}</div>', f'<div class="dh n">{esc(new_label)}</div>']
    skipped = 0

    def flush():
        nonlocal skipped
        if skipped:
            cells.append(f'<div class="fold">⋯ {skipped} unchanged line{"s" if skipped != 1 else ""}</div>')
        skipped = 0

    ln = lambda n: f'<span class="ln">{n or ""}</span>'
    for t, a, b, an, bn in rows:
        if t == 'same' and not everything:
            skipped += 1
            continue
        flush()
        if t == 'same':
            cells += [f'<div class="l">{ln(an)}{esc(a)}</div>', f'<div class="l n">{ln(bn)}{esc(b)}</div>']
        elif t == 'chg':
            oa, ob, _ = word_blocks(a, b)
            cells += [f'<div class="l chg">{ln(an)}{oa}</div>', f'<div class="l chg n">{ln(bn)}{ob}</div>']
        elif t == 'rem':
            cells += [f'<div class="l rem">{ln(an)}{esc(a)}</div>', '<div class="l n"></div>']
        else:
            cells += ['<div class="l"></div>', f'<div class="l add n">{ln(bn)}{esc(b)}</div>']
    flush()
    return f'<div class="diff">{"".join(cells)}</div>'


def tag_changes(comment):
    """(added, removed) tags from a revision's comment ("Added tags: a, b. Removed tags: c.")."""
    add = re.search(r'Added tags:\s*([^.]*)\.', comment or '')
    rem = re.search(r'Removed tags:\s*([^.]*)\.', comment or '')
    split = lambda m: [t.strip() for t in m.group(1).split(',') if t.strip()] if m else []
    return split(add), split(rem)


def tag_strip(compare):
    """The pane's Tags row from PageDiffModule's compare table: every tag of the
    newer revision, the added ones marked, the removed ones (old only) struck."""
    row = next((r for r in compare if r and r[0].startswith('Tags')), None)
    if not row:
        return '<div class="tags"><span class="tl">Tags</span><span class="dim">the same in both</span></div>'
    old, new = row[1].split(), row[2].split()
    pills = []
    for t in sorted(set(old) | set(new)):
        cls = 'add' if t in new and t not in old else 'rem' if t in old and t not in new else ''
        sign = '+ ' if cls == 'add' else '− ' if cls == 'rem' else ''
        pills.append(f'<span class="tag {cls}">{sign}{esc(t)}</span>')
    n_add = len(set(new) - set(old))
    n_rem = len(set(old) - set(new))
    summary = ', '.join(x for x in [f'{n_add} added' if n_add else '', f'{n_rem} removed' if n_rem else ''] if x)
    return f'<div class="tags"><span class="tl">Tags</span><span class="sum">{summary}</span><div class="pills">{"".join(pills)}</div></div>'


def list_rows(revs, frm, to, compact=False):
    """The revision list rows, From/To picks and tag pills included."""
    out = []
    for r in revs:
        add, rem = tag_changes(r['comment'])
        pills = ''.join(f'<span class="tag add">+ {esc(t)}</span>' for t in add) + \
            ''.join(f'<span class="tag rem">− {esc(t)}</span>' for t in rem)
        comment = pills or esc(r['comment'])
        flags = ''.join(f'<span class="flag f-{f}" title="{esc(FLAG_TEXT.get(f, f))}">{f}</span>' for f in r['flags'])
        sel = ' sel' if to <= r['n'] <= to and True else ''
        inrange = ' in' if frm < r['n'] < to else ''
        picks = '' if compact else (
            f'<label class="pick" title="Compare from this revision"><input type="radio" name="from" value="{r["n"]}"{" checked" if r["n"] == frm else ""}><span>From</span></label>'
            f'<label class="pick" title="Compare to this revision"><input type="radio" name="to" value="{r["n"]}"{" checked" if r["n"] == to else ""}><span>To</span></label>')
        out.append(f'<div class="row{sel}{inrange}" data-flags="{r["flags"]}" data-n="{r["n"]}">'
                   f'{picks}<span class="num">{r["n"]}</span><span class="date">{when(r["at"])}</span>'
                   f'<span class="who">{esc(r["user"])}</span><span class="flags">{flags}</span>'
                   f'<span class="cmt">{comment}</span></div>')
    return ''.join(out)


def chips(revs, active=('all',)):
    """The type chips with their counts."""
    out = []
    for key, label, flag in TYPES:
        n = len(revs) if key == 'all' else sum(1 for r in revs if flag in r['flags'])
        on = key in active
        out.append(f'<button type="button" class="chip{" on" if on else ""}{" zero" if not n else ""}" data-type="{key}" data-flag="{flag}"'
                   f' aria-pressed="{str(on).lower()}"{" disabled" if not n else ""}>{label} <b>{n}</b></button>')
    return ''.join(out)


CSS = r"""
:root {
  /* Layout: a reading column of numbered proposals, each with a working replica of the window's History section. */
  --bg: #f4efe4; --win: #fbf8f1; --ink: #2b2622; --dim: #7a6d5c; --line: #d9cfbd; --soft: #ece4d4;
  --blue: #2f5f9e; --blue-bg: #eef2f8; --add: #dcefd5; --add-ink: #2f6b2a; --rem: #f3d2cc; --rem-ink: #9b2218;
  --chg: #fbf1c9; --hover: #f4eee2; --shadow: 0 18px 40px -22px rgba(43, 38, 34, .45);
  --f-read: Georgia, "Times New Roman", Times, serif;
  --f-ui: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
  --f-mono: ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #171513; --win: #1f1c19; --ink: #ece6da; --dim: #a99c88; --line: #3e372f; --soft: #2a2622;
  --blue: #8fb3e6; --blue-bg: #22303f; --add: #22402a; --add-ink: #a9d9a0; --rem: #4a2622; --rem-ink: #f0a59b;
  --chg: #433a1c; --hover: #2a2622; --shadow: 0 18px 40px -22px rgba(0, 0, 0, .8); color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #171513; --win: #1f1c19; --ink: #ece6da; --dim: #a99c88; --line: #3e372f; --soft: #2a2622;
  --blue: #8fb3e6; --blue-bg: #22303f; --add: #22402a; --add-ink: #a9d9a0; --rem: #4a2622; --rem-ink: #f0a59b;
  --chg: #433a1c; --hover: #2a2622; --shadow: 0 18px 40px -22px rgba(0, 0, 0, .8); color-scheme: dark; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { background: var(--bg); color: var(--ink); font: 15px/1.55 var(--f-read); margin: 0; }
.page { max-width: 1180px; margin: 0 auto; padding-block: 28px 64px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header.top { display: grid; gap: 6px; margin-bottom: 26px; }
.eyebrow { font: 600 11px var(--f-ui); letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
h1 { font: 700 30px/1.15 var(--f-read); margin: 0; text-wrap: balance; }
h2 { font: 700 21px/1.2 var(--f-read); margin: 0 0 4px; text-wrap: balance; }
h3 { font: 600 11px var(--f-ui); letter-spacing: .1em; text-transform: uppercase; color: var(--dim); margin: 18px 0 6px; }
p { margin: 0 0 10px; max-width: 72ch; }
.lede { font-size: 16.5px; max-width: 70ch; }
code, .mono { font-family: var(--f-mono); font-size: 12.5px; }
nav.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; font: 13px var(--f-ui); margin-top: 6px; }
nav.toc a { color: var(--blue); text-decoration: none; }
nav.toc a:hover { text-decoration: underline; }
section.mock { margin-top: 38px; display: grid; gap: 10px; }
.num-tag { font: 700 12px var(--f-mono); color: var(--blue); }
.two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
@media (max-width: 860px) { .two { grid-template-columns: minmax(0, 1fr); } }
.note { font: 13px/1.5 var(--f-ui); color: var(--dim); max-width: 80ch; }
.note b { color: var(--ink); }
.rec { display: inline-block; font: 600 10px var(--f-ui); letter-spacing: .08em; text-transform: uppercase; color: var(--add-ink); border: 1px solid currentColor; border-radius: 999px; padding: 0 7px; margin-left: 6px; vertical-align: 2px; }

/* The window replica */
.win { background: var(--win); border: 1px solid var(--line); border-radius: 6px; box-shadow: var(--shadow); overflow: hidden; min-width: 0; }
.win .bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--line); font: 600 13px var(--f-ui); }
.win .bar .sp { flex: 1; }
.win .bar .btn { font: 600 11.5px var(--f-ui); border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; color: var(--ink); background: var(--win); }
.win .bar .btn.on { background: var(--ink); color: var(--win); border-color: var(--ink); }
.win .body { padding: 12px 14px 16px; min-width: 0; }
.sec-h { font: 600 11px var(--f-ui); letter-spacing: .1em; text-transform: uppercase; color: var(--dim); margin: 2px 0 6px; }
.sec-h::before { content: "▼ "; }
.meta { display: flex; flex-wrap: wrap; gap: 2px 14px; font: 12.5px var(--f-ui); color: var(--dim); margin-bottom: 8px; }
.meta b { color: var(--ink); font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 0 0 8px; }
.chip { font: 600 11px var(--f-ui); letter-spacing: .04em; border: 1px solid var(--line); background: var(--win); color: var(--ink); border-radius: 999px; padding: 3px 10px; cursor: pointer; }
.chip b { font-weight: 700; color: var(--dim); margin-left: 2px; font-variant-numeric: tabular-nums; }
.chip.on { background: var(--ink); color: var(--win); border-color: var(--ink); }
.chip.on b { color: var(--win); opacity: .75; }
.chip.zero { opacity: .45; cursor: default; }
.chip:focus-visible, .pick input:focus-visible + span, .row:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.list { max-height: 330px; overflow: auto; border-top: 1px solid var(--soft); }
.row { display: grid; grid-template-columns: auto auto 2.2em 8.6em minmax(0, 9.5em) auto minmax(0, 1fr); gap: 2px 8px; align-items: center;
  padding: 4px 6px; border-bottom: 1px dotted var(--line); font: 12.5px/1.4 var(--f-ui); }
.row.compact { grid-template-columns: 2.2em 8.6em minmax(0, 9.5em) auto minmax(0, 1fr); }
.row:hover { background: var(--hover); }
.row.in { background: color-mix(in srgb, var(--blue-bg) 55%, transparent); }
.row.sel, .row.from { background: var(--blue-bg); box-shadow: inset 3px 0 0 var(--blue); }
.row[hidden] { display: none; }
.num { font: 600 12px var(--f-mono); color: var(--blue); text-align: right; }
.date { font: 12px var(--f-mono); color: var(--dim); font-variant-numeric: tabular-nums; }
.who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flags { display: inline-flex; gap: 2px; }
.flag { font: 600 10px/1.6 var(--f-ui); border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; color: var(--blue); }
.f-A, .f-M { color: var(--dim); } .f-N { color: var(--add-ink); }
.cmt { color: var(--ink); min-width: 0; display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.pick { display: inline-flex; align-items: center; gap: 2px; font: 600 9.5px var(--f-ui); letter-spacing: .05em; text-transform: uppercase; color: var(--dim); cursor: pointer; }
.pick input { margin: 0; accent-color: var(--blue); }
.tag { font: 11.5px var(--f-mono); border: 1px solid var(--line); border-radius: 3px; padding: 0 5px; background: var(--win); color: var(--dim); white-space: nowrap; }
.tag.add { background: var(--add); color: var(--add-ink); border-color: transparent; }
.tag.rem { background: var(--rem); color: var(--rem-ink); border-color: transparent; text-decoration: line-through; }
.more { font: 12px var(--f-ui); color: var(--dim); padding: 7px 2px 2px; }
.pane { margin-top: 12px; display: grid; gap: 8px; }
.ph { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font: 13px var(--f-ui); }
.ph b { font-family: var(--f-read); font-size: 14.5px; }
.seg { display: inline-flex; }
.seg span { font: 600 10.5px var(--f-ui); letter-spacing: .05em; text-transform: uppercase; border: 1px solid var(--line); padding: 1px 7px; }
.seg span + span { border-left: 0; }
.seg span:first-child { border-radius: 3px 0 0 3px; } .seg span:last-child { border-radius: 0 3px 3px 0; }
.seg span.on { background: var(--ink); color: var(--win); border-color: var(--ink); }
.cmp { display: grid; grid-template-columns: max-content minmax(0, 1fr) minmax(0, 1fr); border: 1px solid var(--line); border-radius: 3px; font: 12.5px var(--f-ui); }
.cmp > div { padding: 4px 9px; border-bottom: 1px solid var(--soft); min-width: 0; }
.cmp > .k { color: var(--dim); font-style: italic; font-family: var(--f-read); }
.cmp > .h { font: 600 10.5px var(--f-ui); letter-spacing: .07em; text-transform: uppercase; color: var(--dim); }
.tags { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 10px; align-items: baseline; border: 1px solid var(--line); border-radius: 3px; padding: 7px 9px; }
.tags .tl { font: 600 10.5px var(--f-ui); letter-spacing: .07em; text-transform: uppercase; color: var(--dim); }
.tags .sum { font: 12.5px var(--f-ui); }
.tags .pills { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
.tags .dim, .dim { color: var(--dim); font: 12.5px var(--f-ui); }
.diff { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); border: 1px solid var(--line); border-radius: 3px; overflow: hidden; }
.diff > div { padding: 1px 8px; min-width: 0; overflow-wrap: anywhere; }
.diff > .n { border-left: 1px solid var(--line); }
.diff > .dh { font: 600 10.5px var(--f-ui); letter-spacing: .07em; text-transform: uppercase; color: var(--dim); padding: 5px 8px; border-bottom: 1px solid var(--line); }
.diff > .fold { grid-column: 1 / -1; text-align: center; font: 11px var(--f-ui); color: var(--dim); background: var(--soft); padding: 2px; }
.diff .l { font: 12px/1.45 var(--f-mono); white-space: pre-wrap; }
.diff .ln { display: inline-block; min-width: 2.6em; margin-right: 6px; color: var(--dim); opacity: .7; text-align: right; user-select: none; }
.diff .rem { background: var(--rem); } .diff .add { background: var(--add); } .diff .chg { background: var(--chg); }
.w-rem { background: var(--rem); color: var(--rem-ink); text-decoration: line-through; }
.w-add { background: var(--add); color: var(--add-ink); }
.legend { display: flex; gap: 10px; font: 11px var(--f-ui); color: var(--dim); }
.legend span { padding: 0 6px; border-radius: 2px; }
.legend .a { background: var(--add); } .legend .r { background: var(--rem); text-decoration: line-through; } .legend .c { background: var(--chg); }
.costs { width: 100%; border-collapse: collapse; font: 13px var(--f-ui); }
.costs th, .costs td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
.costs th { font: 600 10.5px var(--f-ui); letter-spacing: .07em; text-transform: uppercase; color: var(--dim); }
.costs td.c { font-variant-numeric: tabular-nums; white-space: nowrap; }
.tblwrap { overflow-x: auto; }
.phone { width: 380px; max-width: 100%; }
.phone .row { grid-template-columns: auto auto 2.2em minmax(0, 1fr) auto; }
.phone .row .who { display: none; } .phone .row .cmt { grid-column: 3 / -1; }
.phone .row .cmt:empty { display: none; }
.phone .diff { grid-template-columns: minmax(0, 1fr); }
.phone .diff > .n { border-left: 0; border-top: 1px dashed var(--line); }
.qs { counter-reset: q; display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.qs li { counter-increment: q; display: grid; grid-template-columns: 2em minmax(0, 1fr); gap: 2px 8px; }
.qs li::before { content: "Q" counter(q); font: 700 12px var(--f-mono); color: var(--blue); padding-top: 3px; }
.qs li > div { min-width: 0; }
.qs .opts { font: 13px var(--f-ui); color: var(--dim); }
.qs .opts b { color: var(--ink); }
.map { width: 100%; border-collapse: collapse; font: 12.5px var(--f-ui); }
.map td, .map th { padding: 4px 8px; border-bottom: 1px solid var(--soft); text-align: left; }
.map th { font: 600 10.5px var(--f-ui); letter-spacing: .07em; text-transform: uppercase; color: var(--dim); }
@media (prefers-reduced-motion: no-preference) { .row, .chip { transition: background-color .12s; } }
@media (max-width: 640px) {
  .row { grid-template-columns: auto auto 2.2em minmax(0, 1fr) auto; }
  .row .who { display: none; } .row .cmt { grid-column: 3 / -1; } .row .cmt:empty { display: none; }
  .row.compact { grid-template-columns: 2.2em minmax(0, 1fr) auto; } .row.compact .cmt { grid-column: 1 / -1; }
  .diff { grid-template-columns: minmax(0, 1fr); } .diff > .n { border-left: 0; border-top: 1px dashed var(--line); }
}
"""

JS = r"""
(function () {
  const wins = document.querySelectorAll('[data-live]');
  wins.forEach((win) => {
    const rows = Array.from(win.querySelectorAll('.list .row'));
    const chips = Array.from(win.querySelectorAll('.chip'));
    const shown = win.querySelector('[data-shown]');
    const apply = () => {
      const on = chips.filter(c => c.classList.contains('on')).map(c => c.dataset.type);
      const flags = chips.filter(c => c.classList.contains('on') && c.dataset.flag).map(c => c.dataset.flag);
      let n = 0;
      rows.forEach((r) => {
        const show = on.includes('all') || flags.some(f => r.dataset.flags.includes(f));
        r.hidden = !show;
        if (show) n++;
      });
      if (shown) shown.textContent = String(n);
    };
    chips.forEach((c) => c.addEventListener('click', () => {
      if (c.disabled) return;
      if (c.dataset.type === 'all') chips.forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', String(x === c)); });
      else {
        c.classList.toggle('on');
        c.setAttribute('aria-pressed', String(c.classList.contains('on')));
        const any = chips.some(x => x.dataset.type !== 'all' && x.classList.contains('on'));
        const all = chips.find(x => x.dataset.type === 'all');
        all.classList.toggle('on', !any);
        all.setAttribute('aria-pressed', String(!any));
      }
      apply();
    }));
    const pane = (from, to) => {
      const key = `${Math.min(from, to)}-${Math.max(from, to)}`;
      win.querySelectorAll('[data-pair]').forEach(p => { p.hidden = p.dataset.pair !== key; });
      const none = win.querySelector('[data-pair-none]');
      if (none) {
        none.hidden = !!win.querySelector(`[data-pair="${key}"]`);
        none.querySelector('[data-pick]').textContent = `${Math.min(from, to)} → ${Math.max(from, to)}`;
      }
      rows.forEach((r) => {
        const n = +r.dataset.n;
        r.classList.toggle('sel', n === Math.max(from, to));
        r.classList.toggle('from', n === Math.min(from, to));
        r.classList.toggle('in', n > Math.min(from, to) && n < Math.max(from, to));
      });
    };
    const picks = () => {
      const f = win.querySelector('input[name$="from"]:checked');
      const t = win.querySelector('input[name$="to"]:checked');
      if (f && t) pane(+f.value, +t.value);
    };
    win.querySelectorAll('.pick input').forEach(i => i.addEventListener('change', picks));
    rows.forEach((r) => r.addEventListener('click', (e) => {
      if (e.target.closest('.pick')) return;
      const n = +r.dataset.n;
      if (n === 0) return;
      const f = win.querySelector(`input[name$="from"][value="${n - 1}"]`);
      const t = win.querySelector(`input[name$="to"][value="${n}"]`);
      if (f) f.checked = true;
      if (t) t.checked = true;
      picks();
    }));
    picks();
    apply();
  });
})();
"""


def window(revs, data, uid, frm, to, title='Streets Of Minneapolis'):
    """A working replica of the window's History section."""
    far, tg = data['pairs']['far'], data['pairs']['tags']
    rows = diff_rows(far['oldLines'], far['newLines'])
    changed = sum(1 for r in rows if r[0] != 'same')
    editors_far = sorted({r['user'] for r in revs if far['old'] < r['n'] <= far['new']})
    by_n = {r['n']: r for r in revs}

    def cmp_table(c):
        out = ['<div class="cmp"><div class="h"></div>' + ''.join(f'<div class="h">{esc(x)}</div>' for x in c[0][1:])]
        for r in c[1:]:
            if r[0].startswith('Tags'):
                continue
            out.append(f'<div class="k">{esc(r[0])}</div>' + ''.join(f'<div>{esc(x)}</div>' for x in r[1:]))
        return ''.join(out) + '</div>'

    seg = '<span class="seg"><span class="on">Only what changed</span><span>Everything</span></span>'
    pane_far = (f'<div class="pane" data-pair="{far["old"]}-{far["new"]}"><div class="ph"><b>Revision {far["old"]} → {far["new"]}</b>'
                f'<span class="dim">{far["new"] - far["old"]} revisions apart · {len(editors_far)} editor{"s" if len(editors_far) != 1 else ""} · '
                f'{when(by_n[far["old"]]["at"])} → {when(by_n[far["new"]]["at"])}</span>{seg}</div>'
                + tag_strip(far['compare'])
                + f'<div class="dim"><b>{changed}</b> lines differ in the source</div>'
                + diff_html(rows, f'Revision {far["old"]}', f'Revision {far["new"]}')
                + '<div class="legend"><span class="r">removed</span><span class="c">changed</span><span class="a">added</span></div></div>')
    pane_tags = (f'<div class="pane" data-pair="{tg["old"]}-{tg["new"]}" hidden><div class="ph"><b>Revision {tg["new"]} · against {tg["old"]}</b>'
                 f'<span class="dim">{when(by_n[tg["new"]]["at"])} · {esc(by_n[tg["new"]]["user"])}</span></div>'
                 + tag_strip(tg['compare'])
                 + '<div class="tags"><span class="tl">Source</span><span class="sum">identical — the wiki says so in the same answer, so no source is read</span></div></div>')
    none = ('<div class="pane" data-pair-none hidden><div class="ph"><b>Revision <span data-pick></span></b></div>'
            '<div class="dim">The real window reads this pair now (one request, plus the two sources if they differ). '
            f'The mockup carries two pairs: {far["old"]} → {far["new"]} and {tg["old"]} → {tg["new"]}.</div></div>')
    return (f'<div class="win" data-live id="{uid}"><div class="bar">Detail page · {esc(title)}<span class="sp"></span>'
            '<span class="btn">✎ Editing history</span><span class="btn on">Extracted</span><span class="btn">Live page</span></div>'
            f'<div class="body"><div class="sec-h">History ({len(revs)})</div>'
            f'<div class="meta"><span><b>{len(revs)}</b> revisions, all read (one request, 100 a page)</span>'
            f'<span>last <b>{when(revs[0]["at"])}</b> by {esc(revs[0]["user"])}</span><span><b data-shown>{len(revs)}</b> shown</span></div>'
            f'<div class="chips">{chips(revs)}</div>'
            f'<div class="list">{list_rows_named(revs, frm, to, uid)}</div>'
            f'{pane_far}{pane_tags}{none}</div></div>')


def list_rows_named(revs, frm, to, uid):
    """list_rows() with radio names unique to one window."""
    return list_rows(revs, frm, to).replace('name="from"', f'name="{uid}-from"').replace('name="to"', f'name="{uid}-to"')


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'debug', 'bb-history-mockup-data.json')
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'debug', 'bb-history-r2-mockups.html')
    data = json.load(open(src, encoding='utf-8'))
    revs = data['revs']
    far, tg = data['pairs']['far'], data['pairs']['tags']
    counts = {k: (len(revs) if k == 'all' else sum(1 for r in revs if f in r['flags'])) for k, _, f in TYPES}
    tags_rows = [r for r in revs if 'A' in r['flags']]
    win_a = window(revs, data, 'wa', far['old'], far['new'])
    win_phone = window(revs, data, 'wp', far['old'], far['new'])

    chip_static = lambda active: f'<div class="chips">{chips(revs, active)}</div>'
    tags_list = ''.join(list_rows([r], -1, -1, compact=True).replace('class="row', 'class="row compact', 1) for r in tags_rows)
    mapping = ''.join(f'<tr><td><span class="chip{" on" if k == "all" else ""}">{lbl} <b>{counts[k]}</b></span></td>'
                      f'<td class="mono">rev-type-{k}</td><td class="mono">{f or "—"}</td><td>{esc(FLAG_TEXT.get(f, "every revision"))}</td></tr>'
                      for k, lbl, f in TYPES)

    page = f"""<title>BB History Round 2</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>{CSS}</style>
<div class="page">
<header class="top">
  <div class="eyebrow">Brucebase · the window's History section · round 2 · mockups</div>
  <h1>Filter by kind, see the tags change, compare any two revisions</h1>
  <p class="lede">Three additions to the History section, shown on the real history of
  <span class="mono">song:streets-of-minneapolis</span>: {len(revs)} revisions by {len({r['user'] for r in revs})} members,
  read signed out on {datetime.now(BERLIN):%Y-%m-%d}. Everything below comes from Wikidot's own answers; the window in A works —
  the chips filter, From / To pick a pair, a row click compares it with the one before.</p>
  <nav class="toc"><a href="#a">A · the window</a><a href="#b">B · kinds of change</a><a href="#c">C · tag changes</a>
  <a href="#d">D · any two revisions</a><a href="#e">E · what it asks the wiki</a><a href="#f">F · narrow</a><a href="#q">Questions</a></nav>
</header>

<section class="mock" id="a">
  <div><span class="num-tag">A</span> <h2 style="display:inline">The window, all three together</h2></div>
  <p class="note">Open on <b>{far['old']} → {far['new']}</b>, the pair from your screenshot. Pick <b>From {tg['old']}</b> and <b>To {tg['new']}</b>
  (or click row {tg['new']}) for a revision that changed only tags. Try the chips: <b>Tags</b> leaves {counts['tags']} rows.</p>
  {win_a}
</section>

<section class="mock" id="b">
  <div><span class="num-tag">B</span> <h2 style="display:inline">Kinds of change, as chips</h2></div>
  <p>Your checkboxes, as one row of chips with their counts. <b>All</b> is on by default; picking a kind turns All off,
  and several kinds can be on at once (a revision shows when it has any of them, as the wiki's checkboxes do). A kind
  with no revision is greyed out.</p>
  <div class="two">
    <div class="win"><div class="body"><h3>Default</h3>{chip_static(('all',))}<h3>Tags and Metadata picked</h3>{chip_static(('tags', 'meta'))}</div></div>
    <div class="tblwrap"><table class="map"><thead><tr><th>Chip</th><th>Wikidot checkbox</th><th>Flag</th><th>Meaning</th></tr></thead><tbody>{mapping}</tbody></table></div>
  </div>
  <p class="note"><b>How it is read.</b> The probe of {datetime.now(BERLIN):%Y-%m-%d} asked the wiki once per checkbox: All {counts['all']}, Source {counts['source']},
  Tags {counts['tags']}, Metadata {counts['meta']}, Title, Page name and Files 0 — the wiki filters on the server, and its counts are the
  flags' counts. The proposal reads the list <b>100 a page</b> (the probe got all {len(revs)} in one answer, 0.6 s) and filters the rows it
  has by their flags, so a chip costs nothing and its count is exact. Only a page with more than 100 revisions would show
  "{len(revs)} of N read" and offer the next page.</p>
</section>

<section class="mock" id="c">
  <div><span class="num-tag">C</span> <h2 style="display:inline">Tag changes</h2></div>
  <p>Two places, two sources. <b>In the list</b>, a tags-only revision's comment ("Added tags: tour_lohadnk.") becomes pills — no
  request. <b>In the comparison</b>, the wiki's compare answer (<span class="mono">table.page-compare</span>, your screenshot) holds
  both revisions' tags; the pane shows them as one strip, the added marked +, the removed struck. The same answer says when the
  sources are identical, so a tags-only revision costs one request instead of three.</p>
  <div class="two">
    <div class="win"><div class="body"><h3>In the list · every tags revision of this page</h3><div class="list" style="max-height:none">{tags_list}</div></div></div>
    <div class="win"><div class="body"><h3>In the comparison · {tg['old']} → {tg['new']}</h3>{tag_strip(tg['compare'])}
      <h3>{far['old']} → {far['new']} · two tags added across 15 revisions</h3>{tag_strip(far['compare'])}
      <h3>When nothing changed</h3><div class="tags"><span class="tl">Tags</span><span class="dim">the same in both</span></div></div></div>
  </div>
  <p class="note">The compare answer also carries "Created on" for both sides. It probably has rows for a changed title or page name
  too (Wikidot's own compare view lists them) — none of this song's revisions changed either, so that is one more probe on a page
  that has a T or R revision before building.</p>
</section>

<section class="mock" id="d">
  <div><span class="num-tag">D</span> <h2 style="display:inline">Any two revisions</h2></div>
  <div class="two">
    <div>
      <h3>Proposal: From / To on every row <span class="rec">recommended</span></h3>
      <p>Two small pickers per row, as the wiki's two radio columns. A click on a row's text keeps today's shortcut: that revision
      against the one before (both pickers move). Picking only From or only To changes that side. The rows between the two are
      tinted, so the span is visible; the pane's heading says how many revisions apart and how many members edited in between.
      The older is always on the left, whatever order you picked them in.</p>
    </div>
    <div>
      <h3>Alternative: Shift+click a second row</h3>
      <p>No pickers: a click compares with the one before, Shift+click on another row compares the two. Cleaner rows, but invisible
      until you know it, and impossible on a touch screen.</p>
    </div>
  </div>
  <p class="note"><b>Cost.</b> A pair is one compare request (tags, dates, whether the sources differ) plus the two sources when they
  do — each source is read once and kept, so stepping through neighbours mostly reads one new source per step. Long spans fold
  the unchanged lines as now; {far['old']} → {far['new']} changes {sum(1 for r in diff_rows(far['oldLines'], far['newLines']) if r[0] != 'same')} of {len(far['newLines'])} lines.</p>
</section>

<section class="mock" id="e">
  <div><span class="num-tag">E</span> <h2 style="display:inline">What each act asks the wiki</h2></div>
  <div class="tblwrap"><table class="costs"><thead><tr><th>Act</th><th>Today</th><th>Proposed</th><th>Why</th></tr></thead><tbody>
    <tr><td>Open the section</td><td class="c">1 list (20) + 2 sources</td><td class="c">1 list (100) + 1 compare + 0–2 sources</td><td>all of a normal page's revisions at once; the compare answer brings the tags</td></tr>
    <tr><td>A chip</td><td class="c">—</td><td class="c">0</td><td>filters the rows read, by flag</td></tr>
    <tr><td>A row (against the one before)</td><td class="c">0–2 sources</td><td class="c">1 compare + 0–2 sources</td><td>sources already read are reused; identical sources need none</td></tr>
    <tr><td>From / To, any pair</td><td class="c">—</td><td class="c">1 compare + 0–2 sources</td><td>the same answer for any two revisions</td></tr>
    <tr><td>A tags-only revision</td><td class="c">2 sources</td><td class="c">1 compare</td><td>the compare answer says "Page sources are identical"</td></tr>
  </tbody></table></div>
  <p class="note">Still one request a second, still only after the section is opened, still memory only for the page's life
  (a revision never changes, so its compare and source answers are kept by revision ids).</p>
</section>

<section class="mock" id="f">
  <div><span class="num-tag">F</span> <h2 style="display:inline">Narrow window</h2></div>
  <p class="note">On a phone the pickers stay first in the row; who edited folds under the date; OLD and NEW stack.</p>
  <div class="phone">{win_phone}</div>
</section>

<section class="mock" id="q">
  <h2>Questions</h2>
  <ol class="qs">
    <li><div><b>Kinds: filter the rows read (100 a page) or ask the wiki per chip?</b>
      <div class="opts"><b>Rows read, by flag</b> <span class="rec">recommended</span> — instant, exact counts on every chip · or Wikidot's filter, one request per chip, counts only after a click.</div></div></li>
    <li><div><b>Chips: several at once, or one at a time?</b>
      <div class="opts"><b>Several</b>, like the checkboxes <span class="rec">recommended</span> · or one kind at a time.</div></div></li>
    <li><div><b>Tags in the list: pills from the comment?</b>
      <div class="opts"><b>Yes</b> <span class="rec">recommended</span>, the comment's text on hover · or the comment as written.</div></div></li>
    <li><div><b>The Tags strip in the pane: always, or only when the tags differ?</b>
      <div class="opts"><b>Always</b> <span class="rec">recommended</span> ("the same in both" when they do) · or only when they differ.</div></div></li>
    <li><div><b>Any two revisions: From / To pickers, or Shift+click?</b>
      <div class="opts"><b>From / To</b> <span class="rec">recommended</span> (works on touch) · or Shift+click.</div></div></li>
    <li><div><b>Order of the two sides when picked "backwards" (From 43, To 28, as in your screenshot)?</b>
      <div class="opts"><b>Older left, always</b> <span class="rec">recommended</span> · or as picked, like the wiki.</div></div></li>
  </ol>
  <p class="note">Answer in chat, for example "1 rec, 2 rec, 3 rec, 4 only when different, 5 rec, 6 rec".</p>
</section>
</div>
<script>{JS}</script>
"""
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    print('wrote', out, len(page), 'bytes')


if __name__ == '__main__':
    main()
