"""Enumerate EVERY jesus2099 artifact that survives into our final rendered page."""
import collections
import glob
import re

TARGETS = [
    'debug/work-rec.html',
    'debug/work.recordings.html',
    'debug/work-rec-double-relationships.html',
    'debug/tracklist-single-medium.html',
    'debug/therising.html',
    'tests/snapshots/release-tracks/rendered.html',
]

for path in TARGETS:
    try:
        html = open(path, encoding='utf-8', errors='replace').read()
    except OSError as e:
        print(f'{path}: {e}\n')
        continue
    print(f'=== {path} ===')

    # 1. every class token containing jesus2099 or treleases
    classes = collections.Counter()
    for m in re.finditer(r'class="([^"]*)"', html):
        for tok in m.group(1).split():
            if 'jesus2099' in tok or tok == 'treleases':
                classes[tok] += 1
    print('  marker classes:', dict(classes) or '—')

    # 2. which TAGS carry them
    tags = collections.Counter()
    for m in re.finditer(r'<(\w+)[^>]*class="[^"]*(?:jesus2099\w*|treleases)[^"]*"', html):
        tags[m.group(1)] += 1
    print('  on tags       :', dict(tags) or '—')

    # 3. the plugin title attribute (note: nbsp-separated!)
    titles = collections.Counter(re.findall(r'title="((?:[^"]*(?:MIND|TURBO|jesus)[^"]*))"', html))
    print('  plugin titles :', {k[:46]: v for k, v in titles.items()} or '—')

    # 4. the yellow text-shadow signature
    print('  text-shadow yellow:', len(re.findall(r'text-shadow:\s*(?:yellow|0 0 2px yellow)', html)))

    # 5. jesus2099-owned inline styles on <th>/<td>
    print('  <th> carrying a marker:', len(re.findall(r'<th[^>]*(?:jesus2099\w*|treleases)', html)))
    print('  <td> carrying a marker:', len(re.findall(r'<td[^>]*(?:jesus2099\w*|treleases)', html)))
    print()
