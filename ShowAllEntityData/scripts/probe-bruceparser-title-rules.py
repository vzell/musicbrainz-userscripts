#!/usr/bin/env python3
"""Check two of BruceParser eefyp.sh's title rules against every event page.

eefyp.sh compares a YEAR page's heading with the DETAIL page's title after:
  1. moving "(The|Le|De)" to the front:   (.*) \\((The|Le|De)\\)(.*)   — greedy;
  2. dropping a show suffix:              (.*) \\((Early|Late|…)\\)    — and
     everything after it.
This probe lists the event titles where those rules do something other than
what they mean: more than one "(The)", a "(The)" whose comma part is not the
first one, and a show suffix that is not at the end.

Usage: python3 scripts/probe-bruceparser-title-rules.py [MIRROR_DIR]
"""

import os
import re
import sys

TITLE_RE = re.compile(r'<div id="page-title">\s*(.*?)\s*</div>', re.S)
KINDS = ('gig', 'nogig', 'recording', 'rehearsal', 'interview', 'nobruce', 'onstage', 'offstage', 'soundcheck')
THE_RE = re.compile(r'\((The|Le|De)\)')
SFX_RE = re.compile(r' \((Early|Late|First|Second|Third|Morning|Afternoon|Evening|Soundcheck)\)')


def bash_the(title):
    """eefyp.sh's rule 1 as Bash's [[ =~ ]] (POSIX ERE, greedy) does it."""
    m = re.match(r'([0-9]{4}-[0-9]{2}-[0-9]{2}) (.*) \((The|Le|De)\)(.*)', title)
    return f'{m.group(1)} {m.group(3)} {m.group(2)}{m.group(4)}' if m else title


def meant_the(title):
    """What rule 1 means: each "(The)" to the front of ITS comma part."""
    m = re.match(r'([0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?) (.*)', title)
    if not m:
        return title
    parts = [p.strip() for p in m.group(2).split(',')]
    out = []
    for p in parts:
        t = THE_RE.search(p)
        out.append(f'{t.group(1)} {THE_RE.sub("", p).strip()}' if t else p)
    return f'{m.group(1)} ' + ', '.join(out)


def main(argv):
    """Print the titles each rule gets wrong."""
    mirror = argv[0] if argv else os.path.expanduser('~/git/scripts/BruceParser/bb/latest')
    titles = []
    for kind in KINDS:
        d = os.path.join(mirror, kind)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            with open(os.path.join(d, name), encoding='utf-8', errors='replace') as fh:
                m = TITLE_RE.search(fh.read())
            if m:
                titles.append((f'{kind}:{name[len(kind) + 1:-5]}', re.sub(r'<[^>]+>', '', m.group(1)).strip()))
    print(f'event titles read: {len(titles):,}')
    multi = [(r, t) for r, t in titles if len(THE_RE.findall(t)) > 1]
    differ = [(r, t, bash_the(t), meant_the(t)) for r, t in titles
              if THE_RE.search(t) and bash_the(t).lower() != meant_the(t).lower() and len(THE_RE.findall(t)) <= 1]
    sfx_mid = [(r, t) for r, t in titles if SFX_RE.search(t) and not re.search(SFX_RE.pattern + r'$', t)]
    # The per-part fix moves an article only at the END of its comma part.
    not_end = [(r, t) for r, t in titles
               if any(THE_RE.search(p) and not re.search(r'\((The|Le|De)\)\s*$', p) for p in t.split(','))]
    print(f'\n1c. an article not at the end of its comma part (the per-part rule would leave it): {len(not_end)}')
    for r, t in not_end[:10]:
        print(f'    {t}   [{r}]')
    print(f'\n1a. more than one (The|Le|De): {len(multi)}')
    for r, t in multi[:10]:
        print(f'    {t}   [{r}]')
    print(f'\n1b. one (The|Le|De), but the greedy rule moves it in front of more than its own comma part: {len(differ)}')
    for r, t, b, w in differ[:12]:
        print(f'    {t}\n       bash:  {b}\n       meant: {w}')
    print(f'\n2. a show suffix that is not at the end (eefyp.sh drops what follows it): {len(sfx_mid)}')
    for r, t in sfx_mid[:12]:
        print(f'    {t}   [{r}]')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
