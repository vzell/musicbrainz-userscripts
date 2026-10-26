#!/usr/bin/env python3
"""Generate `_J2_EDIT_TYPES` from jesus2099's SUPER MIND CONTROL II X TURBO.

The "Entity history" presets of the ☰ SAED menu and of the popup window's
"✎ Editing history ▾" (vzell, 2026-10-26: "all jesus2099 variants") repeat the
refined searches of SMC's COOL_SEARCH_LINKS. Those rest on per-entity lists of
edit types and relationship link types in its `entitySpecificEdits()`. This
reads that function from a copy of the script and prints the lists as one JS
object literal, so the userscript carries them verbatim rather than retyped.

Source: https://github.com/jesus2099/konami-command/raw/master/mb_SUPER-MIND-CONTROL-II-X-TURBO.user.js
(read 2026-10-26, its @version 2026.10.14).

Usage: python3 -I scripts/gen-j2-edit-types.py <smc.user.js>  > snippet.js
"""
import re
import sys
from pathlib import Path


def parse(src):
    """Read the lists out of `entitySpecificEdits()`.

    @param {str} src - the SMC userscript
    @returns {dict} {mode: {entityType: {'edit': [str], 'link': [int]}}}
    """
    start = src.index('function entitySpecificEdits(')
    end = src.index('if (editTypes.length > 0 || linkTypes.length > 0)', start)
    body = src[start:end]
    out = {}
    mode = None
    kind = None
    for line in body.split('\n'):
        m = re.search(r'if \(searchMode\.match\(/(\w+)/\)\)', line)
        if m:
            mode = m.group(1)
            out[mode] = {}
            continue
        m = re.search(r'case "(\w+)":', line)
        if m and mode:
            kind = m.group(1)
            out[mode].setdefault(kind, {'edit': [], 'link': []})
            continue
        for m in re.finditer(r'editTypes\.push\("([\d,]+)"\)', line):
            out[mode][kind]['edit'].extend(m.group(1).split(','))
        m = re.search(r'linkTypes\.push\(([\d,\s]+)\)', line)
        if m:
            out[mode][kind]['link'].extend(int(x) for x in m.group(1).replace(' ', '').split(','))
    return out


def wrap(name, nums, indent):
    """Format one `name: [..],` array, wrapped under 110 columns.

    @param {str} name - the property name
    @param {list} nums - the numbers
    @param {int} indent - the property's indentation in spaces
    @returns {list} source lines
    """
    pad = ' ' * indent
    head = f'{pad}{name}: ['
    one = head + ', '.join(str(x) for x in nums) + '],'
    if len(one) <= 110:
        return [one]
    lines = [head]
    cur = pad + '    '
    for i, x in enumerate(nums):
        item = f'{x},' if i < len(nums) - 1 else f'{x}'
        if len(cur) + len(item) + 1 > 110:
            lines.append(cur.rstrip())
            cur = pad + '    '
        cur += item + ' '
    lines.append(cur.rstrip())
    lines.append(pad + '],')
    return lines


def js(data):
    """Format the lists as the userscript's object literal.

    @param {dict} data - parse()'s result
    @returns {str} JavaScript source, 4-space indented, inside the IIFE
    """
    lines = ['    const _J2_EDIT_TYPES = {']
    for mode in ('pure', 'cover', 'relationship'):
        lines.append(f'        {mode}: {{')
        for kind, v in data.get(mode, {}).items():
            lines.append(f'            {kind}: {{')
            lines.extend(wrap('edit', [int(x) for x in v['edit']], 16))
            if v['link']:
                lines.extend(wrap('link', v['link'], 16))
            lines.append('            },')
        lines.append('        },')
    lines.append('    };')
    return '\n'.join(lines)


def main():
    """Print the generated literal."""
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    print(js(parse(Path(sys.argv[1]).read_text(encoding='utf-8'))))


if __name__ == '__main__':
    main()
