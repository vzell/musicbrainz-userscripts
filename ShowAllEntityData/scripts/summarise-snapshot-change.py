"""Summarise what actually changed in the release-tracks rendered baseline,
ignoring the injected <style> block (which is just this change's new CSS)."""
import re
import subprocess

old = subprocess.run(['git', 'show', 'HEAD:ShowAllEntityData/tests/snapshots/release-tracks/rendered.html'],
                     capture_output=True, text=True).stdout
new = open('tests/snapshots/release-tracks/rendered.html', encoding='utf-8', errors='replace').read()


def strip_styles(h):
    return re.sub(r'<style[^>]*>.*?</style>', '<style/>', h, flags=re.S)


def summarise(label, h):
    print(f'{label}:')
    print(f'   .mb-ms-col-hdr-btn occurrences : {len(re.findall(r"mb-ms-col-hdr-btn", h))}')
    print(f'   data-mb-ms= cells              : {len(re.findall(r"data-mb-ms=", h))}')
    print(f'   data-mb-sec-text= cells        : {len(re.findall(r"data-mb-sec-text=", h))}')
    print(f'   data-mb-ms-shown= cells        : {len(re.findall(r"data-mb-ms-shown=", h))}')
    print(f'   treleases                      : {len(re.findall(r"treleases", h))}')


summarise('OLD (committed)', old)
summarise('NEW (captured)', new)

o, n = strip_styles(old), strip_styles(new)
print(f'\nbytes outside <style>: old={len(o)} new={len(n)} delta={len(n) - len(o)}')

# tag-level diff outside <style>
import difflib
a = re.split(r'(?<=>)', o)
b = re.split(r'(?<=>)', n)
sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
regions = [(t, ''.join(a[i1:i2]), ''.join(b[j1:j2])) for t, i1, i2, j1, j2 in sm.get_opcodes() if t != 'equal']
print(f'changed regions outside <style>: {len(regions)}')
for t, o_, n_ in regions[:8]:
    print(f'  [{t}]')
    if o_.strip():
        print(f'    - {o_.strip()[:200]}')
    if n_.strip():
        print(f'    + {n_.strip()[:200]}')
