"""Generate scripts/mutations/uniq-drop-tracks-total.json.

Built from a script rather than hand-written so the regex backslashes in the
`find`/`replace` strings cannot be mis-escaped in JSON.
"""
import json

SPEC = 'tests/fixtures/uniq-drop-tracks-total.spec.js'
SUM = "return String(perMedium.reduce((acc, n) => acc + parseInt(n, 10), 0));"
MULTI_RE = "? /\\d+(?:\\s*\\+\\s*\\d+)+/g"
MATCH = "return !!cell && _findCellTracksTotal(cell) === want;"
DISPATCH = "_highlightTracksTotalMatch(row.cells[f.idx], mode);"
PERMED_DISPATCH = "_highlightTracksPerMediumMatch(row.cells[f.idx], mode);"

muts = [
    {
        "name": "total is the first medium's count, not the sum",
        "why": "The conflation the fixture is built to catch: with total = per-medium[0], '5 + 5 + 5' offers 5 and '9 + 6' offers 9, so the '» total tracks: 15' entry loses two of its three rows.",
        "edits": [{"find": SUM, "replace": "return perMedium[0];"}],
        "spec": SPEC, "grep": "offers one entry per distinct summed total", "expect": "fail",
    },
    {
        "name": "the matcher never matches a total",
        "why": "Silently dead entry (skill failure mode 1): the entry renders with the right badge but ticking it filters nothing.",
        "edits": [{"find": MATCH, "replace": "return false;"}],
        "spec": SPEC, "grep": "checking total 15 shows exactly", "expect": "fail",
    },
    {
        "name": "no highlight dispatch for a total",
        "why": "The matching rows are right but nothing is marked, so a collapsed multi-row cell would also lose its hidden-match tint.",
        "edits": [{"find": DISPATCH, "replace": "void 0;"}],
        "spec": SPEC, "grep": "checking total 15 shows exactly", "expect": "fail",
    },
    {
        "name": "a multi-medium cell is highlighted as if it held its total literally",
        "why": "'5 + 5 + 5' contains no text '15', so the literal-number regex marks nothing there; only the whole-run regex does.",
        "edits": [{"find": MULTI_RE, "replace": "? new RegExp('\\\\b' + _want + '\\\\b', 'g')"}],
        "spec": SPEC, "grep": "checking total 15 shows exactly", "expect": "fail",
    },
    {
        "name": "the per-medium entry is routed to the total matcher",
        "why": "Guards the opposite conflation: 'trackspermedium:15' must stay a per-medium match. Breaking it makes the 15 entry in 'Tracks info - Tracks' match three rows.",
        "edits": [{
            "find": "return !!cell && _findCellTracksPerMedium(cell).includes(want);",
            "replace": "return !!cell && _findCellTracksTotal(cell) === want;",
        }],
        "spec": SPEC, "grep": "not conflated", "expect": "fail",
    },
]
with open('scripts/mutations/uniq-drop-tracks-total.json', 'w', encoding='utf-8') as f:
    json.dump(muts, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('wrote', len(muts), 'mutations')
