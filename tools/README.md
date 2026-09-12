# tools — regenerating the SRD-derived data

`character-builder-2.html` carries spell descriptions for every spell covered by the
**System Reference Document 5.2.1**, used under **CC BY 4.0**. Spells the SRD does not cover
carry a pointer to the book they came from, and never their text.

## Spells — the three buckets

| | Count | Carries |
|---|---|---|
| In SRD 5.2.1 | 340 | Full text + stat block |
| 2024 *Player's Handbook* only — `nb:1` | 43 | "Look it up in the Player's Handbook (2024)" |
| In neither — `nb:2` + `bk` | 6 | The sourcebook it came from |

The last six are named explicitly, each verified individually:

| Spell | Sourcebook |
|---|---|
| Blade of Disaster | *Tasha's Cauldron of Everything* |
| Find Greater Steed | *Xanathar's Guide to Everything* |
| Invulnerability | *Xanathar's Guide to Everything* |
| Mass Polymorph | *Xanathar's Guide to Everything* |
| Psychic Scream | *Xanathar's Guide to Everything* |
| Shadow Blade | *Xanathar's Guide to Everything* |

No *Player's Handbook* page can be cited for these — they predate the 2024 revision — so the app
names the book and says plainly that the spell is not in the 2024 PHB. If you would rather have
them playable in full, rewrite each as homebrew in your own words; that also makes them yours.

## Where the spell text comes from

- `srd-spells.md` — the spell chapter of the SRD 5.2.1 in Markdown, CC BY 4.0, vendored here so a
  fork can regenerate without hunting for it. Upstream:
  <https://github.com/downfallx/dnd-5e-srd-markdown>
- `phb-2024-spells.json` — a 5etools sublist export, used **only** to decide which spells appear in
  the 2024 *Player's Handbook*. No text is read from it.
- Official SRD source and licence: <https://www.dndbeyond.com/srd>

## Changes made to the SRD material

CC BY 4.0 requires that modifications be indicated. They are:

1. The D&D class list on each spell's header line was **dropped** — this system uses its own magic
   sources (Arcane, Nature, Religion, History, Performance, Craft), not D&D classes.
2. The text was **converted from Markdown to HTML**. No wording was altered.
3. Spell level and school are taken from the SRD, which is treated as authoritative. Two entries in
   the old list disagreed with it and were corrected: Divine Smite (Transmutation → Evocation) and
   Glibness (Transmutation → Enchantment).
4. `Feeblemind` was renamed to its 2024 name, `Befuddlement`. The builder's `migrate()` carries
   existing saves over.
5. Six SRD spells missing from the list were added: Antilife Shell, Floating Disk, Hideous Laughter,
   Transport via Plants, Tsunami, Vitriolic Sphere.

## Conditions

`character-builder-2.html` also carries the fifteen conditions from the SRD 5.2.1 **rules
glossary**, plus the two this system adds, matching Encounter Control's list of 17 exactly (a test
asserts that the two lists agree).

| | Count | Carries |
|---|---|---|
| SRD 5.2.1 conditions | 15 | Full rules text, CC BY 4.0 |
| This system's own — `hb:1` | 2 | Concentrating, Raging. No invented rules text: each points at the thing that causes it |

**Exhaustion is marked `lvl:1`** and is deliberately *not* one of the on/off toggles — it is
level-based and lives on its own bar, so there is one source of truth for it. Its rules text is
reachable from that bar instead. See `claude/EXHAUSTION_RULE.md`.

Conditions are **tracked and displayed only** — nothing about them touches a roll. Most of them
grant Advantage or Disadvantage on attack rolls, and this system has no to-hit roll (see
`claude/ATTACK_RULE.md`), so how they bite is the table's call. `test/conditions.test.js` has a
block that asserts exactly this: four conditions active must change a skill check by nothing.

Source: `srd-rules-glossary.md` — the full SRD 5.2.1 rules glossary, vendored. The build extracts
every `#### … [Condition]` heading, so the other glossary entries are available for later work.

## Regenerating

    python3 tools/build_spells.py        # rebuilds const SPELLS=[…]
    python3 tools/build_conditions.py    # rebuilds const CONDITIONS=[…]

Each defaults to its vendored source and `../character-builder-2.html`; both paths can be passed as
arguments. Both are **idempotent** — they strip and rebuild the generated data, so re-running is
safe and produces byte-identical output. Each touches **only** its own array; the CSS and render
code around them are ordinary source and are left alone, so the UI survives a rebuild.

Then verify:

    node test/spells.test.js
    node test/conditions.test.js

`srd_convert.py` turns one spell's Markdown into HTML. Nothing from the source is passed through as
markup: every scrap of text is escaped first and the only tags in the output are ones the converter
emits — `p`, `em`, `strong`, `ul`, `li`, `h4`, `table`, `thead`, `tbody`, `tr`, `th`, `td`.

## The test is the licence guard

`test/spells.test.js` asserts that no non-SRD spell carries `d`, `ct`, `rg`, `cp` or `du`, that
every spell sits in exactly one bucket, that every `nb:2` spell names a sourcebook, and that
descriptions contain only the eleven expected tags. `test/conditions.test.js` does the same for
conditions and additionally checks that a hostile condition name from an imported save is escaped
rather than rendered. **If one of those fails, the build is reproducing text it has no licence to
reproduce, or an import can inject markup.** Treat a failure there as a release blocker, not a test
to adjust.
