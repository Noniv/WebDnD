# Emberdeep: notes for Claude

A mobile-first, browser-based, **5e-compatible** dungeon crawl (SRD 5.2.1, CC-BY-4.0). PixiJS v8 renders the map; the UI is DOM laid over it. Solo play, plus online co-op for 1–4 players. Hosted on the **Vercel free tier**: static site plus small functions in `api/`. Co-op is peer-to-peer (WebRTC via `trystero`), with no game server or database. README.md covers the player and deploy side; this file covers how to work on the code.

## The user
- Not a D&D expert. Explain rules in plain language and write in-game text the same way (see `plainSpell()` in `src/game/director.ts`). Always tell the player *why* something can't be done; never fail silently.
- Wants a polished game feel: midnight-navy panels, thin gold filigree, Cinzel for display text. No "webpage" look.
- Asked for SVG art to be made by a **separate subagent**. Keep doing that for new art sets.
- Legal: call it "5e-compatible", never use "Dungeons & Dragons". Keep the SRD attribution in Credits and the README.
- Don't commit or push unless asked.
- Create and change files with the **Write/Edit tools**, not shell or Python scripts (Read the file first; Edit needs it).
- Never put an OpenRouter key in the project (source, `.env`, docs, tests). Tests take it from the `OR_KEY` environment variable or put it in the test browser's localStorage.

## Commands
```bash
npm run dev        # Vite on :5173 (I usually run --port 5199); also serves api/*.js via a middleware in vite.config.ts
npm run typecheck  # tsc --noEmit (TS 7, strict, noUnusedLocals). Run it after every change
npm run build      # typecheck + vite build -> dist/ (delete dist/ afterwards; it is gitignored anyway)
npm run sim        # headless balance sim: runs the real Combat engine with bot party policies, 400 fights per row (den, boss, and the side fights)
OR_KEY=... npm run dm-bench  # sends the real NPC prompts to the model and scores the replies (RUNS, TEMPS, SHOW_MISSES env vars)
python tools/art/validate.py      # checks the 140 game SVGs (parse, sizes, no <text>/<image>, unique ids)
node tools/ui-gold/validate.cjs   # checks the gold filigree UI kit
```

## Architecture (where things live)
- `src/rules/`: pure 5e rules, no DOM. `dice.ts` (seeded RNG, adv/dis), `checks.ts` (d20 + mod vs DC/AC), `creature.ts` (Creature model, building, level-up, rests), `content.ts` (classes, species, backgrounds), `spells.ts`, `monsters.ts`, `types.ts`.
- `src/game/`:
  - `dungeon.ts`: map types and the Emberdeep (`deep1`, 21×38), built from rects in code; also objects, spawns, lights.
  - `areas.ts`: the other areas (`town` Emberford, `road`, `deep2` the Drowned Workings) and `buildArea(id)`. Exits are `kind: 'exit'` objects with `to: {area, at}`; scenery is `kind: 'decor'` with a `prop` texture. Rooms can carry an `encounter` group that starts a fight on entry.
  - `state.ts`: GameState, plain JSON and saveable. `monsters`/`objects`/`seen` are the *current* area; areas you left are stored in `areas`. `enterArea()` switches. Also `quests`, `flags` (story switches) and `memory` (what each NPC remembers of past talks).
  - `npcs.ts`: every person's sheet (persona, knows, secrets, allowed effects, scripted fallback topics), the world lore, `QUESTS` and `questLog()`.
  - `dm.ts`: the AI dungeon master: OpenRouter call (`dmCall`), the system prompt, and `parseReply()`, which validates the model's JSON (skills mapped to the game's, DC clamped, effects filtered to the NPC's list).
  - `grid.ts`: LOS/fog (`computeVisible`), pathing (`floodCosts`/`pathTo`), `clearShot` (a more forgiving tabletop-style line of effect).
  - `combat.ts`: the turn loop, actions, AI. Rules only: it talks to the screen through the `Presenter` (`presenter.ts`, which also has a `headless` version).
  - `dialogue.ts`: the Snikk dialogue as data.
  - `director.ts`: the "DM": exploration, interactions, traps, rests, XP, the combat UI, and co-op routing.
  - `save.ts`: localStorage saves and settings.
- `src/render/`:
  - `view.ts`: the MapView (tiles, tokens, fog canvas, marks, camera, input).
  - `dice.ts`: the d20 overlay, the signature moment.
  - `fx.ts`: shared effects, also used by co-op guests.
  - `textures.ts`: loads the SVGs; anything missing gets a drawn fallback.
  - `tween.ts`: every animation and pause goes through `animate()` and is scaled by the global game speed (`setTimeScale`).
- `src/ui/`: `hud.ts` (party plates, dock, sheets, dialogue, panels, turn-order strip, quests, inventory), `talk.ts` (the free-text conversation panel, drawn from a `TalkVM`), `dmcard.ts` (the OpenRouter key card in Settings and the host lobby), `create.ts` (party builder, abilities card), `lobby.ts`, `title.ts`, `sfx.ts` (procedural Web Audio), `dom.ts` (`h()` helper).
- `src/net/`: co-op. `p2p.ts` (`Wire`: trystero room keyed by the 4-letter code, per-peer numbered messages delivered in order), `protocol.ts` (types incl. `WireMsg`), `host.ts` (HostLink + HostHud), `guest.ts` (GuestLink + GuestClient), `identity.ts` (persistent player id/name).
- `api/`: Vercel functions with the Node `(req, res)` signature, no dependencies. `daily.js` (omen) uses `shared/omen.js`; `health.js`.
- `public/art/`: tiles, tokens, portraits, icons, `ui/gold/*` (the filigree kit, mostly CSS border-image 9-slices). Generators live in `tools/art/*.cjs` and `tools/ui-gold/gen.cjs`.

## Key design rules (keep these true)
- **Action first in combat:** pick from the dock (Attack / Spells / Actions / Bonus), and the menus list *options only, never enemies*. That starts an `Aim`: reach squares light up (`view.showRange`), valid targets get a gold ring with their odds, the player taps a target on the map. Invalid taps call `tell(reason)`. With no action chosen, tapping a creature only shows its info. New targeted abilities = a new `Aim` via `aimOption()`.
- **Every obstacle has ≥2 solutions** that suit different characters (talk / sneak / fight; disarm / time it / leap; key / pick / force; douse the brazier / Turn Undead / the phial). Keep that when adding content.
- **Balance targets** (`npm run sim`): ignoring the boss's systems should win about 60%, and using them about 80–90%. No strategy may dominate. Rerun the sim after any rules or monster change.
- **Pacing:** never hard-code instant UI; use `animate`/`wait`/`p.pause` so the Game speed setting applies. Toasts and banners compute their reading time from text length.
- **Saves:** GameState must stay JSON-serialisable. Bump `CONFIG.SAVE_VERSION` if its shape changes incompatibly (it is 2 since the areas update).

## Conversations and the AI dungeon master
- Every talk goes through `director.converse(npc, opts)`. With a key it runs the AI loop (opening line, then player text → model → optional `check()` with the real dice → the success or failure branch → effects). Without a key it falls back to `scriptedTalk()` from the NPC's `topics`. Snikk's den uses `denTalk()` (AI) or the old `SNIKK` tree in `dialogue.ts`.
- **The model never changes the game directly.** It returns effect ids; `talkEffect()` applies them once each and ignores anything not on that NPC's `effects` list. New rewards = a new `EffectId` + a line in the NPC's `effects` describing *when* to use it + handling in `talkEffect()`/`afterTalk()`.
- The prompt says effects are "the only way the game learns what happened". Without that, the model narrated things (a quest, a key) it never triggered. When the story text and the effects disagree, fix the effect descriptions in `npcs.ts` and check with `npm run dm-bench`.
- Settings measured with the bench: reasoning off (`reasoning: {enabled: false}`, about 1 s per reply) and temperature 0.5 (0.8 started dropping JSON fields).
- Quest rewards are handed over at the start of a talk with the giver (`turnIn()`): `news` goes to the model so the NPC reacts, `notes` go to the players.
- Conversations are a scene (`holdScene`), so every walker stops. In co-op the talk is mirrored through `ViewModel.talk` and answered with the `say` intent; only `TalkVM.turn` (the decider) gets the text box, the host can "Answer for them", and the panel hides while dice roll (`rolling`).

## Co-op model (read before touching the director or HUD)
- The host's browser runs everything. `HostLink.emit()` sends events to guests right away (batched per microtask); `flush()` sends the snapshot `{state, vm}` when it changed, at most every 150 ms, always after pending events. Guests replay events (dice, moves, fx, toasts) and apply snapshots strictly in arrival order (`Wire` re-orders by sequence number, since trystero can let a small message overtake a big one).
- **Update state before animating.** Set `c.pos` (etc.) before awaiting the animation that shows it (see `walk()` and the presenter's `move`); otherwise a snapshot taken mid-animation sends the old position and the guest's token walks backwards.
- Exploration movement is per player: `groupOf(pid)` (that player's heroes; everyone in solo), `leadIdx(pid)`, `useLead(pid)` before any action that reads `this.leader`. Plain walks don't set `busy`, so players can walk at once; scenes (`holdScene`: dialogue, den/boss triggers) stop every walker. When an action is refused, tell that player why (`tellPlayer` / `tellBusy`).
- In combat the presenter's `roll`/`rolls` only log (no dice overlay, no `roll` event); outside combat they show the d20.
- Prompts are routed by `hud.decider` (a player id). `HostHud.sheet/dialogue/choose` send the prompt to that player when they're remote and online, and otherwise show it locally. `ownerOf(creature)` tells you who controls a hero (seat owner, else the host). Set the decider when an interaction starts (`onTap(p, from)`, dock taps, `check()` rerolls, `p.choose(..., who)`).
- **Anything new that the HUD shows must be mirrored:** add it to `ViewModel` (`protocol.ts`), record it in a `HostHud` override, and render it in `GuestClient.render()`. Visual events go through the presenter, which `emit()`s them. Map highlights are recorded in `view.marks` automatically.
- Test co-op with two separate browser contexts (see below). It needs internet access (public Nostr relays for discovery); joining takes about 3 s. A console error about one dead relay is normal; trystero uses the others.

## Verifying changes (do this, the user tests on a phone)
- Use headless Chrome through **puppeteer-core installed in the scratchpad** (not in the project): `executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'`, args `--use-angle=swiftshader --enable-unsafe-swiftshader`, viewport about 360–390 wide, `isMobile: true, hasTouch: true`.
- Dev-only hooks: `window.__ed` (host/solo Director) and `window.__guest` (GuestClient).
- **Test with real input** (`page.touchscreen.tap` / `page.mouse.click` at screen coordinates computed from `__ed.view.world` and `zoom`). Calling `__ed.onTap()` directly hid two real bugs: HUD overlays swallowing taps, and ghost clicks closing menus.
- Screenshot and *look* at screens after UI work: title, builder, lobby, game HUD, dialogue, dice, combat aiming.
- Puppeteer gotchas:
  - `page.evaluate(() => promise)` awaits it; use `{ void __ed.onTap(...) }` for long flows.
  - Changing `isMobile` in `setViewport` reloads the page.
  - `evaluateOnNewDocument(() => localStorage.clear())` also runs on reload and wipes saves, so guard it with a sessionStorage flag.
- **Don't edit `src/` while a browser test runs**: Vite HMR reloads the page and the test dies with `__ed is not defined`.

## UI pitfalls already hit
- HUD containers span the screen: `.hud-top`, `.hud-bottom` and `.vignette` must stay `pointer-events: none` (CSS rule near the top of `style.css`), as must chips (`.tag`). Only real controls opt back in.
- Menus opened by a map tap get a ghost click; the `MutationObserver` guard in the `Hud` constructor swallows clicks for 350 ms. Keep new modals inside `hud.modal`.
- `.modal-layer` has z-index 50 so popups sit above screens created later (title, lobby).
- Pop-up text must wrap (`max-width: calc(100vw - 28px)`); check at a 360 px width.
- Buttons use `clip-path` chevrons plus border-image; the primary button is struck gold.

## Windows / tooling notes
- Shell heredocs truncate large content, which is one more reason to use the Write/Edit tools for every file change.
- Tests that tap a menu right after opening it must wait over 350 ms (the ghost-click guard). Keep map taps within a few squares of the hero, or they land on the HUD (the party plates catch taps near the top).
- Files have CRLF line endings; don't fight it.
- PixiJS: load the `pixijs-skills:pixijs` skill before touching Pixi code. v8 API: `await app.init()`, shape then `fill()`, `eventMode`, and `Assets` with SVG `data.resolution`.
