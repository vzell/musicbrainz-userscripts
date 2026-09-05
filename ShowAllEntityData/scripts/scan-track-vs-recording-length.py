"""Do track.length and track.recording.length ever differ on real MB release pages?

Scans every debug snapshot that carries MusicBrainz's embedded release JSON and
reports, per release, how many tracks disagree with their recording's length.
"""
import glob
import json
import re

pat = re.compile(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', re.S)


def ms(v):
    if v is None:
        return '?:??'
    m, s = divmod(v // 1000, 60)
    return f'{m}:{s:02d}.{v % 1000:03d}'


for path in sorted(glob.glob('debug/*.html')):
    try:
        html = open(path, encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    if '"mediums"' not in html:
        continue
    for blob in pat.findall(html):
        if '"mediums"' not in blob:
            continue
        try:
            rel = (json.loads(blob) or {}).get('release') or {}
        except Exception:
            continue
        mediums = rel.get('mediums') or []
        if not mediums:
            continue
        total = same = diff = 0
        examples = []
        for med in mediums:
            for tr in (med.get('tracks') or []):
                rec = tr.get('recording') or {}
                tl, rl = tr.get('length'), rec.get('length')
                total += 1
                if tl == rl:
                    same += 1
                else:
                    diff += 1
                    if len(examples) < 4:
                        delta = (tl - rl) if (tl is not None and rl is not None) else None
                        examples.append(
                            f'{tr.get("number")}. {tr.get("name")!r} track={ms(tl)} rec={ms(rl)}'
                            + (f' delta={delta:+d}ms' if delta is not None else '')
                        )
        flag = '  <<< DIFFERS' if diff else ''
        print(f'{path:<42} {rel.get("name")!r:<38} tracks={total:<4} same={same:<4} diff={diff:<4}{flag}')
        for e in examples:
            print(f'    {e}')
        break
