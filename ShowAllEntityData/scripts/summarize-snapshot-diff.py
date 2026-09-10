"""Summarize what changed between the committed and working-tree versions of a
snapshot rendered.html, as CLASS/ATTRIBUTE frequency deltas rather than as a
line diff.

These files are effectively one enormous line, so `git diff` reports the whole
document as changed and says nothing about WHAT moved. Counting the tokens that
matter — class names, data-* attributes, inline min-width values — turns an
unreadable diff into a short list, which is what deciding "is this drift mine?"
actually needs.

usage: python3 scripts/summarize-snapshot-diff.py <pageType> [...]
"""
import collections
import re
import subprocess
import sys

TOKEN_RE = re.compile(r'class="([^"]*)"|(\bdata-[a-z0-9-]+)=|(\bid="[^"]*")')

# GM_addStyle's rules are part of the captured document, and they mention the
# very class names and data-* attributes this script counts — `td[data-mb-len-
# flag="severe"]` and a CSS comment quoting `<th class="mb-picard-th">` both
# matched TOKEN_RE and were reported as DOM movement. Strip <style> first so a
# rule ADDED since the last capture is not mistaken for markup.
STYLE_RE = re.compile(r'<style\b[^>]*>.*?</style>', re.S | re.I)


def tokens(html):
    html = STYLE_RE.sub('', html)
    counts = collections.Counter()
    for m in TOKEN_RE.finditer(html):
        if m.group(1) is not None:
            for cls in m.group(1).split():
                counts['class:' + cls] += 1
        elif m.group(2) is not None:
            counts['attr:' + m.group(2)] += 1
        else:
            counts[m.group(3)] += 1
    return counts


for pt in sys.argv[1:]:
    path = f'tests/snapshots/{pt}/rendered.html'
    old = subprocess.run(['git', 'show', f'HEAD:ShowAllEntityData/{path}'],
                         capture_output=True, text=True, errors='replace').stdout
    new = open(path, encoding='utf-8', errors='replace').read()
    a, b = tokens(old), tokens(new)
    delta = {k: b.get(k, 0) - a.get(k, 0) for k in set(a) | set(b)}
    delta = {k: v for k, v in delta.items() if v}
    print(f'{pt}: {len(old)} -> {len(new)} bytes ({len(new) - len(old):+d}), '
          f'{len(delta)} token kinds moved')
    for k, v in sorted(delta.items(), key=lambda kv: (-abs(kv[1]), kv[0])):
        print(f'   {v:+7d}  {k}')
    print()
