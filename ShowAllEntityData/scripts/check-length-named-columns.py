"""Any column name containing 'Length'/'length' other than exactly 'Length'?

The legacy numeric sort heuristic used name.includes('Length'); _sortColumnKind()
narrowed that to an exact match plus align:':' detection, so a differently-named
duration-ish column would silently change sort kind.
"""
import glob
import re

names = set()
for p in glob.glob('tests/snapshots/*/rendered.html') + glob.glob('debug/*.html'):
    try:
        html = open(p, encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    names.update(re.findall(r'data-col-name="([^"]*)"', html))

src = open('ShowAllEntityData.user.js', encoding='utf-8').read()
declared = set(re.findall(r"sourceColumn:\s*'([^']*)'", src))
declared |= set(re.findall(r"syntheticColumns:\s*\[([^\]]*)\]", src) and
                re.findall(r"'([^']*)'", ' '.join(re.findall(r"syntheticColumns:\s*\[([^\]]*)\]", src))))

hits_rendered = sorted(n for n in names if 'ength' in n)
hits_declared = sorted(n for n in declared if 'ength' in n)
print('rendered snapshots — names containing "ength":', hits_rendered)
print('source declarations — names containing "ength":', hits_declared)
