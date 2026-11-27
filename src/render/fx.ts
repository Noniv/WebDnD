// Shared visual + sound feedback, used by the host's Director and by co-op guests replaying events.
import type { Creature } from '../rules/creature';
import type { Pos } from '../rules/types';
import type { FxKind } from '../net/protocol';
import { sfx } from '../ui/sfx';
import { PAL } from './textures';
import { wait } from './tween';
import type { MapView } from './view';

export async function playFx(view: MapView, kind: FxKind, from: Pos, to: Pos | Pos[]): Promise<void> {
  const list = Array.isArray(to) ? to : [to];
  switch (kind) {
    case 'slash': sfx.miss(); await view.slash(from, list[0]); break;
    case 'arrow': sfx.miss(); await view.projectile(from, list[0], PAL.parchment, 3, 200); break;
    case 'bolt': case 'force': sfx.spell(); await view.projectile(from, list[0], PAL.arcane, 6); break;
    case 'darts': sfx.spell(); await Promise.all([0, 1, 2].map((i) => wait(i * 70).then(() => view.projectile(from, list[0], PAL.arcane, 4, 240)))); break;
    case 'fire': sfx.fire(); if (list.length > 1) await view.areaFx(list, PAL.ember); else await view.projectile(from, list[0], PAL.ember, 7); break;
    case 'frost': sfx.spell(); await view.projectile(from, list[0], 0x9fd8ff, 6); break;
    case 'radiant': sfx.spell(); if (list.length > 1) await Promise.all(list.map((p) => view.ring(p, PAL.gold, 0.6))); else await view.projectile(from, list[0], PAL.gold, 7); break;
    case 'heal': sfx.heal(); view.burst(list[0], PAL.verdigris, 14); await wait(200); break;
    case 'sleep': sfx.spell(); await view.areaFx(list, PAL.arcane); break;
    case 'turn': sfx.spell(); await view.ring(from, PAL.gold, 6); break;
    case 'douse': view.burst(list[0], 0x888888, 24, 40); view.syncProps(); await wait(300); break;
  }
}

export function showDamage(view: MapView, t: Creature, amount: number, crit: boolean, note?: string): void {
  view.floatText(t.pos, `-${amount}${note ? ` ${note}` : ''}`, crit ? PAL.gold : PAL.blood, crit);
  view.flashToken(t, 0xff7a6a);
  sfx.hit();
  if (t.kind === 'pc') view.shake(crit ? 7 : 3);
}

export function showHeal(view: MapView, t: Creature, amount: number): void {
  if (amount > 0) view.floatText(t.pos, `+${amount}`, PAL.verdigris);
  sfx.heal();
}
