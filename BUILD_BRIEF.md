# Tokoh Tekaan — Build Brief

Vibecode & Chill · KrackedDevs · Sekolah Edition. 2-hour build window, $15 total API budget for the build itself (separate from this planning session). Vocabulary below matches `CONTEXT.md` — read that first if a term is unclear.

**The loop** (for show-and-tell): *"A hint about a historical figure drops, you guess now for more points or peek for safety, then see who it really was — streak builds until you miss."*

This brief is self-contained: each phase below can be handed to its assigned model as a standalone task. Do not deviate from the locked decisions (marked ✅) without checking with the human first — those came out of an explicit design session, not a default.

---

## 1. Game spec (✅ locked, do not change)

- **Bank**: 15 Tokoh, across 4 Era Buckets. Static — compiled once, shipped as data, never generated or fetched at runtime.
- **Playthrough**: 10 Tokoh drawn at random, no repeats, from the 15-entry Bank. Untimed per question. Ends at the Score screen.
- **Per-Tokoh flow (Progressive Hint Reveal)**:
  1. Show Hint 1 + 4 multiple-choice name options (1 correct Tokoh + 3 Distractors from the *same* Era Bucket).
  2. Player may either (a) tap a name now, locking in their one guess, or (b) tap "Reveal next hint" to see Hint 2, dropping the available point tier. Same choice again reveals Hint 3 (final tier). After Hint 3, they must guess.
  3. On guess: compare to correct Tokoh, award points (see scoring), go to Reveal screen.
- **Scoring**: base points by which hint tier the guess was locked in at — **3 points** (Hint 1), **2 points** (Hint 2), **1 point** (Hint 3), **0 points** on a wrong guess.
- **Streak**: increments on any correct guess (regardless of tier), resets to 0 on a wrong guess. At streak ≥ 3, base points are **doubled** until the next miss. Streak count is always visible during Guess.
- **Distractors**: 3 wrong names per round, sampled from the same Era Bucket as the correct Tokoh, excluding the correct Tokoh itself. If an Era Bucket has fewer than 4 members (shouldn't happen at 15÷4 buckets, but guard for it), fall back to sampling from the full Bank excluding the correct Tokoh.

## 2. Screens (✅ locked)

1. **Guess** — current Hint text (readable font, not pixel font), "Reveal next hint" button (disabled after Hint 3), 4 tappable name choices, live streak counter, live point-tier indicator.
2. **Reveal** — right/wrong flash, correct Tokoh name, summary paragraph + image (both from the Bank, no live fetch), "Tokoh N/10" progress, Continue button.
3. **Score** (end of Playthrough) — total score, best streak that Playthrough, "Play again" button (starts a fresh random 10-draw).

No cross-Playthrough persistence (no "best score ever," no localStorage) — cut deliberately to save build time; add back only if there's slack near the end.

## 3. Data schema

`bank.json`, shipped as a static asset:

```json
{
  "eraBuckets": {
    "melaka": "Kesultanan Melayu Melaka",
    "resistance": "Penjajahan & Penentangan",
    "independence": "Menuju Kemerdekaan",
    "formation": "Pembentukan Malaysia"
  },
  "tokoh": [
    {
      "id": "hang-tuah",
      "name": "Hang Tuah",
      "era": "melaka",
      "hints": [
        "Hint 1 — vague",
        "Hint 2 — deeper",
        "Hint 3 — near giveaway"
      ],
      "summary": "One-paragraph reveal summary, human-approved.",
      "image": "assets/tokoh/hang-tuah.jpg"
    }
  ]
}
```

`id` is a kebab-case slug, unique, used for image filenames. Every `era` value must be a key in `eraBuckets`.

## 4. Content phase — draft the Bank

**Model: `gpt-5.6-terra`. Budget cap: $1.00.**

Draft candidate Tokoh list (verify English-Wikipedia coverage for each before finalizing; swap out anything thin or stub-quality — this is why the list below has a couple of backups per bucket):

- **Kesultanan Melayu Melaka**: Parameswara, Hang Tuah, Tun Perak, Sultan Mansur Shah
- **Penjajahan & Penentangan**: Dol Said, Datuk Maharaja Lela, Rentap, Yap Ah Loy
- **Menuju Kemerdekaan**: Tunku Abdul Rahman, Onn Jaafar, Tun Abdul Razak
- **Pembentukan Malaysia**: V.T. Sambanthan, Tun Fuad Stephens, Tun Mustapha Harun, Tan Cheng Lock

For each of the final 15:
- Write exactly 3 Hints, in English, ordered vague → specific. Hint 1 should not be guessable without real knowledge; Hint 3 should be close to a giveaway without naming them outright.
- Write one Reveal summary paragraph (2-4 sentences, English, factually accurate — this is an educational game, do not invent facts).
- Note an image source (prefer Wikimedia Commons, check it's public domain or CC-licensed) for the human to fetch/approve — do not fabricate an image URL.

**Output**: a draft `bank.json` (image field can be a placeholder path until images are sourced) plus a plain list of proposed image sources per Tokoh.

**Checkpoint — human review required**: the human personally reviews and approves every Hint and summary before this feeds the implementation phase. Do not skip this; it was an explicit requirement, not a nice-to-have.

## 5. Design system phase

**Model: `gpt-5.6-luna`. Budget cap: $0.50.**

Produce a short written design spec (not code) covering:

- **Palette**: dark navy/purple base (~`#0d0b1a`), neon accents (cyan, magenta-purple, gold), red for wrong feedback, green/cyan for right feedback. Retro arcade RPG HUD feel — glowing borders on panels, gradient title text.
- **Type**: a pixel display font (e.g. "Press Start 2P" from Google Fonts) for titles, screen headers, the score number, and the streak counter ONLY. A clean readable sans-serif (e.g. "Inter" or "Nunito" from Google Fonts) for Hint text, answer choices, and the Reveal summary paragraph. Do not use the pixel font for body text — it's illegible at that size.
- **Motion**: CSS keyframe animations only, no JS animation library (avoid an extra CDN dependency that could fail on venue wifi). Define: tap feedback (scale/flash on every button press), right/wrong flash on the Guess→Reveal transition, a streak-counter pop/shake when it increments, a small celebration state on the Score screen.
- **Mobile-first**: tap targets ≥44×44px, ≥8px spacing between them. This will be played on phones via a shared link.

**Output**: a short markdown spec + CSS custom-property (`:root { --... }`) block defining the palette/type tokens, ready to paste into `style.css`.

## 6. Implementation phase

**Model: `gpt-5.6-sol` (default). Budget cap: $8.00.**

Build plain HTML/CSS/JS — **no framework, no build step, no npm dependencies**. Files:

- `index.html`
- `style.css` (starts from the design-phase token block)
- `game.js`
- `bank.json` (from the content phase, human-approved version)
- `assets/tokoh/*` (images from the content phase, human-approved)

Implement exactly the flow in §1–2. No scope beyond what's specified here — no login, no backend, no analytics, no settings screen. Keep it to the 3 screens and 3 mechanics.

**Cost control**: keep this a short, scoped session per file rather than one long open-ended agent loop — a growing re-sent context is the main way this phase blows its budget, more than the per-token model price. If something needs several fix-attempts, prefer starting a fresh, narrowly-scoped turn over continuing to argue with a stuck one.

**Human checkpoint (per the event's own 11:00 timeline)**: once this phase produces a playable build, the human plays it for 5 minutes and reports back the one thing that's most annoying. That report is the input to the QA phase — don't try to pre-empt it with speculative polish.

## 7. QA / polish phase

**Model: `gpt-5.4-mini` (default), escalate to `gpt-5.6-sol` if a fix attempt fails twice. Budget cap: $2.00.**

Take the human's single reported annoyance, fix exactly that, re-verify the build still runs. Repeat only if there's budget and time left before the 11:15 ship deadline. Do not use this phase to add scope.

## 8. Contingency

**Model: `gpt-6-astra`, one-shot, narrowly scoped to the specific stuck problem. Budget cap: $3.00.**

Only invoke if something is genuinely stuck near the ship deadline and the cheaper models haven't resolved it in a couple of tries. Don't default to this model for anything in §4–7.

**If the full $15 is exhausted and something is still broken**, hand it back to this Claude Code session (the one that wrote this brief) to finish.

## 9. Ship

Deploy target: **Vercel**, CLI already authenticated (`vercel whoami` → `ilhamkassim`). Final step: `vercel deploy --prod` from the project root, producing the public link.

Send that link to someone with SPM next year.
