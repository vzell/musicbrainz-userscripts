"""Confirm WS2 recording-rels payload shape: relations[].recording.length in ms."""
import json
import sys

data = json.load(open(sys.argv[1], encoding='utf-8'))
rels = data.get('relations', [])
print(f'title={data.get("title")!r}  relations={len(rels)}')
with_rec = [r for r in rels if r.get('recording')]
print(f'relations carrying .recording: {len(with_rec)}')
for r in with_rec[:8]:
    rec = r['recording']
    ms = rec.get('length')
    if ms:
        m, s = divmod(ms // 1000, 60)
        disp = f'{m}:{s:02d}.{ms % 1000:03d}'
    else:
        disp = '?:??'
    print(f'  {rec.get("id")}  length={ms!r:>9}  -> {disp:<12} {rec.get("title")!r}')
missing = [r for r in with_rec if not r['recording'].get('length')]
print(f'\nrecordings with no length: {len(missing)}')
print('recording keys:', sorted(with_rec[0]['recording'].keys()) if with_rec else '-')
