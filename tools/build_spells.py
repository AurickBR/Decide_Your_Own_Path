#!/usr/bin/env python3
"""Rebuild the SPELLS data in character-builder-2.html from the SRD 5.2.1 corpus.

Idempotent: it strips the generated fields and regenerates them, so it is safe to re-run
whenever the SRD corpus is updated. It touches ONLY the `const SPELLS=[...]` array — the
CSS and the render code around it are ordinary source and are left alone.

    python3 tools/build_spells.py [path/to/spells.md] [path/to/character-builder-2.html]

SRD 5.2.1 Markdown (CC BY 4.0): https://github.com/downfallx/dnd-5e-srd-markdown
"""
import re, json, sys, os, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from srd_convert import convert, header_meta

SRD_MD  = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'srd-spells.md')
BUILDER = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', 'character-builder-2.html')
PHB_LIST = os.path.join(HERE, 'phb-2024-spells.json')   # 5etools sublist export

GENERATED = ('d', 'ct', 'rg', 'cp', 'du', 'nb', 'bk')

# This system's magic sources, mapped from the D&D classes the SRD names.
CLS = {'Wizard':'Arcane','Sorcerer':'Arcane','Cleric':'Religion','Paladin':'Religion',
       'Druid':'Nature','Ranger':'Nature','Warlock':'History','Bard':'Performance','Artificer':'Craft'}

# Renamed in the 2024 rules. Mirrored by SPELL_RENAMES in the builder's migrate().
RENAME = {'Feeblemind': 'Befuddlement'}

# SRD spells that belong in the list.
ADD = ['Antilife Shell','Floating Disk','Hideous Laughter','Transport via Plants','Tsunami','Vitriolic Sphere']

# Spells in neither the SRD nor the 2024 PHB. We cannot reproduce their text and cannot cite a
# PHB page, but we can name the book. Each verified individually against dnd5e.wikidot.com.
BOOKS = {
    'Blade of Disaster'  : "Tasha's Cauldron of Everything",
    'Find Greater Steed' : "Xanathar's Guide to Everything",
    'Invulnerability'    : "Xanathar's Guide to Everything",
    'Mass Polymorph'     : "Xanathar's Guide to Everything",
    'Psychic Scream'     : "Xanathar's Guide to Everything",
    'Shadow Blade'       : "Xanathar's Guide to Everything",
}

def load_srd(path):
    text = open(path, encoding='utf-8').read()
    out = {}
    for chunk in re.split(r'^#### ', text, flags=re.M)[1:]:
        lines = chunk.split('\n')
        body = '\n'.join(lines[1:]).strip()
        if re.search(r'^_(?:Level \d|.+ Cantrip)', body, re.M):   # skip stat-block sub-headings
            out[lines[0].strip()] = body
    return out

def main():
    srd  = load_srd(SRD_MD)
    html = open(BUILDER, encoding='utf-8', newline='').read()
    m = re.search(r'const SPELLS=(\[.*?\]);', html, re.S)
    if not m: sys.exit('could not find the SPELLS array')
    spells = json.loads(m.group(1))

    # back to the hand-maintained fields only
    for x in spells:
        for k in GENERATED: x.pop(k, None)
        x['n'] = RENAME.get(x['n'], x['n'])

    have = {x['n'] for x in spells}
    for n in ADD:
        if n in have: continue
        lvl, sch, classes = header_meta(srd[n])
        src = []
        for c in classes:
            s = CLS.get(c)
            if s and s not in src: src.append(s)
        spells.append({'n': n, 'l': lvl, 'sc': sch, 'src': src or ['Arcane']})

    norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
    phb = set()
    if os.path.exists(PHB_LIST):
        raw = json.load(open(PHB_LIST, encoding='utf-8'))
        phb = {norm(urllib.parse.unquote(i['h'].rsplit('_', 1)[0])) for i in raw['items']}

    counts = {'srd': 0, 'phb': 0, 'other': 0}
    for x in spells:
        n = x['n']
        if n in srd:
            x['l'], x['sc'], _ = header_meta(srd[n])      # the SRD is authoritative
            stats, body = convert(srd[n])
            x['ct'], x['rg'] = stats['Casting Time'], stats['Range']
            x['cp'], x['du'] = stats['Components'],   stats['Duration']
            x['d'] = body
            counts['srd'] += 1
        elif norm(n) in phb:
            x['nb'] = 1                                   # 2024 PHB, not free to reproduce
            counts['phb'] += 1
        else:
            x['nb'] = 2                                   # neither; name the book if we know it
            if n in BOOKS: x['bk'] = BOOKS[n]
            counts['other'] += 1

    spells.sort(key=lambda x: x['n'])
    data = json.dumps(spells, ensure_ascii=False, separators=(',', ':'))
    html = html[:m.start()] + 'const SPELLS=' + data + ';' + html[m.end():]
    open(BUILDER, 'w', encoding='utf-8', newline='').write(html)

    missing = [x['n'] for x in spells if x.get('nb') == 2 and not x.get('bk')]
    print('spells: %d   SRD text: %d   PHB-only: %d   other books: %d'
          % (len(spells), counts['srd'], counts['phb'], counts['other']))
    print('data: %.0f KB' % (len(data) / 1024))
    if missing: print('WARNING — no sourcebook recorded for: %s' % ', '.join(missing))

if __name__ == '__main__':
    main()
