# Emberdeep · a 5e-compatible delve

A mobile-first, browser-based dungeon crawl built on the free **SRD 5.2.1** rules. Play **solo** or **online co-op with 1–4 players**: build a party of four, explore five rooms under fog of war, talk, sneak or fight past a goblin gang, find a trap and two secret doors, rest beneath the Last Candle to level up, and face the Ash Warden.

Rendered with **PixiJS v8**. The UI is DOM laid over the canvas, in a midnight-and-gold filigree style. Hosting is a static site plus small serverless functions, which fits Vercel's free Hobby tier.

## Play locally

```bash
npm install
npm run dev        # http://localhost:5173 (the /api functions are served too)
npm run build      # typecheck + production build into dist/
npm run sim        # headless balance simulator (real combat engine, bot policies)
```

Node 20+.

## Deploy to Vercel (free tier)

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repo. Vercel detects Vite from `vercel.json`: build `npm run build`, output `dist/`.
3. Deploy. Solo play works immediately.
4. **For co-op**, add a free Redis database (one time, about a minute):
   - In the Vercel project, open **Storage → Create Database → Upstash for Redis** (free plan), and connect it to this project.
   - This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project's environment variables. `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work if you create the database on upstash.com yourself.
   - **Redeploy** so the functions pick up the variables.

Why a database: Vercel functions are stateless and can't hold WebSocket connections, so the room has to live somewhere between requests. Without Redis on Vercel, the co-op screen says exactly what to set up instead of half-working. Locally, `npm run dev` keeps rooms in memory, so co-op works with no setup.

The server is three dependency-free functions in `api/`:

| Route | What it does |
| --- | --- |
| `GET /api/daily[?date=YYYY-MM-DD]` | Today's *omen* and map seed. The omen is a small deterministic twist, e.g. *Still Air* (traps easier to spot) or *Restless Dead* (the boss has more HP). It is edge-cached for an hour. |
| `GET /api/health` | Liveness probe. |
| `POST /api/room` | Co-op rooms: create, join, seats, lobby, poll, intents and host sync. Every operation is a single Redis Lua script, so one request costs one Upstash command. |

### How co-op works

- **The host's browser runs the game.** It is the only place the rules and dice run, so everyone sees the same rolls. The host publishes a snapshot (game state + what each screen should show) and a stream of events (dice, moves, effects, log lines) about every 0.7 s.
- **Guests mirror it.** They poll about every 0.9 s, replay the events (the same d20 animations, token moves and effects), render the same map with their own fog-of-war view, and send *intents* back: taps on the map, dock buttons, and answers to prompts.
- **Each choice goes to the right player.** Whoever controls a hero takes that hero's combat turn and makes their checks, reactions (Shield) and rerolls. Whoever walks the party into a conversation speaks for it; the others watch the dialogue read-only. Heroes nobody claimed are played by the host. If a player drops, the host can **Decide for them**, and that hero falls back to the host after 15 s offline.
- **Lobby.** The host gets a 4-letter code (no look-alike letters) and an invite link (`?join=CODE`). Players join, pick a hero, and can customise it; the host edits the party and presses Start. Up to 4 players per room.
- **Free-tier budget.** Each connected device costs about 4,000–5,000 Upstash commands per hour of play (one command per poll), so a full 4-player table uses roughly 16,000–20,000 per hour. Compare that with Upstash's current free quota; polling slows to every 4–5 s in background tabs. Rooms expire 8 hours after their last write.

If `/api/daily` can't be reached (offline, or a static host), the client works out the same omen locally from `shared/omen.js`, so the game never breaks.

## What's in the box

**Core rules.** One rule drives everything: d20 + modifier against a DC (checks and saves) or AC (attacks). There are six abilities with modifiers, a proficiency bonus, advantage and disadvantage (2d20, keep the higher or lower; sources cancel), natural 20 crits and natural 1 auto-misses. The signature dice overlay shows every roll as `d20 + mod = total vs DC/AC`, with the reasons for advantage or disadvantage, so you can always explain why you failed.

**Skills.** Athletics, Stealth, Arcana, Investigation, Insight, Perception, Persuasion, Intimidation, plus Thieves' Tools. Expertise doubles proficiency. Passive Perception spots hidden things as you walk.

**Characters.**
- **Classes:** Fighter, Rogue, Wizard and Cleric, levels 1–3.
- **Species:** Human, Elf, Dwarf and Halfling, each with traits that matter in play. Dwarven Resilience helps against the poison trap, Halfling Brave against the boss's Dread Gaze, Halfling Luck rerolls 1s, and Elves can't be put to sleep.
- **Backgrounds:** 2024-style, with +2/+1 to abilities, standard-array scores and skill picks.
- **Class features:** Second Wind, Action Surge, Tactical Mind, Weapon Mastery (Sap, Vex, Slow), Sneak Attack, Cunning Action, Steady Aim, Arcane Recovery, Channel Divinity (Turn Undead, Divine Spark), Disciple of Life and Improved Critical.
- **Spells:** a small list with spell slots, a one-slot-per-turn limit and concentration (Bless, Sleep). The Shield reaction prompts you mid-enemy-turn.

**Rests.** Short rests (two per long rest) spend Hit Dice and recharge per-short-rest features. Long rests are only allowed at the shrine; they restore everything and are where you level up.

**Combat on a grid.**
- Initiative order on 5-ft squares.
- Each turn has move, action, bonus action and reaction (opportunity attacks; Shield). You can split your movement.
- Actions: Dash, Disengage, Dodge, Hide, Stabilise.
- Difficult terrain, death saving throws at 0 HP, and damage at 0 HP causing failed saves.
- Conditions: Prone, Poisoned, Frightened, Unconscious and Asleep, plus tracked effects (Blessed, Dodging, Hidden, Sapped, Vexed, Turned).

**Exploration and social.**
- Fog of war with line of sight, torchlight, darkvision and light sources.
- A hidden cache, a needle trap and two secret doors, found with passive Perception or an active Search.
- Doors, including a locked crypt door, and a lockable chest.
- Branching dialogue with skill checks. You pick who speaks, Insight unlocks a better option, and there are five outcomes.

**Replacing the DM.** Every obstacle has at least two answers, each suited to a different character:

| Obstacle | Ways through |
| --- | --- |
| Goblin den | Persuade, read Snikk's fear (Insight) and strike a pact, Intimidate them into fleeing, pay a toll, sneak past (group Stealth), ambush, or fight |
| Needle trap | Disarm (Thieves' Tools), time the mechanism (Investigation), leap it (Athletics), or spring it |
| Crypt door | Snikk's key, pick the lock, or force it (loud: alerts the crypt) |
| The Ash Warden | Fight it while its brazier heals it, or douse the brazier (Arcana, Athletics, cold damage, or the Ember Phial from the secret nook). Turn Undead stops the skeletons, bludgeoning breaks the Warden's bones, and the shrine is a refuge because undead can't enter the candle's light. The secret Sister Passage lets you ambush it. |

**Co-op.** Online play for 1–4 players with a lobby, seats and invite links. See "How co-op works" above.

**Saves.** Progress autosaves at room entries, rests and fight outcomes (localStorage, versioned). *Continue* resumes, and a defeat offers a retry from the last checkpoint.

## Balance

`npm run sim` plays 400 fights per row with simple bot policies:

```
fight  strategy  win%   avgRounds  avgDeaths  avgDowned
den    brawl       78%       5.3       0.33       1.78
den    sleep       70%       5.8       0.33       2.06
boss   ignore      61%       7.7       0.34       2.02
boss   douse       80%       7.5       0.35       1.47
boss   phial       90%       6.5       0.22       0.95
boss   turn        84%       8.9       0.25       0.95
```

Brute force can win, but engaging the systems (the brazier, the phial from the secret, Turn Undead) is clearly better. No single line of play dominates. The goblin fight is meant to be costly at level 1, because talking is the intended alternative.

## Project layout

```
api/            Vercel serverless functions (daily omen, health, co-op rooms + Redis store)
shared/         Code shared by server and client (omen)
src/rules/      Pure 5e-compatible rules: dice, checks, creatures, classes, spells, monsters
src/game/       Dungeon, state, grid (LOS/fog/pathing), combat engine, dialogue, director (the "DM")
src/render/     PixiJS: map view, tokens, fog, effects, d20 overlay, textures
src/net/        Co-op: protocol, host link + mirrored HUD, guest client
src/ui/         DOM HUD, title, party builder, lobby, procedural Web Audio sound
public/art/     Hand-authored SVGs (tiles, tokens, portraits, icons, gold filigree UI kit)
tools/art/      Scripts that generate and validate the SVG set (node tools/art/tiles.cjs, ...)
scripts/sim.ts  Headless balance simulator
```

Rules and rendering are separate: `src/rules` and `src/game/combat.ts` talk to the screen only through the `Presenter` interface, which is why the simulator can run them headless.

## Not in this version

Multiclassing, feats, grappling, crafting, encumbrance, downtime and levels past 3 are skipped by design.

## Legal

Emberdeep is an independent, **5e-compatible** game and is not affiliated with or endorsed by Wizards of the Coast.

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

The rules are simplified for a short digital delve. Snikk, the Ash Warden, the dungeon, all art and all code are original to this project. Fonts: Cinzel and Alegreya Sans (SIL Open Font License), loaded from Google Fonts.
