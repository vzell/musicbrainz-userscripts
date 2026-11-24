#!/usr/bin/env python3
"""Write scripts/mutations/bb-findings-page-tags-4b.json: batch 4b's planted defects.

Usage:
    python3 scripts/make-bb-batch4b-mutations.py

Each entry plants one defect into ShowAllEntityData.user.js (its `find` must
match exactly once) and names the test of tests/fixtures/bb-findings-page-tags.spec.js
that must fail. Run with scripts/mutation-check.py (it restores the script).
Written 2026-11-24 (org/bbp-parity.org, "Batch 4b").
"""
import json
import os

SPEC = 'tests/fixtures/bb-findings-page-tags.spec.js'
M = [
    ('cut tab page: a release tab page cut at 60 characters is checked',
     "The four cut names (retail:…-credit) are tab pages.",
     "        return name.length === 60 && !!m && _BB_TAGCHK_RETAIL_TABS.some(t => t.startsWith(m[1]));\n",
     "        return false;\n", 'the three families on'),
    ('release line: the asterisk of "Commercially Released*:" is not read',
     'Born To Run writes the line with an asterisk.',
     "        const m = /Commercially Released\\*?:([^\\n]*)/i.exec(root ? root.textContent : '');\n",
     "        const m = /Commercially Released:([^\\n]*)/i.exec(root ? root.textContent : '');\n", 'the release line'),
    ('release dates: only the first date counts',
     'One listed date in full is enough (the wiki tags the later of two on some releases).',
     "            const d = facts.dates.find(x => x.every(p => !p || _bbTagPresent(p, all))) || facts.dates[0];\n",
     "            const d = facts.dates[0];\n", 'the release rule'),
    ('release dates: a date tag of no listed date is never not expected',
     'Life, Death And Dennis Hopper is tagged 2024, released 2025.',
     "            if (!facts.dates.some(d => d.some(p => p && _bbTagPresent(p, one)))) {\n",
     "            if (false) {\n", 'the release rule'),
    ('release letter: no first letter for a release',
     'A Good Life lacks "a".',
     "            dates, releaseLetter: dates ? _bbTagPageLetter('song', title) : '',\n",
     "            dates, releaseLetter: '',\n", 'the three families on'),
    ('switch: the release family always on',
     'Off by default.',
     "        return Lib.settings.sa_bb_tag_family_release === true;\n",
     "        return true;\n", 'the families off'),
    ('switch: the relation family always on',
     'Off by default.',
     "        return Lib.settings.sa_bb_tag_family_relation === true;\n",
     "        return true;\n", 'the families off'),
    ('switch: a venue page checked with the place family off',
     'The place switch covers venue pages too.',
     "        if (!_bbTagPlaceOn() || facts.kind !== 'venue') return null;\n",
     "        if (facts.kind !== 'venue') return null;\n", 'the families off'),
    ('venue place: the title\'s places not read',
     'Bow Tie Cinemas lacks "redbank" and "usa".',
     "        const out = _bbTagPlacePartsExpected(facts.title, tables);\n",
     "        const out = [];\n", 'the three families on'),
    ('venue place: the venue map not read on a venue page',
     "The Stone Pony's shows carry stonepony.",
     "        const vt = venues ? venues[facts.name] : null;\n",
     "        const vt = null;\n", 'the three families on'),
    ('relation name: the feed\'s relation map not read',
     'Donald Dunn is tagged duckdunn, a stage name only the map knows.',
     "        const mapped = Array.isArray(map[facts.name]) ? map[facts.name] : [];\n",
     "        const mapped = [];\n", "a person's name"),
    ('relation name: checked without the map',
     'Without relationTags the name is not checked (a stage name would be called missing).',
     "        if (!tables || !map) return null;\n",
     "        if (!tables) return null;\n", "a person's name"),
    ('Tags card: the name family has no row',
     'A missing name tag goes in the People row.',
     "        name: 'person',\n",
     "", 'People row'),
    ('Tags card: no note for a venue whose place waits for the feed',
     'The card says why the place is not checked.',
     "            const what = [_bbTagPlaceOn() && facts.kind === 'venue' && !tables ? 'place tags are' : '',\n",
     "            const what = ['',\n", 'no feed'),
    ('Tags card: "as expected" leaves the place out',
     'The words say what was checked.',
     "            venue: `kind, first-letter${tables && _bbTagPlaceOn() ? ', place' : ''} and construction`,\n",
     "            venue: 'kind, first-letter and construction',\n", 'checked the place too'),
]


def main():
    """Write the JSON list."""
    out = [{'name': n, 'why': w, 'edits': [{'find': f, 'replace': r}], 'spec': SPEC, 'grep': g, 'expect': 'fail'}
           for n, w, f, r, g in M]
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mutations', 'bb-findings-page-tags-4b.json')
    with open(dst, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=4)
        fh.write('\n')
    print(f'{dst}: {len(out)} entries')


if __name__ == '__main__':
    main()
