"""Writes a subset of a mutation file: the entries whose name contains one of the given substrings.

Usage: python3 scripts/mutation-subset.py <mutations.json> <out.json> <name-substring> [...]

Lets a branch mutation-check only the entries it added, with
scripts/mutation-check.py <out.json>, instead of the whole file.
"""
import json
import sys


def main():
    """Filters the mutation list by name and writes the result."""
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    with open(sys.argv[1], encoding='utf-8') as fh:
        mutations = json.load(fh)
    keys = sys.argv[3:]
    picked = [m for m in mutations if any(k in m['name'] for k in keys)]
    with open(sys.argv[2], 'w', encoding='utf-8') as fh:
        json.dump(picked, fh, indent=4, ensure_ascii=False)
        fh.write('\n')
    print(f'{len(picked)} of {len(mutations)} mutations written to {sys.argv[2]}')
    return 0 if picked else 1


if __name__ == '__main__':
    sys.exit(main())
