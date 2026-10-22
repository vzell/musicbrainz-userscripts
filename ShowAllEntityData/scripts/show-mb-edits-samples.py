"""Prints sample entries from scripts/inventory-mb-edits.js --json output:
one per (status, category) pair, plus every edit type that occurs only in
the given pages, so the editing-history mockups (org/mb-edit-history.org)
can be checked against the real field values.

usage: python3 scripts/show-mb-edits-samples.py <records.json> [--type "Edit medium"] [--id 12345] [--full]
       python3 scripts/show-mb-edits-samples.py <records.json> --page edits-page-recording --list
       (--page limits every mode to one page; --list prints one line per entry)
"""
import argparse
import json


def short(s, n=160):
    """The string cut to n characters."""
    s = s or ''
    return s if len(s) <= n else s[:n] + '…'


def show(page, e, full):
    """Prints one entry."""
    print(f"\n--- {page} #{e['id']} {e['type']} [{e['cat']}] status={e['status']} label={e['statusLabel']!r} "
          f"preNgs={e['preNgs']}")
    print(f"    editor={e['editor']!r} hidden={e['editorHidden']} class={e['editorClass']!r} avatar={short(e['avatar'], 80)!r}")
    print(f"    vote={e['vote']!r} auto={e['auto']} yes={e['yes']} no={e['no']} when={e['when']!r} date={e['date']!r} myVote={e['myVote']!r}")
    for r in e['rows']:
        if r['kind'] == 'diff':
            print(f"    [{r['kind']}] {r['label']}: OLD {short(r['old'], 9999 if full else 160)}")
            print(f"    {' ' * (len(r['kind']) + 2)} {' ' * len(r['label'])}  NEW {short(r['new'], 9999 if full else 160)}")
        else:
            print(f"    [{r['kind']}] {r['label']}: {short(r['html'], 9999 if full else 200)}")
    for n in e['notes'][:3]:
        print(f"    note {n['author']!r} {n['date']!r} vote={n['vote']!r} owner={n['owner']} bot={n['bot']}: {short(n['html'], 9999 if full else 140)}")
    if len(e['notes']) > 3:
        print(f"    … {len(e['notes']) - 3} more notes")


def main():
    """Selects and prints entries."""
    ap = argparse.ArgumentParser()
    ap.add_argument('records')
    ap.add_argument('--type')
    ap.add_argument('--id')
    ap.add_argument('--full', action='store_true')
    ap.add_argument('--page')
    ap.add_argument('--list', action='store_true')
    args = ap.parse_args()
    with open(args.records, encoding='utf-8') as f:
        recs = json.load(f)
    if args.page:
        recs = {args.page: recs[args.page]}
    if args.list:
        for page, rec in recs.items():
            for i, e in enumerate((rec or {}).get('entries', [])):
                kinds = ','.join(sorted({r['kind'] for r in e['rows']}))
                print(f"{page} {i:2} #{e['id']} [{e['cat']}] {e['type']} status={e['status']} rows={kinds} "
                      f"notes={len(e['notes'])} editor={e['editor']!r} date={e['date']!r}")
        return
    if args.type or args.id:
        n = 0
        for page, rec in recs.items():
            for e in (rec or {}).get('entries', []):
                if (args.type and e['type'] == args.type) or (args.id and e['id'] == args.id):
                    show(page, e, args.full)
                    n += 1
                    if n >= 3:
                        return
        return
    seen = set()
    for page, rec in recs.items():
        for e in (rec or {}).get('entries', []):
            k = (e['status'], e['cat'])
            if k not in seen:
                seen.add(k)
                show(page, e, args.full)


if __name__ == '__main__':
    main()
