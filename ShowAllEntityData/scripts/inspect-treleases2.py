"""Print the full text content of the first few treleases cells + the Length <th>."""
import re
import sys
from html import unescape

path = sys.argv[1] if len(sys.argv) > 1 else 'debug/work-rec.html'
html = open(path, encoding='utf-8', errors='replace').read()

def text_of(frag):
    return unescape(re.sub(r'<[^>]+>', '', frag)).strip()

tds = re.findall(r'<td[^>]*class="treleases"[^>]*>.*?</td>', html, re.S)
print(f'treleases <td> count: {len(tds)}')
for t in tds[:8]:
    print('  text =', repr(text_of(t)))

print()
ths = re.findall(r'<th[^>]*data-col-name="([^"]*)"', html)
print('column names:', ths[:40])

print()
# does any th carry treleases?
for m in re.finditer(r'<th[^>]*treleases[^>]*>', html):
    print('treleases th:', m.group(0)[:300])
