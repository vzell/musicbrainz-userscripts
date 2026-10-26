#!/usr/bin/env python3
"""Put scripts/gen-j2-edit-types.py's output into the userscript.

Replaces the `__J2_EDIT_TYPES__` placeholder line on the first run, or the
existing `const _J2_EDIT_TYPES = { … };` block on a later one (a newer SMC
version), so the literal is only ever written by the generator.

Usage: python3 -I scripts/insert-j2-edit-types.py <snippet.js>
"""
import re
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / 'ShowAllEntityData.user.js'


def main():
    """Replace the placeholder or the old block with the snippet."""
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    snippet = Path(sys.argv[1]).read_text(encoding='utf-8').rstrip('\n')
    text = SCRIPT.read_text(encoding='utf-8')
    if text.count('__J2_EDIT_TYPES__\n') == 1:
        text = text.replace('__J2_EDIT_TYPES__\n', snippet + '\n')
    else:
        text, n = re.subn(r'    const _J2_EDIT_TYPES = \{\n.*?\n    \};\n', lambda _m: snippet + '\n', text, count=1, flags=re.S)
        if n != 1:
            sys.exit('neither the placeholder nor the block was found')
    SCRIPT.write_text(text, encoding='utf-8')
    print('ok')


if __name__ == '__main__':
    main()
