"""Generate scripts/mutations/uniq-drop-work-attr-slash-types.json (see gen-mutations-tracks-total.py for why a script)."""
import json

SPEC = 'tests/fixtures/uniq-drop-work-attr-slash-types.spec.js'
muts = [
    {
        "name": "the parts are never offered",
        "why": "The helper returns only the compound, i.e. behaviour before this change: BUMA and STEMRA ID vanish from the dropdown.",
        "edits": [{"find": "if (typeName.includes('/')) {", "replace": "if (false) {"}],
        "spec": SPEC, "grep": "offers the compound AND each part", "expect": "fail",
    },
    {
        "name": "the compound is dropped in favour of its parts",
        "why": "'Additionally' means the compound stays; replacing it would strand a user who wants exactly the BUMA/STEMRA badge.",
        "edits": [{"find": "const labels = [typeName];", "replace": "const labels = typeName.includes('/') ? [] : [typeName];"}],
        "spec": SPEC, "grep": "offers the compound AND each part", "expect": "fail",
    },
    {
        "name": "the matcher compares the raw type name only",
        "why": "Silently dead entries: BUMA and STEMRA ID render with the right badge but ticking them matches no row.",
        "edits": [{
            "find": "some(p => _workAttrTypeLabels(p.typeName).includes(want));",
            "replace": "some(p => p.typeName === want);",
        }],
        "spec": SPEC, "grep": "filters to the two BUMA/STEMRA rows", "expect": "fail",
    },
    {
        "name": "the counter records only the raw type name",
        "why": "The pre-change counting loop: no part entries are ever produced, whatever the matcher would accept.",
        "edits": [{
            "find": "flatMap(p => _workAttrTypeLabels(p.typeName)));",
            "replace": "map(p => p.typeName));",
        }],
        "spec": SPEC, "grep": "offers the compound AND each part", "expect": "fail",
    },
    {
        "name": "the part highlight has no lookbehind",
        "why": "Without the parenthesis anchor the regex marks 'BUMA' inside the badge VALUE 'BUMA-77' too, so the row shows two marks and one of them is not after a '('.",
        "edits": [{
            "find": "`(?<=\\\\(${_esc(_before)})${_esc(_parts[_i])}(?=${_esc(_after)}\\\\))`",
            "replace": "`${_esc(_parts[_i])}`",
        }],
        "spec": SPEC, "grep": "highlights only inside the parenthesized type name", "expect": "fail",
    },
]
with open('scripts/mutations/uniq-drop-work-attr-slash-types.json', 'w', encoding='utf-8') as f:
    json.dump(muts, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('wrote', len(muts), 'mutations')
