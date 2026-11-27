// The in-game HUD: party plates, room banner, log ticker, action dock, sheets and dialogue.
import { chance, difficultyWord, checkLabel, checkPreview } from '../rules/checks';
import { BACKGROUNDS, CLASSES, SPECIES } from '../rules/content';
import {
  armorClass, checkBonus, hasProf, mod, passive, prof, saveBonus, spellAttack, spellDC, type Creature,
} from '../rules/creature';
import { fmtMod, type Adv } from '../rules/dice';
import { SPELLS } from '../rules/spells';
import { ABILITIES, CONDITION_INFO, SKILLS, SKILL_NAME, type CheckKind, type ConditionId } from '../rules/types';
import { condIcon } from '../render/view';
import { clear, esc, h, icon, layer, portrait, token } from './dom';
import { sfx } from './sfx';
import { getTimeScale } from '../render/tween';

export interface DockBtn {
  id: string;
  label: string;
  icon: string;
  on?: boolean;
  off?: boolean;
  ready?: boolean;
  cost?: 'action' | 'bonus';
  count?: number | string;
  cls?: string;
  onTap: () => void;
}

export interface SheetOption<T> {
  label: string;
  sub?: string;
  icon?: string;
  value: T;
  primary?: boolean;
  disabled?: string;
  check?: { kind: CheckKind; dc: number; adv?: string[]; dcHidden?: boolean };
  /** Fixed odds text, e.g. attack hit chance. */
  odds?: string;
  tag?: string;
}

export interface SheetSpec<T> {
  title: string;
  lead?: string;
  options: SheetOption<T>[];
  party?: Creature[];
  actorId?: string;
  cancel?: string | false;
  portraitName?: string;
}

export class Hud {
  root = layer();
  top = h('div', { class: 'hud-top' });
  party = h('div', { class: 'party' });
  banner = h('div', { class: 'banner' });
  chips = h('div', { class: 'chipbar' });
  bottom = h('div', { class: 'hud-bottom' });
  ticker = h('div', { class: 'ticker', role: 'log' });
  turnbar = h('div', { class: 'turnbar hidden' });
  order = h('div', { class: 'order hidden', 'aria-label': 'Turn order' });
  dock = h('div', { class: 'dock' });
  modal = layer();
  vignette = h('div', { class: 'vignette' });
  private logLines: { msg: string; tone: string }[] = [];
  onSelect: (i: number) => void = () => {};
  onSheet: (c: Creature) => void = () => {};
  private bannerTimer = 0;
  private lastHp = new Map<string, number>();
  /** Co-op: player who answers the next prompt (null = this device). */
  decider: string | null = null;
  /** Co-op: whose dock this is (null/'all' = everyone). */
  dockFor: string | null = null;
  /** Co-op: hero id -> controlling player, for the party plates. */
  owners: Record<string, { name: string; me: boolean }> = {};
  private openPrompts = new Set<() => void>();

  constructor() {
    this.root.prepend(this.vignette);
    // Menus, panels and toasts always sit above screens created later (title, lobby, builder).
    this.modal.classList.add('modal-layer');
    const mid = h('div', { style: 'display:flex;flex-direction:column;gap:6px;align-items:center;flex:1' }, this.banner, this.chips);
    this.top.append(this.party, mid);
    this.bottom.append(this.ticker, this.order, this.turnbar, this.dock);
    this.root.append(this.top, this.bottom);
    this.ticker.addEventListener('click', () => this.showLog());
    // A tap on the map can open a menu instantly; the browser then fires a "ghost" click at the
    // same spot, which would land on the new menu (closing it or picking an option). Swallow
    // clicks for a moment after any menu, panel or end screen appears.
    let openedAt = 0;
    new MutationObserver((muts) => {
      if (muts.some((m) => [...m.addedNodes].some((n) => !(n as HTMLElement).classList?.contains('toast')))) openedAt = performance.now();
    }).observe(this.modal, { childList: true });
    this.modal.addEventListener('click', (e) => {
      if (performance.now() - openedAt < 350) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  destroy(): void {
    this.root.remove();
    this.modal.remove();
  }

  /** Pixel heights of the HUD so the camera keeps the focus in the open middle. */
  insets(): { top: number; bottom: number } {
    const wide = window.innerWidth >= 900;
    return { top: wide ? 20 : this.party.getBoundingClientRect().bottom + 10, bottom: window.innerHeight - this.ticker.getBoundingClientRect().top + 10 };
  }

  // ---------- Party ----------

  renderParty(party: Creature[], activeIdx: number, turnId: string | null): void {
    clear(this.party);
    party.forEach((c, i) => {
      const frac = Math.max(0, c.hp / c.maxHp);
      const pips = c.slotsMax[0] + c.slotsMax[1] > 0
        ? h('span', { class: 'pips' }, ...[0, 1].flatMap((l) => Array.from({ length: c.slotsMax[l] }, (_, k) => h('b', { class: k < c.slots[l] ? '' : 'used', title: `${l + 1}${l ? 'nd' : 'st'}-level slot` }))))
        : null;
      const down = c.hp <= 0;
      const prev = this.lastHp.get(c.id);
      const conds = Object.keys(c.conds).filter((k) => k !== 'unconscious') as ConditionId[];
      const card = h('button', {
        class: `pc ${i === activeIdx ? 'active' : ''} ${turnId === c.id ? 'turn' : ''} ${down ? 'down' : ''} ${c.death.dead ? 'dead' : ''} ${prev !== undefined && c.hp < prev ? 'hit' : ''}`,
        'aria-label': `${c.name}, ${c.hp} of ${c.maxHp} hit points`,
        onclick: () => { sfx.ui(); if (i === activeIdx) this.onSheet(c); else this.onSelect(i); },
      },
        token(c.token),
        h('span', { class: 'nm' }, c.name),
        h('span', { class: 'bar' }, h('i', { class: frac <= 0.25 ? 'low' : frac <= 0.5 ? 'mid' : '', style: `width:${frac * 100}%` })),
        c.death.dead
          ? h('span', { class: 'hpn' }, 'Fallen')
          : down
            ? h('span', { class: 'hpn death' }, c.death.stable ? 'Stable' : h('span', {}, h('span', { class: 's' }, '●'.repeat(c.death.s) + '○'.repeat(3 - c.death.s)), ' ', h('span', { class: 'f' }, '●'.repeat(c.death.f) + '○'.repeat(3 - c.death.f))))
            : h('span', { class: 'hpn num' }, `${c.hp}/${c.maxHp}`, c.tempHp ? `+${c.tempHp}` : '', h('span', { class: 'ac' }, ` · AC ${armorClass(c)}`), pips),
        conds.length ? h('span', { class: 'conds' }, ...conds.slice(0, 3).map((k) => icon(condIcon(k)))) : null,
        this.owners[c.id] ? h('span', { class: `own ${this.owners[c.id].me ? 'me' : ''}` }, this.owners[c.id].me ? 'You' : this.owners[c.id].name) : null,
      );
      this.lastHp.set(c.id, c.hp);
      this.party.append(card);
    });
    const anyLow = party.some((c) => !c.death.dead && c.hp <= c.maxHp * 0.25);
    this.vignette.classList.toggle('danger', anyLow);
  }

  showBanner(title: string, text: string, ms = 4200): void {
    clear(this.banner);
    this.banner.append(h('div', { class: 'r' }, title), h('div', { class: 'i' }, text));
    this.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    // Long text gets extra reading time (about 60 ms per character), scaled by game speed.
    const read = Math.max(ms, 2500 + (title.length + text.length) * 60) * getTimeScale();
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('show'), read);
  }

  setChips(list: { text: string; icon?: string; cls?: string; toast?: string }[]): void {
    clear(this.chips);
    for (const c of list) {
      const el = h('button', { class: `tag ${c.cls ?? ''}`, onclick: c.toast ? () => { sfx.ui(); this.localToast(c.toast!); } : undefined }, c.icon ? icon(c.icon) : null, c.text);
      this.chips.append(el);
    }
  }

  // ---------- Log ----------

  log(msg: string, tone = 'info'): void {
    this.logLines.push({ msg, tone });
    if (this.logLines.length > 200) this.logLines.shift();
    clear(this.ticker);
    const prev = this.logLines[this.logLines.length - 2];
    if (prev) this.ticker.append(h('span', { class: `${prev.tone} older` }, prev.msg), h('br'));
    this.ticker.append(h('span', { class: tone }, msg));
  }

  showLog(): void {
    const body = h('div', { class: 'logfull' }, ...this.logLines.slice(-60).reverse().map((l) => h('p', { class: l.tone }, l.msg)));
    void this.openPanel('Journal', body);
  }

  // ---------- Dock ----------

  setDock(btns: DockBtn[]): void {
    clear(this.dock);
    this.dock.style.gridTemplateColumns = btns.length === 1 ? '1fr' : `repeat(${Math.min(5, Math.max(4, btns.length > 5 ? Math.ceil(btns.length / 2) : btns.length))}, 1fr)`;
    for (const b of btns) {
      this.dock.append(h('button', {
        class: `act ${b.on ? 'on' : ''} ${b.off ? 'off' : ''} ${b.ready ? 'ready' : ''} ${b.cls ?? ''}`,
        'aria-label': b.label,
        onclick: () => { if (b.off) { sfx.deny(); } else sfx.ui(); b.onTap(); },
      },
      b.cost ? h('span', { class: `cost ${b.cost === 'bonus' ? 'bonus' : ''}` }) : null,
      b.count !== undefined ? h('span', { class: 'cnt num' }, String(b.count)) : null,
      icon(b.icon), b.label));
    }
  }

  setTurnbar(info: { name: string; move: number; actions: number; bonus: boolean; reaction: boolean; round: number } | null): void {
    if (!info) { this.turnbar.classList.add('hidden'); return; }
    this.turnbar.classList.remove('hidden');
    clear(this.turnbar);
    this.turnbar.append(
      h('span', { class: 'who' }, info.name),
      h('span', { class: 'econ num' },
        h('span', {}, `${info.move * 5} ft`),
        h('span', { class: info.actions > 0 ? '' : 'spent' }, h('i'), info.actions > 1 ? `×${info.actions}` : ''),
        h('span', { class: info.bonus ? '' : 'spent' }, h('i', { class: 'bonus' })),
        h('span', { class: info.reaction ? '' : 'spent' }, h('i', { class: 'react' })),
        h('span', {}, `R${info.round}`),
      ),
    );
  }

  /** Initiative strip: who acts, in order, starting with the current creature. */
  setOrder(list: { id: string; name: string; token: string; init: number; current: boolean; foe: boolean; down: boolean }[] | null): void {
    if (!list || !list.length) { this.order.classList.add('hidden'); return; }
    this.order.classList.remove('hidden');
    clear(this.order);
    list.forEach((o, i) => {
      if (i === 1) this.order.append(h('span', { class: 'next' }, 'next'));
      this.order.append(h('span', { class: `oi ${o.current ? 'cur' : ''} ${o.foe ? 'foe' : 'ally'} ${o.down ? 'down' : ''}`, title: `${o.name} · initiative ${o.init}` },
        token(o.token, ''), h('b', { class: 'num' }, String(o.init))));
    });
  }

  toast(text: string): void {
    this.localToast(text);
  }

  /** A toast on this device only (never mirrored to co-op players). */
  localToast(text: string): void {
    this.modal.querySelectorAll('.toast').forEach((old) => old.remove());
    const t = h('div', { class: 'toast' }, text);
    // Reading time grows with length; CSS runs the same duration through --toast-ms.
    const ms = Math.max(2600, 1400 + text.length * 55) * getTimeScale();
    t.style.setProperty('--toast-ms', `${ms}ms`);
    this.modal.append(t);
    setTimeout(() => t.remove(), ms + 100);
  }

  // ---------- Sheets ----------

  /** Option sheet. Resolves with the chosen value and acting character, or null if cancelled. */
  sheet<T>(spec: SheetSpec<T>): Promise<{ value: T; actor: Creature | null } | null> {
    return new Promise((resolve) => {
      const scrim = h('div', { class: 'scrim' });
      const sheet = h('div', { class: 'sheet parchment torn' });
      scrim.append(sheet);
      const hasChecks = spec.options.some((o) => o.check) && spec.party && spec.party.length > 1;
      const able = (spec.party ?? []).filter((c) => c.hp > 0 && !c.death.dead);
      let actor: Creature | null = able.find((c) => c.id === spec.actorId) ?? null;
      if (!actor && hasChecks) {
        const k = spec.options.find((o) => o.check && !o.disabled)?.check?.kind;
        actor = k ? [...able].sort((a, b) => checkBonus(b, k) - checkBonus(a, k))[0] : able[0];
      }
      const done = (v: { value: T; actor: Creature | null } | null) => { this.openPrompts.delete(cancel); scrim.remove(); resolve(v); };
      const cancel = () => done(null);
      this.openPrompts.add(cancel);
      const render = () => {
        clear(sheet);
        if (spec.cancel !== false) sheet.append(h('button', { class: 'close', 'aria-label': 'Close', onclick: () => { sfx.ui(); done(null); } }, icon('close')));
        sheet.append(h('h2', {}, spec.title));
        if (spec.lead) sheet.append(h('p', { class: 'lead' }, spec.lead));
        if (hasChecks) {
          const chips = h('div', { class: 'who-chips' });
          const firstCheck = spec.options.find((o) => o.check)?.check;
          for (const c of spec.party!) {
            const down = c.hp <= 0 || c.death.dead;
            chips.append(h('button', { class: `who ${actor?.id === c.id ? 'on' : ''} ${down ? 'down' : ''}`, onclick: () => { actor = c; sfx.ui(); render(); } },
              token(c.token, ''), c.name, firstCheck ? h('span', { class: 'm num' }, fmtMod(checkBonus(c, firstCheck.kind))) : null));
          }
          sheet.append(h('div', { class: 'sec', style: 'margin-top:4px' }, 'Who tries?'), chips);
        }
        const opts = h('div', { class: 'opts' });
        for (const o of spec.options) {
          let oddsEl: HTMLElement | null = null;
          let sub = o.sub ?? '';
          if (o.check && actor) {
            const pv = checkPreview(actor, o.check.kind, o.check.adv ?? []);
            const p = chance(pv.bonus, o.check.dc, pv.adv);
            const advTxt = pv.adv === 'advantage' ? ' · Advantage' : pv.adv === 'disadvantage' ? ` · Disadvantage (${pv.dis.join(', ')})` : '';
            sub = `${checkLabel(o.check.kind)} ${fmtMod(pv.bonus)} vs DC ${o.check.dc} (${difficultyWord(o.check.dc)})${advTxt}${sub ? ` · ${sub}` : ''}`;
            oddsEl = h('span', { class: 'odds num' }, `${Math.round(p * 100)}%`, h('small', {}, 'chance'));
          } else if (o.odds) oddsEl = h('span', { class: 'odds num' }, o.odds);
          opts.append(h('button', {
            class: `opt ${o.primary ? 'primary' : ''} ${o.disabled ? 'off' : ''}`,
            onclick: () => {
              if (o.disabled) { sfx.deny(); return; }
              sfx.ui();
              done({ value: o.value, actor });
            },
          }, o.icon ? icon(o.icon) : h('span'), h('span', {}, o.tag ? h('span', { class: 'tagk' }, o.tag) : null, h('b', {}, o.label), sub ? h('small', {}, sub) : null, o.disabled ? h('small', { class: 'why' }, o.disabled) : null), oddsEl ?? h('span')));
        }
        sheet.append(opts);
      };
      render();
      scrim.addEventListener('click', (e) => { if (e.target === scrim && spec.cancel !== false) done(null); });
      this.modal.append(scrim);
    });
  }

  choose<T>(title: string, text: string, options: { label: string; value: T; detail?: string; primary?: boolean }[]): Promise<T> {
    return this.sheet<T>({ title, lead: text, cancel: false, options: options.map((o) => ({ label: o.label, sub: o.detail, value: o.value, primary: o.primary })) })
      .then((r) => (r ? r.value : options[options.length - 1].value));
  }

  /** A result panel the whole table should see (co-op mirrors it). */
  panel(title: string, body: HTMLElement, center = false): Promise<void> {
    return this.openPanel(title, body, center);
  }

  /** Close every open option sheet or dialogue (they resolve as cancelled). */
  dismissPrompts(): void {
    for (const f of [...this.openPrompts]) f();
  }

  openPanel(title: string, body: HTMLElement, center = false): Promise<void> {
    return new Promise((resolve) => {
      const scrim = h('div', { class: `scrim ${center ? 'center' : ''}` });
      const close = () => { scrim.remove(); resolve(); };
      const sheet = h('div', { class: 'sheet parchment torn' },
        h('button', { class: 'close', 'aria-label': 'Close', onclick: () => { sfx.ui(); close(); } }, icon('close')),
        h('h2', {}, title), body);
      scrim.append(sheet);
      scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
      this.modal.append(scrim);
    });
  }

  // ---------- Dialogue ----------

  dialogue<T>(speaker: { name: string; portrait?: string; narrator: boolean }, text: string, options: SheetOption<T>[], party: Creature[],
    mode: { readonly?: string; override?: () => void } = {}): Promise<{ value: T; actor: Creature | null } | null> {
    return new Promise((resolve) => {
      const scrim = h('div', { class: 'scrim' });
      const cancel = () => { this.openPrompts.delete(cancel); scrim.remove(); resolve(null); };
      this.openPrompts.add(cancel);
      const wrap = h('div', { class: 'dlg' });
      const page = h('div', { class: 'page parchment torn' });
      wrap.append(h('div', { class: 'head' }, speaker.portrait ? portrait(speaker.portrait, '') : null, h('div', { class: 'spk' }, speaker.name)), page);
      scrim.append(wrap);
      const able = party.filter((c) => c.hp > 0 && !c.death.dead);
      let actor: Creature = able[0];
      const firstKind = options.find((o) => o.check)?.check?.kind;
      if (firstKind) actor = [...able].sort((a, b) => checkBonus(b, firstKind) - checkBonus(a, firstKind))[0];
      const render = () => {
        clear(page);
        page.append(h('p', { class: `say ${speaker.narrator ? 'nar' : ''}` }, text));
        if (mode.readonly) {
          page.append(h('p', { class: 'waitnote' }, mode.readonly,
            mode.override ? h('button', { class: 'chip', style: 'margin-left:8px', onclick: () => { cancel(); mode.override!(); } }, 'Answer for them') : null));
        }
        if (options.some((o) => o.check) && !mode.readonly) {
          const chips = h('div', { class: 'who-chips' });
          for (const c of party) {
            chips.append(h('button', { class: `who ${actor.id === c.id ? 'on' : ''} ${c.hp <= 0 ? 'down' : ''}`, onclick: () => { actor = c; sfx.ui(); render(); } },
              token(c.token, ''), c.name));
          }
          page.append(h('div', { class: 'sec', style: 'margin-top:0' }, 'Who speaks?'), chips);
        }
        const opts = h('div', { class: 'opts' });
        for (const o of options) {
          let sub = o.sub ?? '';
          let odds: HTMLElement | null = null;
          if (o.check) {
            const pv = checkPreview(actor, o.check.kind, o.check.adv ?? []);
            const p = chance(pv.bonus, o.check.dc, pv.adv);
            const a = pv.adv === 'advantage' ? ` · Advantage (${(o.check.adv ?? []).join(', ')})` : pv.adv === 'disadvantage' ? ` · Disadvantage (${pv.dis.join(', ')})` : '';
            sub = `${SKILL_NAME[o.check.kind as keyof typeof SKILL_NAME] ?? o.check.kind} ${fmtMod(pv.bonus)} vs DC ${o.check.dc}${a}`;
            odds = h('span', { class: 'odds num' }, `${Math.round(p * 100)}%`, h('small', {}, 'chance'));
          }
          opts.append(h('button', {
            class: `opt ${o.disabled || mode.readonly ? 'off' : ''} ${o.primary ? 'primary' : ''}`,
            onclick: () => { if (o.disabled || mode.readonly) { sfx.deny(); return; } sfx.ui(); this.openPrompts.delete(cancel); scrim.remove(); resolve({ value: o.value, actor }); },
          }, o.icon ? icon(o.icon) : h('span'), h('span', {}, o.tag ? h('span', { class: 'tagk' }, o.tag) : null, h('b', { style: 'font-family:var(--body);font-weight:700' }, o.label), sub ? h('small', {}, sub) : null), odds ?? h('span')));
        }
        page.append(opts);
      };
      render();
      this.modal.append(scrim);
    });
  }

  // ---------- Character sheet ----------

  showCharacter(c: Creature): void {
    const cls = c.classId ? CLASSES[c.classId] : null;
    const body = h('div', {});
    body.append(h('div', { class: 'portrait-row' }, portrait(c.portrait ?? c.token),
      h('div', {},
        h('p', { class: 'lead', style: 'margin:0' }, `Level ${c.level} ${c.species ? SPECIES[c.species].name : ''} ${cls?.name ?? ''}`),
        c.background ? h('p', { class: 'hint' }, `${BACKGROUNDS[c.background].name} · ${c.xp} XP`) : null,
        h('div', { class: 'kv num' },
          h('b', {}, 'HP'), `${Math.max(0, c.hp)} / ${c.maxHp}${c.aidBonus ? ' (Aid)' : ''}`,
          h('b', {}, 'AC'), String(armorClass(c)),
          h('b', {}, 'Speed'), `${c.speed} ft`,
          h('b', {}, 'Prof.'), fmtMod(prof(c)),
          h('b', {}, 'Hit dice'), `${c.hitDiceLeft} × d${c.hitDie}`,
        ))));
    body.append(h('div', { class: 'sec' }, 'Abilities & saves'), h('div', { class: 'stats6' },
      ...ABILITIES.map((a) => h('div', {}, h('div', { class: 'k' }, a.toUpperCase()), h('div', { class: 'v num' }, String(c.base[a])),
        h('div', { class: 'm num' }, `${fmtMod(mod(c, a))} · save ${fmtMod(saveBonus(c, a))}${c.saveProfs.includes(a) ? '●' : ''}`)))));
    body.append(h('div', { class: 'sec' }, `Skills · passive Perception ${passive(c, 'perception')}`), h('div', { class: 'skillgrid' },
      ...[...SKILLS, 'tools' as const].map((k) => h('span', { class: hasProf(c, k) ? 'p' : '' }, `${hasProf(c, k) ? '● ' : '○ '}${SKILL_NAME[k]}`, h('em', { class: 'num' }, fmtMod(checkBonus(c, k)))))));
    if (c.weapons.length) body.append(h('div', { class: 'sec' }, 'Attacks'), ...c.weapons.map((w) => h('p', { class: 'feat' }, h('b', {}, w.name), ` ${w.dmg} ${w.type}${w.melee ? '' : `, range ${w.range * 5}/${(w.long ?? w.range) * 5} ft`}${w.mastery ? ` · mastery: ${w.mastery}` : ''}`)));
    if (c.cantrips.length || c.spells.length) {
      body.append(h('div', { class: 'sec' }, `Spells · DC ${spellDC(c)} · attack ${fmtMod(spellAttack(c))} · slots ${c.slots[0]}/${c.slotsMax[0]}${c.slotsMax[1] ? `, ${c.slots[1]}/${c.slotsMax[1]}` : ''}`),
        ...[...c.cantrips, ...c.spells].map((s) => h('p', { class: 'feat' }, h('b', {}, `${SPELLS[s].name}${SPELLS[s].level ? ` (${SPELLS[s].level})` : ' (cantrip)'}`), ` ${SPELLS[s].text}`)));
    }
    if (cls) {
      const res: string[] = [];
      if (c.classId === 'fighter') res.push(`Second Wind ${c.res.secondWind}/2`, c.level >= 2 ? `Action Surge ${c.res.actionSurge}/1` : '');
      if (c.classId === 'cleric' && c.level >= 2) res.push(`Channel Divinity ${c.res.channel}/2`);
      if (c.classId === 'wizard') res.push(`Arcane Recovery ${c.res.arcaneRecovery ? 'ready' : 'used'}`);
      if (c.species === 'human') res.push(`Heroic Inspiration ${c.res.inspiration ? 'ready' : 'used'}`);
      body.append(h('div', { class: 'sec' }, 'Features'),
        ...[res.filter(Boolean).length ? h('p', { class: 'feat' }, h('b', {}, 'Resources: '), res.filter(Boolean).join(' · ')) : null,
          ...cls.features.filter((f) => f.level <= c.level).map((f) => h('p', { class: 'feat' }, h('b', {}, f.name), ` ${f.text}`)),
          c.species ? h('p', { class: 'feat' }, h('b', {}, SPECIES[c.species].name), ` ${SPECIES[c.species].text}`) : null].filter((x): x is HTMLParagraphElement => !!x));
    }
    const conds = Object.keys(c.conds) as ConditionId[];
    if (conds.length) body.append(h('div', { class: 'sec' }, 'Conditions'), ...conds.map((k) => h('p', { class: 'feat' }, h('b', {}, CONDITION_INFO[k].name), ` ${CONDITION_INFO[k].text}`)));
    void this.openPanel(c.name, body);
  }

  showCreature(c: Creature, extra: string[] = []): void {
    const body = h('div', {},
      h('div', { class: 'portrait-row' }, token(c.token, 'portrait'),
        h('div', { class: 'kv num' },
          h('b', {}, 'HP'), `${Math.max(0, c.hp)} / ${c.maxHp}`,
          h('b', {}, 'AC'), String(armorClass(c)),
          h('b', {}, 'Speed'), `${c.speed} ft`)),
      h('div', { class: 'sec' }, 'Known'),
      ...extra.map((t) => h('p', { class: 'feat', html: esc(t).replace(/^([^:]+):/, '<b>$1:</b>') })),
      ...(Object.keys(c.conds) as ConditionId[]).map((k) => h('p', { class: 'feat' }, h('b', {}, CONDITION_INFO[k].name), ` ${CONDITION_INFO[k].text}`)),
    );
    void this.openPanel(c.name, body);
  }

  // ---------- End & level-up screens ----------

  endScreen(opts: { title: string; text: string; emblem?: boolean; lines?: string[]; buttons: { label: string; primary?: boolean; onTap: () => void }[] }): () => void {
    const el = h('div', { class: 'end-screen' },
      h('div', { class: 'sheet parchment torn big' },
        opts.emblem ? h('img', { class: 'emblem', src: '/art/ui/emblem.svg', alt: '' }) : null,
        h('h2', {}, opts.title), h('p', { class: 'lead' }, opts.text),
        ...(opts.lines ?? []).map((l) => h('p', { class: 'feat', style: 'text-align:left' }, l)),
        h('div', { class: 'opts', style: 'margin-top:12px' }, ...opts.buttons.map((b) => h('button', { class: `btn ${b.primary ? 'primary' : ''}`, onclick: () => { sfx.ui(); b.onTap(); } }, b.label)))));
    this.modal.append(el);
    return () => el.remove();
  }

  levelUp(reports: { name: string; from: number; to: number; hpGain: number; gains: string[] }[]): Promise<void> {
    sfx.level();
    const body = h('div', { class: 'big' }, h('img', { class: 'emblem', src: '/art/icons/xp.svg', alt: '' }),
      h('p', { class: 'lead' }, 'The candle burns through the night. You wake changed.'),
      ...reports.map((r) => h('div', { class: 'lvl' }, h('b', {}, `${r.name}: level ${r.from} → ${r.to}`), h('ul', {}, h('li', {}, `+${r.hpGain} maximum HP`), ...r.gains.map((g) => h('li', {}, g))))));
    return this.openPanel('Level up!', body, true);
  }
}

export function advWord(a: Adv): string {
  return a === 'advantage' ? 'Advantage' : a === 'disadvantage' ? 'Disadvantage' : '';
}
