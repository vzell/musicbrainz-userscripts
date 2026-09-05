"""Every element with a yellow text-shadow: does it also carry a jesus2099 marker?"""
import re

for path in ('debug/work-rec.html', 'debug/therising.html', 'debug/tracklist-single-medium.html'):
    html = open(path, encoding='utf-8', errors='replace').read()
    tags = re.findall(r'<(\w+)([^>]*text-shadow[^>]*)>', html)
    print(f'=== {path} — {len(tags)} element(s) with text-shadow')
    with_marker = without = 0
    samples = []
    for tag, attrs in tags:
        has = bool(re.search(r'jesus2099|treleases', attrs))
        if has:
            with_marker += 1
        else:
            without += 1
            if len(samples) < 3:
                samples.append(f'<{tag}{attrs[:180]}>')
    print(f'    carrying a marker: {with_marker}   NOT carrying one: {without}')
    for s in samples:
        print('    no-marker sample:', s)
    print()
