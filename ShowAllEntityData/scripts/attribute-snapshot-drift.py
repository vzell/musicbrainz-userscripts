"""Split the release-tracks rendered.html diff into 'my change' vs 'pre-existing drift'.

Compares three captures:
  baseline  — the committed baseline (git HEAD)
  prefix    — freshly captured with purgeJesus2099Artifacts() disabled
  postfix   — freshly captured with the fix active

baseline->prefix  = drift accumulated since the baseline was last captured (NOT mine)
prefix->postfix   = the effect of this change alone
"""
import difflib
import os
import re
import sys

SP = ('/tmp/claude-1000/-home-vzell-git-musicbrainz-userscripts-ShowAllEntityData/'
      '6f0e206c-1cf2-485e-ba84-7ec5ab83286c/scratchpad')


def tokens(path):
    html = open(path, encoding='utf-8', errors='replace').read()
    # split into tag-ish tokens so a single-line document diffs usefully
    return re.split(r'(?<=>)', html)


def report(a_path, b_path, label):
    a, b = tokens(a_path), tokens(b_path)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    changes = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            continue
        changes.append((tag, ''.join(a[i1:i2]), ''.join(b[j1:j2])))
    print(f'=== {label}: {len(changes)} changed region(s)')
    for tag, old, new in changes[:25]:
        print(f'  [{tag}]')
        if old.strip():
            print(f'    - {old.strip()[:220]}')
        if new.strip():
            print(f'    + {new.strip()[:220]}')
    if len(changes) > 25:
        print(f'  … {len(changes) - 25} more')
    print()


report(os.path.join(SP, 'rendered-baseline.html'), os.path.join(SP, 'rendered-prefix.html'),
       'committed baseline -> pre-fix capture  (pre-existing drift, NOT mine)')
report(os.path.join(SP, 'rendered-prefix.html'), os.path.join(SP, 'rendered-run1.html'),
       'pre-fix -> post-fix  (THIS change only)')
