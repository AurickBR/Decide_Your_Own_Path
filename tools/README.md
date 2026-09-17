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

**Both** `character-builder-2.html` and `encounter-control.html` carry the fifteen conditions from
the SRD 5.2.1 **rules glossary**, plus the two this system adds. One script writes both files, so
the two tools cannot drift apart — and a test still asserts their lists agree, in case someone
edits one by hand.

| | Count | Carries |
|---|---|---|
| SRD 5.2.1 conditions | 15 | Full rules text, CC BY 4.0 |
| This system's own — `hb:1` | 2 | Concentrating, Raging. No invented rules text: each points at the thing that causes it |

**Exhaustion is marked `lvl:1`** and is deliberately *not* one of the on/off toggles in either
tool — it is level-based and gets its own control, so there is one source of truth for it. On the
character sheet that is the Exhaustion bar; in Encounter Control it is a per-combatant stepper in
the Conditions block, where it also subtracts 2 × level from initiative (the only D20 Test that
tool rolls). Recovery stays the sheet's job — a combat tracker has no rests. Encounter Control
lifts a legacy bare `Exhaustion` chip out of old saves into a level on load. See
`claude/EXHAUSTION_RULE.md`.

Conditions are **tracked and displayed only** — nothing about them touches a roll. Most of them
grant Advantage or Disadvantage on attack rolls, and this system has no to-hit roll (see
`claude/ATTACK_RULE.md`), so how they bite is the table's call. `test/conditions.test.js` has a
block that asserts exactly this: four conditions active must change a skill check by nothing.

Source: `srd-rules-glossary.md` — the full SRD 5.2.1 rules glossary, vendored. The build extracts
every `#### … [Condition]` heading, so the other glossary entries are available for later work.

## The navigation menu

`build_nav.py` is not SRD material, but it belongs to the same family: one generator, many files.

    python3 tools/build_nav.py           # writes the menu into the five tools and legal.html
    python3 tools/build_nav.py --check   # verify; exits 1 if any copy is stale or missing

Every page except the portal carries a launcher in its bottom-left corner that opens a menu of the
whole site. The menu's contents are **read out of `index.html`** — the `CAMPAIGN` name, the `BASE`
URL, the Drive folder and the `FILES` map — so the hub stays the single place links live, exactly as
`HOSTING_AND_DEPLOYMENT.md` §4 promises. Rename a file there, re-run this, and all six copies follow.

The emitted block is byte-identical in every page apart from one line: `var HERE = "<filename>"`,
which is what marks *you are here*. `test/nav.test.js` asserts that identity, asserts every file the
menu names exists on disk, and asserts nothing in any tool out-stacks the open panel.

Two things it deliberately does **not** do. It does not go into `index.html` — the portal is the
navigation, and a launcher there would open a smaller copy of the page you are already on. And it
does not hide DM tools from anyone in a security sense: it follows the `dyop_view` key the portal
writes, which is convenience only. Every file on the site is a public URL.

## Regenerating

    python3 tools/build_spells.py        # rebuilds const SPELLS=[…] in the character builder
    python3 tools/build_conditions.py    # rebuilds const CONDITIONS=[…] in BOTH tools
    python3 tools/build_nav.py           # rebuilds the navigation menu in six pages

`build_spells.py` defaults to `tools/srd-spells.md` and `../character-builder-2.html`.
`build_conditions.py` defaults to `tools/srd-rules-glossary.md` and both HTML tools; pass a
glossary path followed by any number of target files to override. Both are **idempotent** — they strip and rebuild the generated data, so re-running is
safe and produces byte-identical output. Each touches **only** its own array; the CSS and render
code around them are ordinary source and are left alone, so the UI survives a rebuild.

Then verify:

    node test/spells.test.js
    node test/conditions.test.js
    node test/ec-conditions.test.js
    node test/build-stamp.test.js

`srd_convert.py` turns one spell's Markdown into HTML. Nothing from the source is passed through as
markup: every scrap of text is escaped first and the only tags in the output are ones the converter
emits — `p`, `em`, `strong`, `ul`, `li`, `h4`, `table`, `thead`, `tbody`, `tr`, `th`, `td`.

## Build stamps

Every published page carries a footer stamp: the file's name, a build date, and a short SHA-1 of its
own content with the stamp removed.

    index.html · build 2026-09-13 · 8e98286

**Why a fingerprint and not just a date.** Two copies edited on the same day look identical by date.
`claude/SECURITY_PATCHES.md` §1 records an entire security patch pass that validated against the
*wrong* copy of a file, because there was no way to tell two versions apart. The `rev` answers "is
this the build I think it is?" from the footer — and in bulk:

    python3 tools/stamp_build.py            # stamp every published page
    python3 tools/stamp_build.py --check    # verify; exits 1 if anything is stale or unstamped

`--check` is the drift detector. It recomputes each file's hash and compares; a single changed
space is enough to report STALE.

**Ordering matters.** The data builds change file content, so stamp *after* them:

    python3 tools/build_spells.py
    python3 tools/build_conditions.py
    python3 tools/build_nav.py
    python3 tools/stamp_build.py            # last

`build_nav.py` inserts its block *before* the stamp for the same reason: the stamp has to be able to
cover the menu's bytes, or a changed menu would not show up as a changed build.

The stamp tool is idempotent — the hash covers the content *without* the stamp, so re-running
rewrites the same bytes. The **date only moves when the content actually moves**: a rebuild that
changes nothing leaves the date alone, so the date means "last really changed", not "last ran".

Stamps are hidden in print and carry `data-build` / `data-rev` attributes for anything that wants to
read them programmatically.

## The test is the licence guard

`test/spells.test.js` asserts that no non-SRD spell carries `d`, `ct`, `rg`, `cp` or `du`, that
every spell sits in exactly one bucket, that every `nb:2` spell names a sourcebook, and that
descriptions contain only the eleven expected tags. `test/conditions.test.js` does the same for
conditions and additionally checks that a hostile condition name from an imported save is escaped
rather than rendered. **If one of those fails, the build is reproducing text it has no licence to
reproduce, or an import can inject markup.** Treat a failure there as a release blocker, not a test
to adjust.

`test/build-stamp.test.js` (90 assertions) verifies every page is stamped exactly once, that each
rev genuinely matches its own content, that the fingerprints are distinct, that every page still
boots, and that the verbatim legal notices survived stamping untouched.
