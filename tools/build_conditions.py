#!/usr/bin/env python3
"""Rebuild the CONDITIONS data in character-builder-2.html from the SRD 5.2.1 rules glossary.

Idempotent: replaces the `const CONDITIONS=[...]` array if present, inserts it before
`const SPELLS=` otherwise. Touches only that array.

    python3 tools/build_conditions.py [path/to/srd-rules-glossary.md] [path/to/character-builder-2.html]

SRD 5.2.1 Markdown (CC BY 4.0): https://github.com/downfallx/dnd-5e-srd-markdown
"""
import re, json, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from srd_convert import convert

GLOSSARY = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'srd-rules-glossary.md')
BUILDER  = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', 'character-builder-2.html')

# Encounter Control's list carries two conditions the SRD does not define. They get no invented
# rules text — each points at the thing in this system that causes it.
HOMEBREW = [
    {'n': 'Concentrating',
     'd': '<p>You are sustaining a spell or ability that requires concentration. '
          'Its own description says what breaks it and what happens when it ends.</p>',
     'hb': 1},
    {'n': 'Raging',
     'd': '<p>You are in a rage. See the <em>Rage</em> talent for what it grants and what ends it.</p>',
     'hb': 1},
]

# level-based rather than on/off: tracked by the Exhaustion bar, not the condition toggles
LEVELLED = {'Exhaustion'}

def main():
    text = open(GLOSSARY, encoding='utf-8').read()
    srd = []
    for chunk in re.split(r'^#### ', text, flags=re.M)[1:]:
        lines = chunk.split('\n')
        head = lines[0].strip()
        if not head.endswith('[Condition]'):
            continue
        name = head.replace('[Condition]', '').strip()
        _, body = convert('\n'.join(lines[1:]).strip())
        entry = {'n': name, 'd': body}
        if name in LEVELLED:
            entry['lvl'] = 1
        srd.append(entry)
    if not srd:
        sys.exit('no [Condition] entries found in %s' % GLOSSARY)

    conds = sorted(srd + HOMEBREW, key=lambda c: c['n'])
    data = json.dumps(conds, ensure_ascii=False, separators=(',', ':'))

    html = open(BUILDER, encoding='utf-8', newline='').read()
    block = 'const CONDITIONS=' + data + ';\n'
    m = re.search(r'const CONDITIONS=\[.*?\];\n?', html, re.S)
    if m:
        html = html[:m.start()] + block + html[m.end():]
    else:
        i = html.index('const SPELLS=')
        note = ('/* Conditions. Entries carrying a description reproduce the condition from the System\n'
                '   Reference Document 5.2.1, used under CC BY 4.0 — see legal.html. Changes were made: the\n'
                '   text was converted from Markdown to HTML; no wording was altered. Concentrating and\n'
                '   Raging are this system\'s own and carry no SRD text. Exhaustion is marked lvl:1 — it is\n'
                '   tracked by its own level bar rather than as an on/off toggle. */\n')
        html = html[:i] + note + block + html[i:]
    open(BUILDER, 'w', encoding='utf-8', newline='').write(html)

    print('conditions: %d  (SRD %d, homebrew %d)  %.1f KB'
          % (len(conds), len(srd), len(HOMEBREW), len(data) / 1024))
    print('level-based:', ', '.join(c['n'] for c in conds if c.get('lvl')) or 'none')

if __name__ == '__main__':
    main()
