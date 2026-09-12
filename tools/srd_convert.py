"""Convert SRD 5.2.1 spell markdown -> safe HTML for the character builder.

Nothing from the source is passed through as markup. Every scrap of text is escaped
first; the only tags in the output are ones this file emits.
"""
import re, html, json

SCHOOLS = 'Abjuration Conjuration Divination Enchantment Evocation Illusion Necromancy Transmutation'.split()
STAT_KEYS = ('Casting Time', 'Range', 'Components', 'Duration')
# the SRD text is inconsistent: some entries write "Component:" in the singular
STAT_ALIAS = {'Component': 'Components'}

def esc(t):
    return html.escape(t, quote=True)

def inline(t):
    """***x*** / **x** / *x* / _x_ -> strong/em, everything else escaped."""
    out, i = [], 0
    pat = re.compile(r'\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|_(.+?)_', re.S)
    for m in pat.finditer(t):
        out.append(esc(t[i:m.start()]))
        bi, b, i1, i2 = m.groups()
        if bi is not None:   out.append('<strong><em>%s</em></strong>' % esc(bi))
        elif b is not None:  out.append('<strong>%s</strong>' % esc(b))
        else:                out.append('<em>%s</em>' % esc(i1 if i1 is not None else i2))
        i = m.end()
    out.append(esc(t[i:]))
    return ''.join(out)

CELL = re.compile(r'<(t[hd])(\s[^>]*)?>(.*?)</\1>', re.S | re.I)
ROW  = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S | re.I)
SPAN = re.compile(r'colspan="(\d+)"', re.I)

def table(block):
    """Re-emit a table from parsed cells. Source tags are discarded, not trusted."""
    head, body = [], []
    thead = re.search(r'<thead[^>]*>(.*?)</thead>', block, re.S | re.I)
    tbody = re.search(r'<tbody[^>]*>(.*?)</tbody>', block, re.S | re.I)
    def rows(chunk):
        out = []
        for r in ROW.finditer(chunk or ''):
            cells = []
            for c in CELL.finditer(r.group(1)):
                tag, attrs, text = c.group(1).lower(), c.group(2) or '', c.group(3)
                cs = SPAN.search(attrs)
                cells.append((tag, int(cs.group(1)) if cs else 1, inline(text.strip())))
            if cells: out.append(cells)
        return out
    head = rows(thead.group(1) if thead else '')
    body = rows(tbody.group(1) if tbody else (block if not thead else ''))
    def emit(rs, dflt):
        h = ''
        for cells in rs:
            h += '<tr>'
            for tag, span, text in cells:
                tag = tag if tag in ('th', 'td') else dflt
                h += '<%s%s>%s</%s>' % (tag, ' colspan="%d"' % span if span > 1 else '', text, tag)
            h += '</tr>'
        return h
    out = '<table class="sp-tbl">'
    if head: out += '<thead>' + emit(head, 'th') + '</thead>'
    if body: out += '<tbody>' + emit(body, 'td') + '</tbody>'
    return out + '</table>'

def convert(body):
    """-> (stats dict, html string)"""
    # pull the tables out first so blank-line splitting can't cut them in half
    tables, kept = [], body
    for m in re.finditer(r'<table[^>]*>.*?</table>', body, re.S | re.I):
        tables.append(m.group(0))
        kept = kept.replace(m.group(0), '\x00TABLE%d\x00' % (len(tables) - 1))

    stats, parts = {}, []
    for block in re.split(r'\n\s*\n', kept):
        block = block.strip()
        if not block:
            continue
        if block.startswith('\x00TABLE'):
            parts.append(table(tables[int(block[6:-1])]))
            continue
        lines = [l.strip() for l in block.split('\n') if l.strip()]

        # the "_Level 2 Abjuration (Bard, Cleric)_" header line
        if len(lines) == 1 and re.match(r'^_(?:Level \d|.+ Cantrip)', lines[0]):
            continue
        # "**Casting Time:** Action" — one per line. In some entries the body's first
        # paragraph follows with no blank line, so consume the leading stat lines and
        # let whatever remains fall through as prose.
        while lines and re.match(r'^\*\*([^*]+):\*\*', lines[0]) \
              and STAT_ALIAS.get(re.match(r'^\*\*([^*]+):\*\*', lines[0]).group(1).strip(),
                                 re.match(r'^\*\*([^*]+):\*\*', lines[0]).group(1).strip()) in STAT_KEYS:
            k, v = re.match(r'^\*\*([^*]+):\*\*\s*(.*)$', lines.pop(0)).groups()
            k = k.strip(); stats[STAT_ALIAS.get(k, k)] = v.strip()
        if not lines:
            continue
        if all(re.match(r'^[-*] ', l) for l in lines):
            parts.append('<ul>' + ''.join('<li>%s</li>' % inline(l[2:]) for l in lines) + '</ul>')
            continue
        if lines[0].startswith('#'):
            parts.append('<h4>%s</h4>' % inline(lines[0].lstrip('# ').strip()))
            rest = lines[1:]
            if rest: parts.append('<p>%s</p>' % inline(' '.join(rest)))
            continue
        parts.append('<p>%s</p>' % inline(' '.join(lines)))
    return stats, ''.join(parts)

def header_meta(body):
    line = re.search(r'^_(.+?)_\s*$', body, re.M).group(1)
    lvl = 0 if 'Cantrip' in line else int(re.search(r'Level (\d)', line).group(1))
    sch = next((s for s in SCHOOLS if s in line), '?')
    cls = re.search(r'\(([^)]*)\)', line)
    return lvl, sch, [c.strip() for c in cls.group(1).split(',')] if cls else []
