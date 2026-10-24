# Tokoh Tekaan

A guessing game for the "Vibecode & Chill · Sekolah Edition" hackathon: the player is shown progressively-revealing hints about a Malaysian historical figure and picks the correct name from four multiple-choice options. Built for a 2-hour build window with a $15 total API budget for the build phase itself.

## Language

**Tokoh**:
A historical figure eligible to appear in a round. Belongs to exactly one Era Bucket and has exactly three Hints plus a canonical name matching a `ms.wikipedia.org` article title (used for the Reveal).
_Avoid_: Historian, figure, character

**Era Bucket**:
A grouping of Tokoh by historical period/theme (e.g. Kesultanan Melayu Melaka, Penjajahan & Penentangan, Menuju Kemerdekaan, Pembentukan Malaysia). Used to pick plausible wrong-answer options for a round — distractors are drawn from the same Era Bucket as the correct Tokoh, never from a different one.
_Avoid_: Category, era, group (when unqualified)

**Hint**:
One of three clues shown for a Tokoh's round, ordered from vague to specific: Hint 1 (almost nothing), Hint 2 (deeper), Hint 3 (nearly a giveaway). Content is AI-generated during the build/compile phase and personally approved by the author before it ships — never generated live during play.
_Avoid_: Clue (the brief's word, but "Hint" is the term in use going forward)

**Bank**:
The static, pre-approved list of Tokoh shipped inside the app: name, Era Bucket, three Hints, a Reveal summary paragraph, and a Reveal image. All fields are compiled and personally approved before build; nothing is generated or fetched at runtime — the game makes zero external API calls.
_Avoid_: Question bank, database (this is a static asset, not a live store)

**Reveal**:
The screen shown after a guess (right or wrong): the Tokoh's real name, a short summary paragraph, and an image — all pulled from the Bank, not fetched live. Sourcing/writing the summary and clearing the image for use happens during the same compile pass as writing the Hints.
_Avoid_: Answer screen, learn card (brief's term for the analogous screen in a different title)

**Playthrough**:
One full game session: 10 Tokoh drawn at random, without repeats, from the 15-entry Bank. Ends at the Score screen (total score, best streak that playthrough). Untimed per question — the only pressure is the point-tier tradeoff in Progressive Hint Reveal.
_Avoid_: Round (the brief's word, but it's ambiguous between "one Tokoh" and "the whole session" — Playthrough always means the whole 10-Tokoh session; a single Tokoh within it has no separate name, it's just "the current Tokoh")

**Distractor**:
One of the 3 wrong names offered alongside the correct Tokoh in a multiple-choice guess. Always drawn from the same Era Bucket as the correct Tokoh, never a different one.
_Avoid_: Wrong answer, decoy
