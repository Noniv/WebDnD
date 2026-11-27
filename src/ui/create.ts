// Party builder: four adventurers. Sensible defaults so play starts in seconds,
// every choice editable for those who want to build.
import {
  BACKGROUNDS, CLASSES, DEFAULT_BG, DEFAULT_NAMES, DEFAULT_SPECIES, SPECIES, STANDARD_ARRAY, abilityMod,
  type BackgroundId, type ClassId, type SpeciesId,
} from '../rules/content';
import {
  allSkills, armorClass, bonusOf, buildCharacter, finalScores, spellAttack, spellDC, weaponToHit, type CharacterBuild,
} from '../rules/creature';
import { fmtMod } from '../rules/dice';
import { ABILITIES, ABILITY_NAME, SKILLS, SKILL_NAME, type Ability, type Skill } from '../rules/types';
import { SPELLS } from '../rules/spells';
import { clear, h, icon, layer, portrait, token } from './dom';
import { sfx } from './sfx';

const ORDER: ClassId[] = ['fighter', 'rogue', 'wizard', 'cleric'];

function bonusFor(cls: ClassId, bg: BackgroundId): { plus2: Ability; plus1: Ability } {
  const pri = CLASSES[cls].array;
  const opts = [...BACKGROUNDS[bg].abilities].sort((a, b) => pri.indexOf(a) - pri.indexOf(b));
  return { plus2: opts[0], plus1: opts[1] };
}

function fixedSkills(b: Pick<CharacterBuild, 'background' | 'species'>): Skill[] {
  const out = [...BACKGROUNDS[b.background].skills];
  const sp = SPECIES[b.species].bonusSkill;
  if (sp && sp !== 'choice') out.push(sp);
  return out;
}

function fillSkills(b: CharacterBuild): void {
  const cls = CLASSES[b.classId];
  const fixed = fixedSkills(b);
  b.skills = b.skills.filter((s) => cls.skillChoices.includes(s) && !fixed.includes(s));
  for (const s of [...cls.defaultSkills, ...cls.skillChoices]) {
    if (b.skills.length >= cls.numSkills) break;
    if (!fixed.includes(s) && !b.skills.includes(s)) b.skills.push(s);
  }
  if (b.species === 'human') {
    if (!b.bonusSkill || fixed.includes(b.bonusSkill) || b.skills.includes(b.bonusSkill)) {
      b.bonusSkill = SKILLS.find((s) => !fixed.includes(s) && !b.skills.includes(s));
    }
  } else b.bonusSkill = undefined;
}

export function defaultBuild(cls: ClassId, i: number): CharacterBuild {
  const def = CLASSES[cls];
  const scores = {} as Record<Ability, number>;
  def.array.forEach((a, k) => (scores[a] = STANDARD_ARRAY[k]));
  const bg = DEFAULT_BG[cls];
  const b: CharacterBuild = {
    name: DEFAULT_NAMES[cls][i % 4], classId: cls, species: DEFAULT_SPECIES[cls], background: bg, scores,
    ...bonusFor(cls, bg), skills: [],
  };
  fillSkills(b);
  return b;
}

export interface CreateOptions {
  /** Start from these builds instead of the defaults. */
  builds?: CharacterBuild[];
  /** Co-op guests edit only their own hero. */
  only?: number;
  title?: string;
  doneLabel?: string;
}

export function showCreate(onDone: (builds: CharacterBuild[]) => void, onBack: () => void, opts: CreateOptions = {}): () => void {
  const root = layer();
  const builds = opts.builds ? opts.builds.map((b) => JSON.parse(JSON.stringify(b)) as CharacterBuild) : ORDER.map((c, i) => defaultBuild(c, i));
  let sel = opts.only ?? 0;
  let swapPick: Ability | null = null;
  let justSwapped: [Ability, Ability] | null = null;

  const slotsEl = h('div', { class: 'slots' });
  const body = h('div', { class: 'sheet-scroll' });

  const renderSlots = () => {
    clear(slotsEl);
    builds.forEach((b, i) => {
      if (opts.only !== undefined && i !== opts.only) return;
      slotsEl.append(h('button', { class: `slot ${i === sel ? 'on' : ''}`, onclick: () => { sel = i; swapPick = null; sfx.ui(); render(); } },
        token(b.classId, ''), h('span', { class: 'nm' }, b.name || '—'), h('span', { class: 'cl' }, CLASSES[b.classId].name)));
    });
  };

  const render = () => {
    renderSlots();
    clear(body);
    const b = builds[sel];
    const cls = CLASSES[b.classId];
    const fin = finalScores(b);
    const preview = buildCharacter(b);

    // Identity
    const nameIn = h('input', { class: 'name-input', value: b.name, maxlength: 16, 'aria-label': 'Name' }) as HTMLInputElement;
    nameIn.addEventListener('input', () => { b.name = nameIn.value; renderSlots(); });
    body.append(h('div', { class: 'card parchment torn' },
      h('div', { class: 'portrait-row' }, portrait(b.classId),
        h('div', { style: 'flex:1;min-width:0' },
          h('h3', {}, 'Name'), nameIn,
          h('p', { class: 'hint' }, `${SPECIES[b.species].name} ${cls.name} · ${BACKGROUNDS[b.background].name}`),
          h('p', { class: 'hint num' }, `HP ${preview.maxHp} · AC ${armorClass(preview)} · Speed ${preview.speed} ft`),
        )),
    ));

    // Class
    const classGrid = h('div', { class: 'choices' });
    for (const c of ORDER) {
      const d = CLASSES[c];
      classGrid.append(h('button', {
        class: `choice ${b.classId === c ? 'on' : ''}`,
        onclick: () => {
          if (b.classId === c) return;
          const keepName = b.name;
          const nb = defaultBuild(c, sel);
          Object.assign(b, nb, { name: DEFAULT_NAMES[b.classId].includes(keepName) ? nb.name : keepName });
          sfx.ui(); render();
        },
      }, token(c, ''), h('b', {}, d.name), h('small', {}, `${d.role}. ${d.blurb}`)));
    }
    body.append(h('div', { class: 'card parchment torn' }, h('h3', {}, 'Class'), classGrid,
      h('div', { class: 'sec' }, 'Level 1 features'),
      ...cls.features.filter((f) => f.level === 1).map((f) => h('p', { class: 'feat' }, h('b', {}, f.name), ` ${f.text}`)),
      cls.cantrips ? h('p', { class: 'feat' }, h('b', {}, 'Spells '), [...cls.cantrips, ...(cls.spellsByLevel?.[1] ?? [])].map((s) => SPELLS[s].name).join(', ')) : null,
    ));

    // Species
    const spGrid = h('div', { class: 'choices' });
    for (const s of Object.values(SPECIES)) {
      spGrid.append(h('button', {
        class: `choice ${b.species === s.id ? 'on' : ''}`,
        onclick: () => { b.species = s.id as SpeciesId; fillSkills(b); sfx.ui(); render(); },
      }, h('b', {}, s.name), h('small', {}, s.text)));
    }
    body.append(h('div', { class: 'card parchment torn' }, h('h3', {}, 'Species'), spGrid));

    // Background
    const bgGrid = h('div', { class: 'choices' });
    for (const g of Object.values(BACKGROUNDS)) {
      bgGrid.append(h('button', {
        class: `choice ${b.background === g.id ? 'on' : ''}`,
        onclick: () => { b.background = g.id; Object.assign(b, bonusFor(b.classId, g.id), { spread: false }); fillSkills(b); sfx.ui(); render(); },
      }, h('b', {}, g.name), h('small', {}, `${g.text} ${g.skills.map((k) => SKILL_NAME[k]).join(', ')}. ${g.abilities.map((a) => a.toUpperCase()).join('/')}`)));
    }
    body.append(h('div', { class: 'card parchment torn' }, h('h3', {}, 'Background'), bgGrid));

    // Abilities: number card + background bonus = score -> modifier
    body.append(abilitiesCard(b, fin, preview, swapPick, (a) => {
      if (!swapPick) { swapPick = a; sfx.ui(); }
      else {
        if (swapPick !== a) { const t = b.scores[a]; b.scores[a] = b.scores[swapPick]; b.scores[swapPick] = t; justSwapped = [a, swapPick]; sfx.coin(); }
        swapPick = null;
      }
      render();
      justSwapped = null;
    }, render, justSwapped));

    // Skills
    const fixed = fixedSkills(b);
    const chips = h('div', { class: 'chips' });
    for (const s of SKILLS) {
      const isFixed = fixed.includes(s);
      const isClass = cls.skillChoices.includes(s);
      const on = isFixed || b.skills.includes(s) || b.bonusSkill === s;
      const canHuman = b.species === 'human' && !isFixed && !b.skills.includes(s);
      chips.append(h('button', {
        class: `chip ${on ? 'on' : ''} ${isFixed ? 'fixed' : ''} ${!isFixed && !isClass && !canHuman ? 'off' : ''}`,
        onclick: () => {
          if (isFixed) return;
          if (b.skills.includes(s)) { b.skills = b.skills.filter((x) => x !== s); }
          else if (isClass && b.skills.length < cls.numSkills) b.skills.push(s);
          else if (b.species === 'human') b.bonusSkill = s;
          else { sfx.deny(); return; }
          sfx.ui(); render();
        },
      }, `${SKILL_NAME[s]}${isFixed ? ' ✦' : ''}`));
    }
    const all = allSkills(b);
    body.append(h('div', { class: 'card parchment torn' }, h('h3', {}, `Skills · ${all.length} proficient`), chips,
      h('p', { class: 'hint' }, `✦ from background or species. Pick ${cls.numSkills} from your class (${b.skills.length}/${cls.numSkills})${b.species === 'human' ? ', plus one of any (Skillful)' : ''}.${preview.tools ? " Thieves' Tools proficient." : ''}`)));
  };

  const screen = h('div', { class: 'create' },
    h('header', {},
      h('button', { class: 'btn ghost', onclick: () => { sfx.ui(); onBack(); } }, '←'),
      h('h2', {}, opts.title ?? 'Gather the party'),
      h('button', { class: 'btn primary', onclick: () => { sfx.success(); onDone(builds); } }, opts.doneLabel ?? 'Descend'),
    ),
    slotsEl, body,
  );
  root.append(screen);
  render();
  return () => root.remove();
}

// ---------- Abilities card ----------

const ABILITY_USE: Record<Ability, string> = {
  str: 'Athletics, melee weapons',
  dex: 'Armor Class, Stealth, bows, finesse, initiative',
  con: 'Hit points, holding concentration',
  int: 'Arcana, Investigation, wizard spells',
  wis: 'Perception, Insight, cleric spells',
  cha: 'Persuasion, Intimidation',
};

function abilitiesCard(
  b: CharacterBuild, fin: Record<Ability, number>, preview: ReturnType<typeof buildCharacter>,
  pick: Ability | null, onCard: (a: Ability) => void, rerender: () => void, swapped: [Ability, Ability] | null,
): HTMLElement {
  const cls = CLASSES[b.classId];
  const bg = BACKGROUNDS[b.background];
  const key = cls.array.slice(0, 2);

  // How to read it
  const scale = h('div', { class: 'scale num' },
    ...[[8, -1], [10, 0], [12, 1], [14, 2], [16, 3], [18, 4]].map(([s, m]) => h('span', {}, h('b', {}, String(s)), fmtMod(m))));
  const explain = h('div', { class: 'explain' },
    h('p', {}, h('b', {}, 'Number card'), ' + ', h('b', { class: 'g' }, 'background bonus'), ' = ', h('b', {}, 'score'), '. The ',
      h('b', { class: 'o' }, 'modifier'), ' is what gets added to your d20 rolls: every 2 points above 10 is +1.'),
    scale);

  // One row per ability
  const rows = h('div', { class: 'abrows' });
  for (const a of ABILITIES) {
    const bonus = bonusOf(b, a);
    const eligible = bg.abilities.includes(a);
    const isKey = key.includes(a);
    const flash = swapped?.includes(a) ? 'flash' : '';
    rows.append(h('div', { class: `abrow ${isKey ? 'key' : ''} ${pick === a ? 'picking' : ''}` },
      icon(a, 'aicon'),
      h('div', { class: 'aname' },
        h('b', {}, ABILITY_NAME[a]),
        h('small', {}, isKey ? h('span', { class: 'keytag' }, a === key[0] ? 'Main' : 'Useful') : null, ABILITY_USE[a])),
      h('button', {
        class: `numcard num ${pick === a ? 'up' : pick ? 'target' : ''} ${flash}`,
        'aria-label': `${ABILITY_NAME[a]} number card ${b.scores[a]}${pick && pick !== a ? `, tap to swap with ${ABILITY_NAME[pick]}` : ''}`,
        onclick: () => onCard(a),
      }, String(b.scores[a])),
      h('span', { class: 'op' }, '+'),
      h('span', { class: `sticker num ${bonus ? '' : eligible ? 'empty' : 'none'}`, title: bonus ? `${bg.name} bonus` : eligible ? `${bg.name} can boost this` : 'No bonus available' },
        bonus ? `+${bonus}` : eligible ? '·' : '0'),
      h('span', { class: 'op' }, '='),
      h('span', { class: 'tot num' }, String(fin[a])),
      h('span', { class: `modbadge num ${abilityMod(fin[a]) > 0 ? 'pos' : abilityMod(fin[a]) < 0 ? 'neg' : ''}` }, fmtMod(abilityMod(fin[a]))),
    ));
  }

  const hint = h('p', { class: 'hint swaphint' }, pick
    ? `Now tap another number card to swap it with ${ABILITY_NAME[pick]}'s ${b.scores[pick]}. Bonuses stay where they are.`
    : 'Tap a number card, then another, to swap them. The cards are 15, 14, 13, 12, 10 and 8. Bonuses stay where they are.');

  // Background bonus control
  const pickChip = (label: string, on: boolean, fn: () => void) =>
    h('button', { class: `chip ${on ? 'on' : ''}`, onclick: () => { fn(); sfx.ui(); rerender(); } }, label);
  const bonusBox = h('div', { class: 'bonusbox' },
    h('div', { class: 'sec', style: 'margin-top:0' }, `${bg.name} bonus · can raise ${bg.abilities.map((x) => x.toUpperCase()).join(', ')}`),
    h('div', { class: 'seg' },
      pickChip('+2 and +1', !b.spread, () => { b.spread = false; }),
      pickChip('+1 to all three', !!b.spread, () => { b.spread = true; })),
    ...(b.spread ? [] : [
      h('div', { class: 'brow' }, h('span', { class: 'sticker num' }, '+2'), h('span', {}, 'goes to'),
        ...bg.abilities.map((x) => pickChip(x.toUpperCase(), b.plus2 === x, () => { if (b.plus1 === x) b.plus1 = b.plus2; b.plus2 = x; }))),
      h('div', { class: 'brow' }, h('span', { class: 'sticker num' }, '+1'), h('span', {}, 'goes to'),
        ...bg.abilities.map((x) => pickChip(x.toUpperCase(), b.plus1 === x, () => { if (b.plus2 === x) b.plus2 = b.plus1; b.plus1 = x; }))),
    ]),
  );

  // What it means in play
  const w = preview.weapons[0];
  const effect = cls.caster
    ? `Spell attack ${fmtMod(spellAttack(preview))} · Spell save DC ${spellDC(preview)}`
    : `${w.name} ${fmtMod(weaponToHit(preview, w))} to hit`;
  const result = h('p', { class: 'effect num' }, h('b', {}, 'In play: '), `${effect} · HP ${preview.maxHp} · AC ${armorClass(preview)}`);

  const reset = h('button', {
    class: 'chip', onclick: () => {
      const d = defaultBuild(b.classId, 0);
      b.scores = d.scores; Object.assign(b, bonusFor(b.classId, b.background), { spread: false });
      sfx.ui(); rerender();
    },
  }, `Suggested for ${cls.name}`);

  return h('div', { class: 'card parchment torn' },
    h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, h('h3', { style: 'margin:0' }, 'Abilities'), reset),
    explain, rows, hint, bonusBox, result);
}
