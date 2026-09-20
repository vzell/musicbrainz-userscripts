#!/usr/bin/env python3
"""Replace PERFORMANCE.org's ~:NNNNN~ line references with grep anchors.

WHY THEY GO RATHER THAN GET REFRESHED. CLAUDE.md's File-structure table hit
exactly this and was converted to grep anchors, because "a previous version of
this table had 21 of 23 rows wrong, several by more than 6,000 lines, which is
worse than having no table at all". A survey on 2026-09-20 found every one of
the 118 tokens in this file pointing at unrelated code. And the file had
already reached the same conclusion once on its own, for one paragraph of Step
30: "the line refs this paragraph used to carry ... were already ~600 lines
stale before they were removed." This generalises that decision.

WHAT IT DOES NOT DO. It never invents an anchor. Where the number was the only
pointer and the target cannot be recovered, the sentence is rewritten to stand
without it rather than given a guessed symbol — a wrong anchor is the same
defect in new clothes.

Idempotent by construction: every edit asserts its `old` text occurs EXACTLY
once, so a second run fails loudly instead of corrupting the file.

    python3 scripts/strip-perf-line-refs.py            # dry run
    python3 scripts/strip-perf-line-refs.py --apply
"""

import io
import re
import sys

ORG = 'PERFORMANCE.org'

# ── (old, new) prose edits ──────────────────────────────────────────────────
EDITS = []


def e(old, new):
    EDITS.append((old, new))


e("""*Line references* (~:12345~) are only valid for the script version named
alongside them. Re-grep the symbol rather than trusting a number that looks
stale — the userscript is ~77 000 lines and they drift constantly.""",
  """*No line references.* This file names symbols; it does not carry ~:NNNNN~
line numbers. It used to carry 118 of them and *every single one was stale* when
they were removed on 2026-09-20 — each pointing at unrelated code, several by
thousands of lines, against a userscript that has since grown past 82 000
lines. That is the conclusion CLAUDE.md's File-structure table reached for the
same reason ("worse than having no table at all"), and the one Step 30's own
paragraph reached by itself a few refs at a time. Grep the symbol.
~scripts/audit-docs.py~ fails if a line reference reappears.""")

e("- ~runFilter()~ (~:42225~) still clones every matching row and fully rebuilds",
  "- ~runFilter()~ still clones every matching row and fully rebuilds")

e("""  since Step 18 touches only the sub-table it re-ordered: ~runFilter()~
  (~:42450~) pushes an empty ~_mbSkipRender~ group for every undisturbed
  index and ~renderGroupedTable()~ (~:49379~) leaves those ~<tbody>~ elements""",
  """  since Step 18 touches only the sub-table it re-ordered: ~runFilter()~
  pushes an empty ~_mbSkipRender~ group for every undisturbed index and
  ~renderGroupedTable()~ leaves those ~<tbody>~ elements""")

e("The file's own comments (~:56886-56888~, ~:57587~) document that this",
  "The file's own comments document that this")

e("the root. ~:56694~ puts the same cost concretely for the harness page:",
  "the root. One of them puts the same cost concretely for the harness page:")

e("""It runs at the tail of ~initCollapsableColumns()~ (~:56878~), reached from
~_scheduleColHeaderCounts()~ (~:56650~), which today fires from:""",
  """It runs at the tail of ~initCollapsableColumns()~, reached from
~_scheduleColHeaderCounts()~, which today fires from:""")

e("~_adaptiveFilterDelay()~ (~:43210~) — a 300 ms floor from",
  "~_adaptiveFilterDelay()~ — a 300 ms floor from")

e("With ~M~ = matching rows and ~C~ = columns, ~runFilter()~ (~:42388-43190~) does:",
  "With ~M~ = matching rows and ~C~ = columns, ~runFilter()~ does:")

e("(~_rowTextCache~, ~:35148~) already extracted and has sitting in a ~WeakMap~.",
  "(~_rowTextCache~) already extracted and has sitting in a ~WeakMap~.")

e("~initBarcodeHighlight~ (three more O(M) walks, ~:42326-42341~);",
  "~initBarcodeHighlight~ (three more O(M) walks);")

e("an unconditional ~window.scrollTo()~ forced reflow (~:43011~).",
  "an unconditional ~window.scrollTo()~ forced reflow.")

e("""drops ~_colHeaderCountsCache~. ~runFilter~ calls it every pass (~:42748~ multi,
~:42946~ single); ~sa_enable_picard_tagger~ defaults *true* and the only guard""",
  """drops ~_colHeaderCountsCache~. ~runFilter~ calls it every pass, in both
branches; ~sa_enable_picard_tagger~ defaults *true* and the only guard""")

e("""whatever filter happens to be active" (~:32874-32876~), but ~runFilter~ REMOVES""",
  """whatever filter happens to be active", but ~runFilter~ REMOVES""")

e("""~mb-global-summary-container~ (~:32629~, asserted by
~tests/fixtures/filter-bar-containers.spec.js~), so the early-out at ~:32919~
never fires and the walk always runs, on every pageType.""",
  """~mb-global-summary-container~ (asserted by
~tests/fixtures/filter-bar-containers.spec.js~), so its early-out
never fires and the walk always runs, on every pageType.""")

e("into one layout flush per column (~:57752-57757~), and",
  "into one layout flush per column, and")

e("~_useIO~ (~:63104~) checks ~allRows.length~, which is always 0 in",
  "~_useIO~ checks ~allRows.length~, which is always 0 in")

e("— ~_artSetInlineSortKey()~ (~:63570~), called from ~8 CAA/EAA",
  "— ~_artSetInlineSortKey()~, called from ~8 CAA/EAA")

e("the animation-frame-batching fix under Step 5, ~:61449-61470~) references",
  "the animation-frame-batching fix under Step 5) references")

e("the file — the real queue is ~_caaQueue~ (~:58083~), which every other call",
  "the file — the real queue is ~_caaQueue~, which every other call")

e("branch (~:37125-37145~) explicitly hides a cdtoc tracklist sub-row when its",
  "branch explicitly hides a cdtoc tracklist sub-row when its")

e("three-tier cache, ~_artFetchCachedImage()~ (~:58705~ before this change) —",
  "three-tier cache, ~_artFetchCachedImage()~ (as it stood before this change) —")

e("""release-group bigbox strip (~_artInitBigPics~ → ~_loadBigImgIdb~, ~:62282~
before this change) fetches the identical front-thumbnail URL too (its""",
  """release-group bigbox strip (~_artInitBigPics~ → ~_loadBigImgIdb~, as it
stood before this change) fetches the identical front-thumbnail URL too (its""")

e("""  (~:26247-26277~, the "Measure ALL data rows — no sampling" loop): clones""",
  """  (the "Measure ALL data rows — no sampling" loop): clones""")

e("""- *Safe, confirmed* — ~applyStickyColumn~'s per-row loop
  (~:16036-16111~): reads ~getComputedStyle(cell).backgroundColor~ only""",
  """- *Safe, confirmed* — ~applyStickyColumn~'s per-row loop reads
  ~getComputedStyle(cell).backgroundColor~ only""")

e("  (~:15970-15972~) is hardcoded to return ~0~, no geometry read at all.",
  "  is hardcoded to return ~0~, no geometry read at all.")

e("""- *Safe, confirmed* — ~_findCellListItems~ (~:16897~),
  ~_classifyCollapseCell~ (~:17419~), ~initBarcodeHighlight~ (~:64011~),
  ~_cdtocInitTracklistToggles~ (~:50256~): none read""",
  """- *Safe, confirmed* — ~_findCellListItems~,
  ~_classifyCollapseCell~, ~initBarcodeHighlight~,
  ~_cdtocInitTracklistToggles~: none read""")

e("""  site (~getBoundingClientRect~ on hover targets, e.g. ~:53454~, ~:59054~,
  ~:60981~, ~:62578~): these only run on ~mouseenter~ of an element the""",
  """  site (~getBoundingClientRect~ on hover targets — four of them when this was
  written): these only run on ~mouseenter~ of an element the""")

e("""- ~_CLEAN_STRIP_SEL~ (~:38143~) contains ~'.mb-caa-sort-key,.mb-eaa-sort-key,'~
  (~:38166~) and ~'.mb-inline-art-sort-key,'~ (~:38155~) — plus ~.caa-icon~,""",
  """- ~_CLEAN_STRIP_SEL~ contains ~'.mb-caa-sort-key,.mb-eaa-sort-key,'~
  and ~'.mb-inline-art-sort-key,'~ — plus ~.caa-icon~,""")

e("""- ~getCleanVisibleText()~ (~:38082~) removes all of it by clone-and-remove
  *before* its TreeWalker runs, with a ~FILTER_REJECT~ belt-and-braces at
  ~:38108~.
- ~createSortComparator()~ (~:18563~, values at ~:18565-18566~) and
  ~createMultiColumnComparator()~ (~:18598~, ~:18604-18605~) read *only*
  ~getCleanVisibleText()~. ~_sortColumnKind()~ (~:16552~) has no CAA/EAA""",
  """- ~getCleanVisibleText()~ removes all of it by clone-and-remove
  *before* its TreeWalker runs, with a ~FILTER_REJECT~ belt-and-braces in the
  walker's own filter.
- ~createSortComparator()~ and
  ~createMultiColumnComparator()~ read *only*
  ~getCleanVisibleText()~. ~_sortColumnKind()~ has no CAA/EAA""")

e("explicit bypass in ~testRowMatch()~ (~:41738-41749~) — exact-match test",
  "explicit bypass in ~testRowMatch()~ — exact-match test")

e("""   its ~'yes'~/~'no'~ text — exactly as ~:41749~ already does for filtering.""",
  """   its ~'yes'~/~'no'~ text — exactly as ~testRowMatch()~'s own bypass already
   does for filtering.""")

e("""   - ~:3609-3617~ (and the inner ~appendSortKey~ block) — the ~"no" < "yes"~""",
  """   - the ~caa~ extractor's JSDoc (and the inner ~appendSortKey~ block) — the ~"no" < "yes"~""")

e("""   - ~:56576~ — describes Step 3 as "not part of this branch", written when""",
  """   - the comment describing Step 3 as "not part of this branch", written when""")

e("Point 3's third item (~:56576~) was narrower than filed: Step 3 was still",
  "Point 3's third item was narrower than filed: Step 3 was still")

e("""Two problems in one function (~:32881-32901~), reached from
~updateFilterButtonsVisibility()~ → ~_updateLiveDateFlagButtons()~ (~:33509~)""",
  """Two problems in one function, reached from
~updateFilterButtonsVisibility()~ → ~_updateLiveDateFlagButtons()~""")

e("""~runFilter~ calls ~updateFilterButtonsVisibility()~ unconditionally at ~:43187~,
and its tail (~:33509-33511~) runs three counters. Two of them —
~_countLengthMismatchRows~ (~:32991~) and ~_pendingEditsGroups~ /
~_countPendingEditRowsSingle~ (~:33146~/~:33164~) — deliberately walk the""",
  """~runFilter~ calls ~updateFilterButtonsVisibility()~ unconditionally,
and its tail runs three counters. Two of them —
~_countLengthMismatchRows~ and ~_pendingEditsGroups~ /
~_countPendingEditRowsSingle~ — deliberately walk the""")

e("~_invalidateFilterCache()~ already hooks, ~:44781~, ~:58524~, ~:63632~) and",
  "~_invalidateFilterCache()~ already hooks) and")

e("~_applyPostRenderRowPasses()~ (~:42326-42341~) is page-wide: four",
  "~_applyPostRenderRowPasses()~ is page-wide: four")

e("Fix: honour ~_renderDirtyGroupIdxs~ (~:42185~), which already exists and already",
  "Fix: honour ~_renderDirtyGroupIdxs~, which already exists and already")

e("~_scheduleColHeaderCounts()~ (~:57017~) already waits out any in-flight render,",
  "~_scheduleColHeaderCounts()~ already waits out any in-flight render,")

e("""key is the visible row set (~_colHeaderCountsRowSetSignature~, ~:56913~) with a
four-entry LRU (~:52519~), and every distinct query produces a distinct row set.""",
  """key is the visible row set (~_colHeaderCountsRowSetSignature~) with a
four-entry LRU, and every distinct query produces a distinct row set.""")

e("""~testRowMatch~ (~:41688~) runs twice per surviving row. The first call""",
  """~testRowMatch~ runs twice per surviving row. The first call""")

e("""(~:35148~). The second (~matchOnly=false~, on the clone — ~:42854~ single,
~:42662~ multi) re-derives all of it with fresh ~getCleanColumnText~ /""",
  """The second (~matchOnly=false~, on the clone, in both ~runFilter~
branches) re-derives all of it with fresh ~getCleanColumnText~ /""")

e("""  (~:38622~, dispatch at ~:38666-38669~) walks *every* ~<td>~ of the row, doing
  ~td.normalize()~ plus a full ~highlightCrossTag~ TreeWalk (~:38785~) on each.""",
  """  walks *every* ~<td>~ of the row, doing ~td.normalize()~ plus a full
  ~highlightCrossTag~ TreeWalk on each.""")

e("  every pass (~:43011~) forces a reflow whether or not the scroll position",
  "  every pass forces a reflow whether or not the scroll position")

e("- *~getCleanColumnText~ calls ~root.normalize()~ unconditionally* (~:38414~).",
  "- *~getCleanColumnText~ calls ~root.normalize()~ unconditionally*.")

e("""  ~element.querySelector('ul.mb-caa-art-ul')~* (~:38473~) — a full failing""",
  """  ~element.querySelector('ul.mb-caa-art-ul')~* — a full failing""")

e("""match set instead of rescanning ~allRows~ — ~_incrMatchSet~ and friends
(~:35122-35124~), gate at ~:42794-42812~, deliberately disabled for regexp and""",
  """match set instead of rescanning ~allRows~ — ~_incrMatchSet~ and friends,
gated inside ~runFilter~ and deliberately disabled for regexp and""")

e("""~_sourceRows.filter(r => testRowMatch(r, matchCtx, true))~ per group per pass
(~:42596~), with only ~_filterResultCache~ (50 entries, FIFO) between it and a""",
  """~_sourceRows.filter(r => testRowMatch(r, matchCtx, true))~ per group per
pass, with only ~_filterResultCache~ (50 entries, FIFO) between it and a""")

e("""(Grep the function name; the line refs this paragraph used to carry —
~:62582~, ~:62619-62620~, ~:62659~ — were already ~600 lines stale before they
were removed.)""",
  """(Grep the function name. The line refs this paragraph used to carry were
already ~600 lines stale before they were removed — which is the reason every
other one in this file followed them, on 2026-09-20.)""")

e("""The shape: ~runFilter~ calls it once per cell of every cloned row (~:42848~
single, ~:42656~ multi), and its body (~:60597~) runs about a dozen""",
  """The shape: ~runFilter~ calls it once per cell of every cloned row, in both
branches, and its body runs about a dozen""")

# The quoted comment is itself the anchor — verified present in the userscript,
# which is what makes it a better pointer than the number ever was.
e("""cheap" — see ~ShowAllEntityData.user.js~ around ~:25860~). Measured against""",
  """cheap" — grep that comment in ~ShowAllEntityData.user.js~). Measured against""")

e("1. ~_visibleRowSetSignature()~ (~:49412~) is documented as order-independent",
  "1. ~_visibleRowSetSignature()~ is documented as order-independent")

e("2. Step 5's lazy-load gate (~_useIO~, ~:63104~) computes",
  "2. Step 5's lazy-load gate (~_useIO~) computes")

e("3. ~initReleaseEventsColumn()~'s post-population re-init (~:53971~) calls",
  "3. ~initReleaseEventsColumn()~'s post-population re-init calls")

e("4. ~initRelationshipsColumn()~/~initPicardTaggerColumn()~ (~:54689~) never",
  "4. ~initRelationshipsColumn()~/~initPicardTaggerColumn()~ never")

e("5. ~_rowTextCache~ (~:30460~, filter-match text memoization) is never",
  "5. ~_rowTextCache~ (filter-match text memoization) is never")

e("   ~createMultiColumnComparator~, ~:15508~) calls ~getCleanVisibleText()~",
  "   ~createMultiColumnComparator~) calls ~getCleanVisibleText()~")

e("""   (~:7748~) runs one independent full-table DOM scan per "does any track""",
  """   runs one independent full-table DOM scan per "does any track""")

# ── the two tables whose line number occupies its own CELL ──────────────────
# Cell text only; the aligner below rebuilds the padding and the separator.
TABLE_CELL_EDITS = [
    ('~:42747~', None), ('~:49738~', None), ('~:50271~', None),
    ('~:19699~', None), ('~:61362~, ~:61377~', None), ('~:46421~', None),
    ('~:73505~', None),
    ('~:42814~ single, ~:42620~ multi', '~runFilter()~, both branches'),
    ('~:42854~ → ~:41688~, ~:38622~, ~:38785~',
     '~runFilter()~ → ~testRowMatch()~ → ~highlightText()~'),
    ('~:19262-19268~, via ~_applyPostRenderRowPasses~',
     'via ~_applyPostRenderRowPasses~'),
    ('~:32881~, via ~updateFilterButtonsVisibility~',
     'via ~updateFilterButtonsVisibility~'),
    ('~:57088~, via ~initCollapsableColumns~ ~:42910~',
     'via ~initCollapsableColumns~'),
    ('*yes* (~:38166~)', '*yes*'),
    ('*yes* (~:38155~)', '*yes*'),
    ('*broken* — JSDoc ~:3614~ still claims',
     "*broken* — the ~caa~ extractor's JSDoc still claims"),
    ('intact — JSDoc ~:3827~ correct', 'intact — its JSDoc correct'),
    ('intact — JSDoc ~:3525~ correct', 'intact — its JSDoc correct'),
]

TOKEN = re.compile(r'~:\d[\d-]*~')


def split_row(line):
    """Org table row -> list of cell strings (no padding)."""
    return [c.strip() for c in line.strip().strip('|').split('|')]


def is_sep(line):
    return bool(re.match(r'^\s*\|[-+]+\|\s*$', line))


def realign(block):
    """Re-pad an org table so every column lines up again."""
    rows, kinds = [], []
    for ln in block:
        if is_sep(ln):
            rows.append(None)
            kinds.append('sep')
        else:
            rows.append(split_row(ln))
            kinds.append('row')
    ncol = max(len(r) for r in rows if r)
    widths = [0] * ncol
    for r in rows:
        if not r:
            continue
        for i, c in enumerate(r):
            widths[i] = max(widths[i], len(c))
    out = []
    for r, k in zip(rows, kinds):
        if k == 'sep':
            out.append('|' + '+'.join('-' * (w + 2) for w in widths) + '|')
        else:
            cells = [(r[i] if i < len(r) else '').ljust(widths[i])
                     for i in range(ncol)]
            out.append('| ' + ' | '.join(cells) + ' |')
    return out


def drop_first_column(block):
    out = []
    for ln in block:
        if is_sep(ln):
            out.append(ln)
        else:
            out.append('| ' + ' | '.join(split_row(ln)[1:]) + ' |')
    return out


def main():
    apply = '--apply' in sys.argv
    text = io.open(ORG, encoding='utf-8').read()
    before = len(TOKEN.findall(text))

    for old, new in EDITS:
        n = text.count(old)
        if n != 1:
            print('MISS (%d occurrences): %r' % (n, old.split('\n')[0][:88]))
            return 1
        text = text.replace(old, new)

    for old, new in TABLE_CELL_EDITS:
        n = text.count(old)
        if n != 1:
            print('TABLE MISS (%d): %r' % (n, old))
            return 1
        text = text.replace(old, new if new is not None else '\u0000DROP\u0000')

    lines = text.split('\n')

    # Table A: its first column WAS the line number; that cell now holds the
    # drop marker, so the column goes and the "Function" header becomes the
    # call site it always described.
    a0 = next(i for i, l in enumerate(lines) if l.startswith('| Call site '))
    a1 = a0
    while a1 + 1 < len(lines) and lines[a1 + 1].lstrip().startswith('|'):
        a1 += 1
    block = drop_first_column(lines[a0:a1 + 1])
    block[0] = '| ' + ' | '.join(['Call site'] + split_row(block[0])[1:]) + ' |'
    lines[a0:a1 + 1] = realign(block)

    # Three more tables keep every column; only cell CONTENTS changed, so they
    # just need re-padding. Located by their header text, never by line number
    # — which is the whole point of this script.
    for header in ('| # | Walk',
                   '| Consumer ',
                   '| Sort-key class '):
        b0 = next(i for i, l in enumerate(lines) if l.startswith(header))
        b1 = b0
        while b1 + 1 < len(lines) and lines[b1 + 1].lstrip().startswith('|'):
            b1 += 1
        lines[b0:b1 + 1] = realign(lines[b0:b1 + 1])

    text = '\n'.join(lines)
    if '\u0000DROP\u0000' in text:
        print('BUG: a dropped table cell survived')
        return 1

    left = TOKEN.findall(text)
    print('line references: %d before, %d after' % (before, len(left)))
    for t in sorted(set(left)):
        print('   STILL PRESENT: %s' % t)
    if apply and not left:
        io.open(ORG, 'w', encoding='utf-8').write(text)
        print('written.')
    elif apply:
        print('NOT written — tokens remain.')
        return 1
    else:
        print('dry run — re-run with --apply.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
