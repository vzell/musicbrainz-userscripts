#!/usr/bin/env python3
"""Dump the Google Takeout of the "Brucebase Wiki" Google Chat space to a plain transcript.

Usage:
    python3 scripts/dump-bb-chat.py [--src DIR] [--out FILE]

Reads DIR/messages.json (Google Takeout, Google Chat "Groups" export; default
debug/google-space-AAAAeGPY3Qo) and writes one line per message: the time in
UTC as Takeout gives it ("[YYYY-MM-DD HH:MM]", empty for an edited message
Takeout stores without a date), a short author name, the text; a quoted reply
and the attached files' names follow on indented lines. Membership notices
("Updated room membership.", "Space Updated") are dropped. Default output:
debug/brucebase-chat/chat.txt. debug/ is not in git: the transcript names the
space's members. Read-only on the input; no network.
Written 2026-11-24 (vzell: "read the Google Takeout export of the BruceBase
chat … and check Dannys answers"), for org/brucebase-chat.org.
"""
import argparse
import json
import os
from datetime import datetime

SHORT = {
    'Volker Zell': 'VZ',
    'Danny van der Linden': 'DANNY',
    'Brucebase Wiki': 'BBWIKI',
    'Jacob R.': 'JACOB',
    'Pete Russell': 'PETE',
    'Richard Tayson': 'RICHARD',
}
NOISE = {'Updated room membership.', 'Space Updated'}


def when(raw):
    """Return Takeout's "Friday, May 7, 2021 at 11:34:12 PM UTC" as "2021-05-07 23:34", or raw."""
    try:
        text = raw.replace(' UTC', '').replace(' ', ' ')
        return datetime.strptime(text, '%A, %B %d, %Y at %I:%M:%S %p').strftime('%Y-%m-%d %H:%M')
    except ValueError:
        return raw


def main():
    """Read the export, write the transcript, print the message count."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='debug/google-space-AAAAeGPY3Qo')
    ap.add_argument('--out', default='debug/brucebase-chat/chat.txt')
    args = ap.parse_args()
    with open(os.path.join(args.src, 'messages.json'), encoding='utf-8') as f:
        data = json.load(f)
    lines = []
    for m in data['messages']:
        text = m.get('text', '')
        if text in NOISE:
            continue
        name = m.get('creator', {}).get('name', '?')
        line = '[{}] {}: {}'.format(when(m.get('created_date', '')), SHORT.get(name, name), text)
        quoted = m.get('quoted_message_metadata', {}).get('text')
        if quoted:
            line += '\n    (quoting: {})'.format(quoted[:200])
        files = [a.get('export_name') or a.get('name') for a in m.get('attached_files', [])]
        if files:
            line += '\n    [files: {}]'.format(', '.join(str(x) for x in files))
        lines.append(line)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print('{} messages -> {}'.format(len(lines), args.out))


if __name__ == '__main__':
    main()
