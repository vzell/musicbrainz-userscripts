"""Generate scripts/mutations/uniq-drop-length-ms-state.json (see gen-mutations-tracks-total.py for why a script)."""
import json

SPEC = 'tests/fixtures/uniq-drop-length-ms-state.spec.js'
muts = [
    {
        "name": "the state ignores the data-mb-ms stamp",
        "why": "Reads only the visible text. With ⏱ on this looks identical, but with ⏱ switched back off every cell shows rounded seconds and the whole split collapses to 'none'.",
        "edits": [{
            "find": "if (Number.isFinite(stamped)) return stamped % 1000 === 0 ? 'whole' : 'precise';",
            "replace": "void stamped;",
        }],
        "spec": SPEC, "grep": "switched back off", "expect": "fail",
    },
    {
        "name": "precise and whole are swapped for a stamped cell",
        "why": "The '≠ .000' entry would list the whole-second rows.",
        "edits": [{
            "find": "return stamped % 1000 === 0 ? 'whole' : 'precise';",
            "replace": "return stamped % 1000 === 0 ? 'precise' : 'whole';",
        }],
        "spec": SPEC, "grep": "shows exactly the two precise rows", "expect": "fail",
    },
    {
        "name": "a cell with no millisecond data counts as whole seconds",
        "why": "Conflates 'no data' with '.000'. The section then appears before ⏱ is pressed (every row would be 'whole'), and after ⏱ the two unknown rows inflate 'whole'.",
        "edits": [{"find": "if (!m) return 'none';", "replace": "if (!m) return 'whole';"}],
        "spec": SPEC, "grep": "is absent before", "expect": "fail",
    },
    {
        "name": "the matcher never matches a millisecond state",
        "why": "Silently dead entries: the badges are right but ticking one filters nothing.",
        "edits": [{
            "find": "return !!cell && _findCellLengthMsState(cell) === mode.slice(10);",
            "replace": "return false;",
        }],
        "spec": SPEC, "grep": "shows exactly the two", "expect": "fail",
    },
    {
        "name": "no highlight dispatch for the millisecond flags",
        "why": "Rows are right but the '.146'/'.000' part is never marked.",
        "edits": [{"find": "_highlightLengthMsMatch(row.cells[f.idx], mode);", "replace": "void 0;"}],
        "spec": SPEC, "grep": "marks their millisecond part", "expect": "fail",
    },
    {
        "name": "the visible-text fallback is removed",
        "why": "Honest overlap: the fallback serves cells that show '.mmm' without a data-mb-ms stamp (a snapshot-hydrated Length cell, or a third-party script's own rendering). Every cell in this fixture is stamped, so no spec here can see it go.",
        "edits": [{
            "find": "const m = getCleanColumnText(cell).match(/^\\d+:\\d{2}\\.(\\d{1,3})/);",
            "replace": "const m = null;",
        }],
        "spec": SPEC, "grep": "is absent before", "expect": "pass",
    },
]
with open('scripts/mutations/uniq-drop-length-ms-state.json', 'w', encoding='utf-8') as f:
    json.dump(muts, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('wrote', len(muts), 'mutations')
