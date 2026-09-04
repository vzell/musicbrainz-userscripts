"""Is `treleases` a NATIVE MusicBrainz class, or purely a jesus2099 marker?

tests/snapshots/*/raw.html are captured by Playwright, which loads ONLY our
userscript (+iro/pako/VZ_MBLibrary) — no jesus2099. So any `treleases` in them
must be MusicBrainz's own markup.
"""
import re

SHADOW = re.compile(r'text-shadow:\s*yellow')

for path, note in [
    ('tests/snapshots/release-tracks/raw.html', 'Playwright capture — NO jesus2099'),
    ('tests/snapshots/release-discids/raw.html', 'Playwright capture — NO jesus2099'),
    ('tests/snapshots/artist-events/raw.html', 'Playwright capture — NO jesus2099'),
    ('debug/work-rec.html', 'browser dump — jesus2099 WAS running'),
]:
    try:
        html = open(path, encoding='utf-8', errors='replace').read()
    except OSError as e:
        print(f'{path}: {e}')
        continue
    n_tre = len(re.findall(r'treleases', html))
    n_j2 = len(re.findall(r'jesus2099', html))
    n_title = len(re.findall(r'MIND|TURBO', html))
    n_shadow = len(SHADOW.findall(html))
    print(f'=== {path}\n    ({note})')
    print(f'    "treleases"      : {n_tre}')
    print(f'    "jesus2099"      : {n_j2}')
    print(f'    plugin title     : {n_title}')
    print(f'    yellow shadow    : {n_shadow}')
    for m in list(re.finditer(r'<t[dh][^>]*treleases[^>]*>', html))[:3]:
        print(f'      {m.group(0)[:150]}')
    print()
