// Headless balance simulator: runs the real combat engine with bot party policies.
// npm run sim   -> prints win rates per fight and strategy, so no single line of play dominates.
import { Combat } from '../src/game/combat';
import { headless } from '../src/game/presenter';
import { newGame, type World } from '../src/game/state';
import { defaultBuild } from '../src/ui/create';
import { buildCharacter, longRest, levelUp, canAct, type Creature } from '../src/rules/creature';
import { seedRng } from '../src/rules/dice';
import { SPELLS } from '../src/rules/spells';
import { dist } from '../src/game/state';

type Strategy = 'brawl' | 'sleep' | 'douse' | 'ignore' | 'phial' | 'turn';

function makeWorld(level: number, area: 'deep1' | 'road' | 'deep2' = 'deep1'): World {
  const party = (['fighter', 'rogue', 'wizard', 'cleric'] as const).map((c, i) => buildCharacter(defaultBuild(c, i)));
  const omen = { date: 'sim', seed: 1, omen: { id: 'quiet', name: 'Quiet', text: '', mods: {} } };
  const w = newGame(party, omen, area);
  if (level > 1) for (const c of party) { c.xp = 300; levelUp(c); longRest(c); }
  return w;
}

function place(w: World, spots: [number, number][]): void {
  w.state.party.forEach((c, i) => (c.pos = { x: spots[i][0], y: spots[i][1] }));
}

/** Walk as close to `t` as this turn's movement allows. */
async function approach(cb: Combat, c: Creature, t: { x: number; y: number }, stop = 1): Promise<void> {
  if (dist(c.pos, t) <= stop) return;
  const cost = cb.reachable(c);
  const W = cb.w.def.w;
  let best = -1, bd = Infinity, bc = Infinity;
  for (let i = 0; i < cost.length; i++) {
    if (!isFinite(cost[i])) continue;
    const d = dist({ x: i % W, y: (i / W) | 0 }, t);
    if (d < stop) continue;
    if (d < bd || (d === bd && cost[i] < bc)) { bd = d; bc = cost[i]; best = i; }
  }
  if (best < 0) return;
  const p = cb.pathFor(c, { x: best % W, y: (best / W) | 0 });
  if (p) await cb.moveAlong(c, p);
}

/** A simple, reasonable player: no omniscience, just sensible priorities. */
function policy(cb: Combat, strat: Strategy, phial: { n: number }) {
  return async (c: Creature): Promise<void> => {
    if (!canAct(c)) return;
    const foes = cb.enemiesOf(c).filter((f) => f.hp > 0);
    if (!foes.length) return;
    const nearest = (list: Creature[]) => [...list].sort((a, b) => dist(a.pos, c.pos) - dist(b.pos, c.pos))[0];
    const br = cb.brazier && cb.brazier.hp > 0 ? cb.brazier : null;
    const ally = cb.alliesOf(c).filter((a) => a.hp <= 0 && !a.death.dead)[0];

    // Cleric support
    if (c.classId === 'cleric') {
      if (ally && cb.canCast(c, SPELLS['healing-word']).ok && dist(ally.pos, c.pos) <= 12) await cb.cast(c, 'healing-word', ally);
      if (strat === 'turn' && c.res.channel > 0 && foes.filter((f) => f.undead && dist(f.pos, c.pos) <= 6).length >= 2) { await cb.actTurnUndead(c); return; }
      if (cb.round === 1 && cb.canCast(c, SPELLS.bless).ok) { await cb.cast(c, 'bless', null); return; }
      const t = nearest(foes);
      if (cb.spellInRange(c, SPELLS['sacred-flame'], t.pos)) { await cb.cast(c, 'sacred-flame', t); return; }
    }
    // Wizard
    if (c.classId === 'wizard') {
      if (strat === 'douse' && br && cb.spellInRange(c, SPELLS['ray-of-frost'], br.pos)) { await cb.cast(c, 'ray-of-frost', br); return; }
      if (strat === 'sleep' && c.slots[0] > 0) {
        const t = foes.find((f) => !f.condImmune.includes('asleep') && cb.spellInRange(c, SPELLS.sleep, f.pos));
        if (t) { await cb.cast(c, 'sleep', t.pos); return; }
      }
      const t = nearest(foes);
      if (c.slots[0] > 1 && cb.spellInRange(c, SPELLS['magic-missile'], t.pos)) { await cb.cast(c, 'magic-missile', t); return; }
      if (cb.spellInRange(c, SPELLS['fire-bolt'], t.pos)) { await cb.cast(c, 'fire-bolt', t); return; }
    }
    // Phial thrower: the rogue runs at the brazier
    if (strat === 'phial' && br && phial.n > 0 && c.classId === 'rogue') {
      await approach(cb, c, br.pos, 3);
      if (dist(c.pos, br.pos) <= 4) { phial.n--; cb.w.state.inv.phial = 1; await cb.actPhial(c, br); return; }
    }
    // Fighter douses by toppling when told to
    if (strat === 'douse' && br && c.classId === 'fighter') {
      await approach(cb, c, br.pos, 1);
      if (dist(c.pos, br.pos) <= 1) { await cb.actAttack(c, br, c.weapons[0]); return; }
    }
    if (c.classId === 'fighter' && c.hp < c.maxHp / 3 && c.res.secondWind > 0) await cb.actSecondWind(c);
    // Melee or ranged basic
    const t = nearest(foes);
    const ranged = c.weapons.find((w) => !w.melee);
    const melee = c.weapons.find((w) => w.melee)!;
    if (c.classId === 'rogue' && ranged && cb.weaponInRange(c, ranged, t) && cb.hostileAdjacent(c).length === 0) { await cb.actAttack(c, t, ranged); return; }
    await approach(cb, c, t.pos, 1);
    if (c.hp > 0 && dist(c.pos, t.pos) <= 1) await cb.actAttack(c, t, melee);
  };
}

/** The side fights added with the village: where they happen and at what level players usually meet them. */
const SIDE: Record<string, { area: 'road' | 'deep2'; level: number; group: string; spots: [number, number][]; surprised: 'party' | 'enemies' | null }> = {
  'wolves-ambush': { area: 'road', level: 1, group: 'wolves', spots: [[7, 17], [8, 17], [6, 18], [7, 18]], surprised: 'party' },
  'wolves-warned': { area: 'road', level: 1, group: 'wolves', spots: [[7, 17], [8, 17], [6, 18], [7, 18]], surprised: 'enemies' },
  rats: { area: 'deep2', level: 1, group: 'rats', spots: [[5, 17], [5, 16], [4, 17], [4, 18]], surprised: null },
  spider: { area: 'deep2', level: 2, group: 'spider', spots: [[7, 7], [6, 7], [7, 8], [6, 8]], surprised: null },
  drowned: { area: 'deep2', level: 2, group: 'drowned', spots: [[11, 7], [12, 7], [11, 6], [12, 6]], surprised: null },
};

async function sideFight(kind: string, seed: number) {
  seedRng(seed);
  const f = SIDE[kind];
  const w = makeWorld(f.level, f.area);
  place(w, f.spots);
  const cb = new Combat(w, headless);
  cb.pcAuto = policy(cb, 'brawl', { n: 0 });
  await cb.start(w.state.monsters.filter((m) => m.group === f.group), f.surprised);
  const out = await cb.run();
  return { win: out === 'victory', rounds: cb.round, dead: w.state.party.filter((c) => c.death.dead).length, down: w.state.party.filter((c) => c.hp <= 0).length };
}

async function fight(kind: 'den' | 'boss', strat: Strategy, seed: number) {
  seedRng(seed);
  const w = makeWorld(kind === 'den' ? 1 : 2);
  if (kind === 'den') place(w, [[9, 30], [8, 30], [10, 30], [9, 31]]);
  else place(w, [[9, 8], [8, 8], [10, 8], [9, 9]]);
  if (kind === 'den') w.state.objects.find((o) => o.id === 'door-den')!.open = true;
  else w.state.objects.find((o) => o.id === 'door-crypt')!.open = true;
  const mons = kind === 'den' ? w.state.monsters.filter((m) => m.faction === 'goblins') : w.state.monsters.filter((m) => m.faction === 'undead' || m.faction === 'object');
  const cb = new Combat(w, headless);
  const phial = { n: strat === 'phial' ? 1 : 0 };
  cb.pcAuto = policy(cb, strat, phial);
  await cb.start(mons, null);
  const out = await cb.run();
  const dead = w.state.party.filter((c) => c.death.dead).length;
  const down = w.state.party.filter((c) => c.hp <= 0).length;
  return { win: out === 'victory', rounds: cb.round, dead, down };
}

const N = 400;
const cases: [kind: 'den' | 'boss', strat: Strategy][] = [
  ['den', 'brawl'], ['den', 'sleep'],
  ['boss', 'ignore'], ['boss', 'douse'], ['boss', 'phial'], ['boss', 'turn'],
];
(async () => {
  console.log(`Emberdeep balance sim · ${N} runs per row\n`);
  console.log('fight  strategy  win%   avgRounds  avgDeaths  avgDowned');
  for (const [kind, strat] of cases) {
    let wins = 0, rounds = 0, dead = 0, down = 0;
    for (let i = 0; i < N; i++) {
      const r = await fight(kind, strat, 1000 + i * 7919);
      if (r.win) wins++;
      rounds += r.rounds; dead += r.dead; down += r.down;
    }
    console.log(`${kind.padEnd(6)} ${strat.padEnd(9)} ${(wins / N * 100).toFixed(0).padStart(4)}%  ${(rounds / N).toFixed(1).padStart(8)}  ${(dead / N).toFixed(2).padStart(9)}  ${(down / N).toFixed(2).padStart(9)}`);
  }
  console.log('\nside fights (brawl)        win%   avgRounds  avgDeaths  avgDowned');
  for (const kind of Object.keys(SIDE)) {
    let wins = 0, rounds = 0, dead = 0, down = 0;
    for (let i = 0; i < N; i++) {
      const r = await sideFight(kind, 2000 + i * 7919);
      if (r.win) wins++;
      rounds += r.rounds; dead += r.dead; down += r.down;
    }
    console.log(`${`${kind} (lv ${SIDE[kind].level})`.padEnd(26)} ${(wins / N * 100).toFixed(0).padStart(4)}%  ${(rounds / N).toFixed(1).padStart(8)}  ${(dead / N).toFixed(2).padStart(9)}  ${(down / N).toFixed(2).padStart(9)}`);
  }
})();
