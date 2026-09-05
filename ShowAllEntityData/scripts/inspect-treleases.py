"""Extract <td class="treleases"> cells and the table's thead from a debug snapshot."""
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'debug/work-rec.html'
html = open(path, encoding='utf-8', errors='replace').read()

print(f'--- {path}: {len(html)} bytes ---\n')

# Full <td ... class="treleases" ...> ... </td> blocks
tds = re.findall(r'<t[dh][^>]*class="treleases"[^>]*>.*?</t[dh]>', html, re.S)
print(f'treleases cells found: {len(tds)}')
for t in tds[:6]:
    print('  ', t[:400].replace('\n', ' '))

print()
# First thead of any table.tbl
for m in re.finditer(r'<thead.*?</thead>', html, re.S):
    print('--- thead ---')
    print(m.group(0)[:2500])
    break

print()
# Any M:SS.mmm text anywhere
ms = re.findall(r'\b\d{1,2}:\d{2}\.\d{3}\b', html)
print(f'M:SS.mmm occurrences: {len(ms)} -> {ms[:10]}')
plain = re.findall(r'>\s*(\d{1,2}:\d{2})\s*<', html)
print(f'bare M:SS occurrences: {len(plain)} -> {plain[:10]}')
