"""Button says seconds, cells still show milliseconds — what state is the DOM actually in?"""
import re

html = open('debug/shooting-location-bug.html', encoding='utf-8', errors='replace').read()
print(f'bytes: {len(html)}')

for m in re.finditer(r'<span class="mb-ms-col-hdr-btn"[^>]*>', html):
    print('BUTTON:', m.group(0))

print()
for m in re.finditer(r'<t[dh][^>]*data-mb-ms[^>]*>', html):
    print('CELL  :', m.group(0)[:260])

print()
print('data-mb-ms=      :', len(re.findall(r'data-mb-ms=', html)))
print('data-mb-ms-shown=:', len(re.findall(r'data-mb-ms-shown=', html)))
print('data-mb-sec-text=:', len(re.findall(r'data-mb-sec-text=', html)))

# what does the Length cell actually render?
i = html.find('data-col-name="Length"')
if i != -1:
    print()
    print('Length <th> ...', html[html.rfind('<th', 0, i):i + 160][:300])
for m in re.finditer(r'<td[^>]*data-mb-ms=[^>]*>(.*?)</td>', html, re.S):
    txt = re.sub(r'<[^>]+>', '', m.group(1)).strip()
    print('rendered cell text:', repr(txt))
