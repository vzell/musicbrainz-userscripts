"""Generate scripts/mutations/uniq-drop-time-of-day.json (see gen-mutations-tracks-total.py for why a script)."""
import json

SPEC = 'tests/fixtures/uniq-drop-time-of-day.spec.js'
muts = [
    {
        "name": "the Lunch bucket's upper edge is 13:00 instead of 12:59",
        "why": "Off-by-one at a boundary: 13:00 would land in Lunch. The fixture carries a row at every edge for exactly this.",
        "edits": [{"find": "from: 720,  to: 779  }", "replace": "from: 720,  to: 780  }"}],
        "spec": SPEC, "grep": "every bucket boundary lands", "expect": "fail",
    },
    {
        "name": "Night is missing from the table",
        "why": "00:00-03:59 falls in no bucket, so those rows silently vanish from the dropdown.",
        "edits": [{
            "find": ",\n        { label: 'Night (after midnight, 00:00-03:59)',                       from: 0,    to: 239  }",
            "replace": "",
        }],
        "spec": SPEC, "grep": "every bucket boundary lands", "expect": "fail",
    },
    {
        "name": "an unparseable or empty time is counted as Night",
        "why": "The null path removed: 'TBA' and the empty cell would have to be bucketed somewhere; here they inflate Night, so its count and the bucketed total both break.",
        "edits": [{"find": "(\\d{1,2}):(\\d{2})\\b/);\n        if (!m) return null;", "replace": "(\\d{1,2}):(\\d{2})\\b/);\n        if (!m) return _TIME_OF_DAY_BUCKETS[4].label;"}],
        "spec": SPEC, "grep": "every bucket boundary lands", "expect": "fail",
    },
    {
        "name": "the hour/minute range check is dropped",
        "why": "Honest overlap: an out-of-range time such as 25:99 then reaches the bucket lookup, whose own from/to bounds reject it (1599 min > 1439), so the outcome is identical. The explicit check is defence in depth and states the contract; no spec can tell the two apart.",
        "edits": [{"find": "if (hour > 23 || minute > 59) return null;", "replace": ""}],
        "spec": SPEC, "grep": "every bucket boundary lands", "expect": "pass",
    },
    {
        "name": "the matcher never matches a bucket",
        "why": "Silently dead entries: the badge is right but ticking it filters nothing.",
        "edits": [{"find": "return !!cell && _findCellTimeBucket(cell) === want;", "replace": "return false;"}],
        "spec": SPEC, "grep": "ticking", "expect": "fail",
    },
    {
        "name": "no highlight dispatch for a time bucket",
        "why": "Rows are right, but nothing is marked, so a collapsed multi-row cell also loses its hidden-match tint.",
        "edits": [{"find": "_highlightTimeOfDayMatch(row.cells[f.idx], mode);", "replace": "void 0;"}],
        "spec": SPEC, "grep": "ticking", "expect": "fail",
    },
    {
        "name": "entries sorted alphabetically instead of in clock order",
        "why": "'Afternoon' would come before 'Morning'.",
        "edits": [{
            "find": "_TIME_OF_DAY_BUCKETS.map(b => b.label).filter(l => timeOfDayValueCounts.has(l));",
            "replace": "_TIME_OF_DAY_BUCKETS.map(b => b.label).filter(l => timeOfDayValueCounts.has(l)).sort((a, b) => a.localeCompare(b));",
        }],
        "spec": SPEC, "grep": "every bucket boundary lands", "expect": "fail",
    },
]
with open('scripts/mutations/uniq-drop-time-of-day.json', 'w', encoding='utf-8') as f:
    json.dump(muts, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('wrote', len(muts), 'mutations')
