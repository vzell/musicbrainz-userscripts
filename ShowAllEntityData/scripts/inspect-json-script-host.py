"""Identify the host element/attributes of each application/json script."""
import re
import sys

path = sys.argv[1]
html = open(path, encoding='utf-8', errors='replace').read()

for m in re.finditer(r'<script[^>]*type="application/json"[^>]*>', html):
    start = m.start()
    tag = m.group(0)
    # 300 chars of context before
    before = html[max(0, start - 300):start]
    body_start = m.end()
    body_head = html[body_start:body_start + 220]
    print('TAG   :', tag[:200])
    print('BEFORE:', before[-200:].replace('\n', ' '))
    print('BODY  :', body_head.replace('\n', ' '))
    print('-' * 100)
