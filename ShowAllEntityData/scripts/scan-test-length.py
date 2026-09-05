"""Which snapshot baselines / fixtures contain a Length column or duration text?"""
import glob
import re

for p in sorted(glob.glob('tests/snapshots/*/*.html')):
    html = open(p, encoding='utf-8', errors='replace').read()
    names = set(re.findall(r'data-col-name="([^"]*)"', html))
    has_len = 'Length' in names
    durs = re.findall(r'>(\d{1,2}:\d{2}(?:\.\d{3})?)<', html)
    tre = len(re.findall(r'treleases', html))
    print(f'{p:<52} Length-col={has_len!s:<5} durations={len(durs):<4} treleases={tre:<3} {durs[:4]}')
print()
for p in sorted(glob.glob('tests/fixtures/saved-data/*')):
    print('fixture:', p)
