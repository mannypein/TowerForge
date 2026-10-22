# Ask AI (preview)

A chat tab where a player asks about their own account in plain words
("what should I spend my stones on?", "how many waves would maxing CL get
me?"). Started 2026-10-21 as a preview only the owner's account sees.

## How it works

- **The model runs in the player's browser**, on their graphics card, with
  [WebLLM](https://github.com/mlc-ai/web-llm) (`@mlc-ai/web-llm` 0.2.85,
  Apache-2.0) over WebGPU. Nothing is sent anywhere and it costs the site
  nothing. The weights download once from Hugging Face (`mlc-ai/…-MLC`) into
  the browser's Cache Storage (`webllm/model`, `webllm/config`,
  `webllm/wasm`); the compiled model library comes from
  `raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs`. "Remove download"
  deletes them (checked: storage use back to 0 MB).
- It runs in a web worker (`src/ai/aiWorker.ts`), so the page stays
  responsive. The model and the chat live outside the page
  (`src/ai/aiAssistant.ts`, a Zustand store), so switching tabs keeps them.
- **Models** (`src/ai/aiModels.ts`): Qwen3 4B (default, 2.3 GB), Qwen3 8B
  (4.6 GB), Qwen3 1.7B (1 GB) — download sizes from each model's
  `ndarray-cache.json`. The q4f16 build needs the GPU's `shader-f16`
  feature; without it the q4f32 build loads. Context raised from the
  prebuilt 4,096 to 8,192 tokens.
- **Two steps per question**, because a small model can't do the game's math:
  1. *Route*: the model answers in JSON (held to a schema by WebLLM's
     grammar) which data to look at — `upgrades` (a currency, a goal),
     `what_if` (upgrades in the player's words and a level), `levels`,
     `runs` (campaign, tournament or any), `tier` (a tier number),
     `tournament`, `guide` (keywords) or `none`. Qwen3 starts every reply
     with an empty `<think></think>`, which is stripped before parsing; when
     the JSON still can't be read, keywords pick (and the page says so).
  2. *Answer*: the site works the data out with the same engine the pages
     use (`src/ai/aiTools.ts`): the Optimizer's paths (with what the player
     can buy now and the picks cheapest first), What If (campaign mode),
     current levels, the saved runs with damage by source (campaign against
     tournaments), another tier, the Tournament page's estimate, and a BM25
     search over the game notes in `docs/` plus the battle conditions' texts
     (`src/ai/aiKnowledge.ts`). The model answers from that and an account
     summary, written out as it goes. "Looked at" under each answer shows
     the route and the exact data.
- Upgrades named in words: UW short names (CL, CF…), "+"/"plus" or the UW+
  name for UW+, "lab" picks labs over the workshop, a UW alone means all its
  stats; levels "max", "+N", "next" or a number.

- **Another tier** (`tierOutlook`): each of the last 5 campaign deaths'
  basic enemy health (Run Length), and the wave where the other tier's
  enemies reach it at that run's level skip (`runLength.deathWave`). Same
  tier gives the same waves back (within the 2–3 waves a health level
  lasts at 58% skip, tested). Health only — higher tiers' enemies also hit
  harder — so it's where the damage runs out. Owner's T18 deaths
  (W8,600–W9,322) → T19 about W6,400.
- Answers may link the site's pages (real addresses are in the prompt); a
  link opens the tab in place, so the model and the chat stay. Other links
  show as plain text.
- "Downloaded" is checked in Cache Storage directly (the first weight file);
  WebLLM's own check fetched every model's file list from Hugging Face on
  each visit. Remove download also deletes the file lists WebLLM leaves.
  The browser may keep counting the space for a while after.

## Who sees it

`TowerForge.Server/Data/PreviewFeatures.cs` reads `features.json` in the data
directory (`/var/lib/towerforge/features.json` on the server — never in the
repo, the usernames are private):

```json
{ "ai": ["SomeUser"] }
```

`/api/account/me`, `/login` and `/register` return `features` for the
account; the tab shows when it has `"ai"` (and always in development). A
hidden tab's address (`/ai`) opens the home page. Usernames match in any
case; the file is re-read when it changes (no restart); a broken file means
no previews. Checked 2026-10-21 against a local server with two made-up
test accounts. The gate hides the page; the code itself ships in the public
bundle (the repo is public anyway) and runs only on the visitor's machine.

## What was checked (2026-10-21, RX 7800 XT, Qwen3 4B)

- Download 2.3 GB at ~60 MB/s; loading from the browser's storage ~15 s.
- First words ~10 s after asking, full answers 25–40 s; with "Think before
  answering" ~70 s.
- Without guards the 4B copied numbers from its own earlier answer (said
  +1,042 waves for CF+ when the data said +42.4). Fixes: it never sees its
  earlier answers (only the earlier questions), every tool result starts
  with a one-sentence `Headline:` to quote, temperature 0.2. After that the
  numbers matched the data.
- Explanations of mechanics are the weak spot: without thinking it muddled
  Fast's Ultimate ("enemies are slower"); with thinking it was right.

## The owner's first questions (Qwen3 8B, 2026-10-21)

What went wrong, and what changed:

- "Why is my Chain Lightning weak in tournaments?" went to the game notes
  and got a generic answer with a made-up link (towerforge.com). Now: the
  `runs` tool. On the owner's runs CL is 12% of the damage on T18 and about
  10% in tournaments (Orbs 71% / 51%, Death Ray 26% in tournaments), so CL
  is a small share in both.
- "How far would I get on T19?" was sent to What If ("T18 → max"). Now: the
  `tier` tool.
- "Cheapest way to improve": it called 61.00K coins dearer than 4.67Q. Now
  the prompt lists the letters in order and the data has a "Cheapest first"
  line, worked out by the site.
- "Increase my coins with coins and stones" kept the Optimizer's saved goal
  (damage). Now the router sets goal "coins" (an example says so), and
  "any" currency when two are named.
- "PS" was read as "Power Stones". The site now says stones, like the game.
- It read levels like "Damage 13/32" as damage; the prompt says they're
  levels.

## Download size

The two WebLLM scripts (the worker and the page's copy) are ~6 MB each.
Since 2026-10-22 nginx compresses JavaScript, CSS, JSON and SVG
(`ops/nginx/towerforge-gzip.conf`, installed in `/etc/nginx/conf.d/`): each
AI script goes out as ~2.1 MB, the main bundle 359 KB → 111 KB. The model
itself (Hugging Face) is already compressed weights.

## Not done yet

- Tournament What If (the tool uses campaign mode), Guardian and module
  questions beyond the summary, and the account summary's labs (only the
  ones being researched).
- `TournamentRecords` (every tournament's wave and rank, 29.1.3) as a tool
  once the fields are confirmed.
- Learning over time: today it knows what the docs and the engine know;
  "smarter" means better notes and tools, not training.
