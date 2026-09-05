"""List every pageDefinition (by `type:`) whose feature block mentions a 'Length' column."""
import re

src = open('ShowAllEntityData.user.js', encoding='utf-8').read()
lines = src.split('\n')

# collect all `type: 'x',` lines that look like pageDefinition ids
type_at = []
for i, ln in enumerate(lines, 1):
    m = re.match(r"\s*type:\s*'([a-z0-9-]+)',\s*$", ln)
    if m:
        type_at.append((i, m.group(1)))

def nearest_type(lineno):
    best = None
    for i, t in type_at:
        if i <= lineno:
            best = (i, t)
        else:
            break
    return best

hits = {}
for i, ln in enumerate(lines, 1):
    if re.search(r"sourceColumn:\s*'Length'", ln) or re.search(r"'Length'", ln):
        nt = nearest_type(i)
        if not nt:
            continue
        # only consider lines within a plausible definition window
        if i - nt[0] > 200:
            continue
        hits.setdefault(nt[1], []).append((i, ln.strip()[:110]))

print(f'pageDefinitions referencing a "Length" column: {len(hits)}\n')
for t in sorted(hits):
    print(f'--- {t}')
    for i, ln in hits[t][:6]:
        print(f'    {i}: {ln}')
