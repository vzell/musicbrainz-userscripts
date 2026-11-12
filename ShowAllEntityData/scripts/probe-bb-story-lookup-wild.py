#!/usr/bin/env python3
"""Phase 12 (org/brucebase.org): does ListPages' `name` take a trailing
wildcard ("<slug>*"), so a story page whose name Wikidot cut short
(story:speech-2026-10-17-hackensack-meridian-health-theatre-r) still finds
its event; and what a date-only wildcard ("2026-10-17*") lists. Signed out,
1 s apart.

    python3 scripts/probe-bb-story-lookup-wild.py
"""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('lookup', os.path.join(HERE, 'probe-bb-story-lookup.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
TPL = '%%fullname%%␂%%title%%␃'
CATS = 'gig nogig recording rehearsal interview'
for name in ['2026-10-17-hackensack-meridian-health-theatre-r*', '2026-10-17*', '1978-09-15-palladium-new-york-city-ny*', '1978-09-15*']:
    b, t = mod.post({'category': CATS, 'name': name, 'perPage': 10, 'separate': 'false', 'module_body': TPL})
    print(f'name={name}: {mod.items(b) or b[:160]!r} ({t:.1f} s)')
