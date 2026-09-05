"""One-time repair of four data defects in ShowAllEntityData_CHANGELOG.json.

Both predate `scripts/fold-wip-changelog.py` and are exactly what it now
prevents. Committed rather than run and thrown away, because it is the record
of which shipped release notes were edited and on what evidence.

1. UNRESOLVED `WIP.N` PLACEHOLDERS, left behind by hand-folds that rewrote the
   `version` fields but not the cross-references buried in prose.

   - 9.99.932's "WIP.1" resolves to **9.99.931**. Confirmed twice: 9.99.931 is
     the entry that introduced `window.__saTest`, which is what the sentence
     cites, and replaying that fold's own WIP file (`git show
     18faad8^:…wip.json`, six entries numbered oldest-first from 9.99.931)
     maps WIP.1 -> 9.99.931 exactly.

   - 9.99.783's "WIP.26" resolves to **nothing at all**, so the citation is
     deleted rather than repointed. WIP.26 never existed in any committed WIP
     file: the pre-fold file jumps WIP.25 -> WIP.27 (`git show
     1b96eb0^:…wip.json`), no commit in the repository's history has ever
     contained a `"WIP.26"`, and no shipped entry introduces the
     "Phonographic copyright (℗) by artist/label" columns the sentence points
     at — the commit that first put that column name in the userscript
     (3ec4a40) is the very commit this entry describes. It was a
     mis-numbered reference from the moment it was written. Inventing a
     target would be worse than dropping one.

2. TWO ENTRIES WITH NO `version` FIELD, which make any tool that reads
   `entry['version']` bail. The changelog is strictly newest-first, so each
   sits in exactly one free slot:

   - index 969, dated 2026-03-06, between 9.99.46 and 9.99.44 -> **9.99.45**.
     Unambiguous: one integer slot, unused anywhere else.
   - index 1037, dated 2026-02-24, between 9.91.0 and 9.90.0 -> **9.90.1**.
     RECONSTRUCTED, not recovered: its neighbours are all `9.9x.0`, no
     integer fits between 90 and 91, and both entries entered git in the
     initial import (35a605d) so no earlier `@version` records the truth.
     9.90.1 is the only value that keeps the sequence strictly descending
     without colliding.

3. DUPLICATE VERSIONS, three pairs, each pair adjacent and same-dated. Two
   distinct shapes, so two distinct fixes:

   - 9.99.338 (indices 676/677) is the SAME ENTRY TWICE, byte-identical. One
     copy is deleted; nothing is lost and no renumbering is needed.
   - 9.99.247 (767/768) and 9.99.547 (466/467) are each two DIFFERENT
     write-ups of one fix — a rewrite that was appended instead of replacing
     its predecessor. They are MERGED into a single entry keeping both texts,
     rather than one being renumbered or dropped:
       * renumbering has nowhere to go. 9.99.547's neighbours are 548 and
         546, with no free slot. 9.99.247 does have a free 9.99.246 slot, but
         BOTH of its entries cite "the previous attempt (v9.99.246)" as
         something they replace, so numbering either of them 9.99.246 would
         make it cite itself. (That 9.99.246 is referenced but has no entry
         of its own is a separate, pre-existing gap, deliberately left alone.)
       * dropping one would need a judgement about which write-up is
         authoritative, and nothing in the data says. Keeping both is the
         honest record: the release really was described twice.

4. NON-NUMERIC VERSIONS `9.99.483-dbg` / `9.99.482-dbg` (indices 531/532),
   which break any tool doing `int(version.split(".")[2])` — precisely the
   "bail" this file exists to eliminate. Both are normalised to their plain
   numeric form; 9.99.482 and 9.99.483 are used by nothing else, and the
   sequence around them (484, ..., 481) has exactly those two slots free.
   The in-prose "v9.99.482-dbg" citation is normalised with them so the entry
   stays self-consistent. Nothing is lost: both entries still open by calling
   themselves a temporary debug build, which is what the suffix conveyed.

Idempotent: re-running after a successful pass reports nothing left to do.

    python3 scripts/repair-changelog-integrity.py            # preview
    python3 scripts/repair-changelog-integrity.py --apply
"""

import argparse
import json
import pathlib
import re
import sys

CHANGELOG = 'ShowAllEntityData_CHANGELOG.json'

# version -> {old placeholder: replacement}. An empty replacement deletes the
# parenthesised citation along with its surrounding space.
WIP_FIXES = {
    '9.99.932': {'WIP.1': '9.99.931'},
    '9.99.783': {'WIP.26': None},          # None = delete the citation entirely
}

# index -> version, for entries that never had one.
MISSING_VERSIONS = {
    969: ('9.99.45', '2026-03-06'),
    1037: ('9.90.1', '2026-02-24'),
}

# (keep_index, drop_index, version): the two entries are byte-identical, so the
# second is simply removed.
IDENTICAL_DUPES = [
    (676, 677, '9.99.338'),
]

# (keep_index, merge_index, version): two different write-ups of one release.
# The second entry's sections are folded into the first, then it is removed.
MERGE_DUPES = [
    (767, 768, '9.99.247'),
    (466, 467, '9.99.547'),
]

# index -> (old version, new version): strip a non-numeric build suffix.
DBG_VERSIONS = {
    531: ('9.99.483-dbg', '9.99.483'),
    532: ('9.99.482-dbg', '9.99.482'),
}


def fix_text(text, mapping):
    """Applies one entry's placeholder fixes to a single item string."""
    out = text
    for old, new in mapping.items():
        if new is None:
            # " (WIP.26)" -> "", and a bare "WIP.26" -> "" as a fallback.
            out = re.sub(rf'\s*\({re.escape(old)}\)', '', out)
            out = re.sub(rf'\s*\b{re.escape(old)}\b', '', out)
        else:
            out = re.sub(rf'\b{re.escape(old)}\b', new, out)
    return out


def merge_sections(keep, extra):
    """Folds `extra`'s sections into `keep`, combining same-labelled ones.

    Item order within a label is keep-then-extra, which preserves the file's
    own newest-first ordering: the entry nearer the top of the changelog was
    written later.
    """
    by_label = {sec.get('label'): sec for sec in keep.get('sections', [])}
    for sec in extra.get('sections', []):
        target = by_label.get(sec.get('label'))
        if target is None:
            keep.setdefault('sections', []).append(sec)
            by_label[sec.get('label')] = sec
        else:
            for it in sec.get('items', []):
                if it not in target.setdefault('items', []):
                    target['items'].append(it)


def walk_items(entry):
    """Yields (section, index, text, setter) for every item, both item shapes."""
    for sec in entry.get('sections', []):
        for i, it in enumerate(sec.get('items', [])):
            if isinstance(it, str):
                yield it, (lambda s, _sec=sec, _i=i: _sec['items'].__setitem__(_i, s))
            elif isinstance(it, dict) and isinstance(it.get('text'), str):
                yield it['text'], (lambda s, _it=it: _it.__setitem__('text', s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='write the changes (default: preview)')
    args = ap.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent
    path = root / CHANGELOG
    data = json.loads(path.read_text(encoding='utf-8'))

    changes = []

    # 1. Placeholder rewrites.
    for entry in data:
        mapping = WIP_FIXES.get(str(entry.get('version')))
        if not mapping:
            continue
        for text, setter in walk_items(entry):
            fixed = fix_text(text, mapping)
            if fixed != text:
                changes.append(f'{entry["version"]}: ' + ' | '.join(
                    f'{k} -> {v if v else "(citation removed)"}' for k, v in mapping.items()))
                if args.apply:
                    setter(fixed)

    # 2. Missing version fields, inserted FIRST so key order matches every
    #    other entry ({version, date, sections}).
    for idx, (version, expect_date) in MISSING_VERSIONS.items():
        if idx >= len(data):
            sys.exit(f'error: index {idx} out of range — changelog has {len(data)} entries')
        entry = data[idx]
        if 'version' in entry:
            continue                                    # already repaired
        if entry.get('date') != expect_date:
            sys.exit(f'error: index {idx} is dated {entry.get("date")}, expected {expect_date} '
                     f'— the changelog shifted; re-derive the indices before running this')
        changes.append(f'index {idx} ({entry.get("date")}): version -> {version}')
        if args.apply:
            data[idx] = {'version': version, **entry}

    # 3a. Non-numeric build suffixes, on the `version` field.
    for idx, (old_v, new_v) in DBG_VERSIONS.items():
        entry = data[idx] if idx < len(data) else None
        if entry is None or str(entry.get('version')) != old_v:
            continue                                    # already repaired
        changes.append(f'index {idx}: version {old_v} -> {new_v}')
        if args.apply:
            entry['version'] = new_v

    # 3b. …and on every in-prose citation of them, ANYWHERE in the file.
    #     Deliberately a whole-file pass rather than one scoped to the two
    #     entries above: a citation names some OTHER entry's version, so
    #     9.99.483's text is where "v9.99.482-dbg" actually appears. Scoping
    #     this to each entry's own version left all five citations untouched.
    dbg_map = dict(DBG_VERSIONS.values())
    cited = 0
    for entry in data:
        for text, setter in walk_items(entry):
            fixed = text
            for old_v, new_v in dbg_map.items():
                fixed = fixed.replace(old_v, new_v)
            if fixed != text:
                cited += 1
                if args.apply:
                    setter(fixed)
    if cited:
        changes.append(f'{cited} in-prose "-dbg" citation(s) normalised')

    # 4. Duplicate versions. Index-based, so every deletion is deferred and
    #    then applied newest-index-last — deleting as we go would shift every
    #    index still to be visited.
    to_delete = []
    for keep_i, drop_i, version in IDENTICAL_DUPES:
        if max(keep_i, drop_i) >= len(data):
            continue
        a, b = data[keep_i], data[drop_i]
        if str(a.get('version')) != version or str(b.get('version')) != version:
            continue                                    # already repaired
        if json.dumps(a, ensure_ascii=False, sort_keys=True) != \
           json.dumps(b, ensure_ascii=False, sort_keys=True):
            sys.exit(f'error: [{keep_i}] and [{drop_i}] are no longer identical — '
                     f're-check before removing either')
        changes.append(f'{version}: duplicate at index {drop_i} removed (identical to {keep_i})')
        to_delete.append(drop_i)

    for keep_i, merge_i, version in MERGE_DUPES:
        if max(keep_i, merge_i) >= len(data):
            continue
        a, b = data[keep_i], data[merge_i]
        if str(a.get('version')) != version or str(b.get('version')) != version:
            continue                                    # already repaired
        n_items = sum(len(sec.get('items', [])) for sec in b.get('sections', []))
        changes.append(f'{version}: {n_items} item(s) from index {merge_i} merged into {keep_i}')
        if args.apply:
            merge_sections(a, b)
        to_delete.append(merge_i)

    if args.apply:
        for idx in sorted(to_delete, reverse=True):
            del data[idx]

    if not changes:
        print('Nothing to repair — the changelog is already clean.')
        return 0
    for c in changes:
        print(f'  {c}')

    if not args.apply:
        print('\nPreview only. Re-run with --apply.')
        return 0

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'\nWrote {CHANGELOG}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
