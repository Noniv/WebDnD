// Title screen: a statement of identity, not a form.
import { h, layer } from './dom';
import type { OmenData } from '../game/state';
import { sfx, initAudio } from './sfx';

export interface TitleActions {
  onNew: () => void;
  onCoop: () => void;
  onContinue: (() => void) | null;
  continueLabel?: string;
  onSettings: () => void;
  onCredits: () => void;
}

export function showTitle(omen: OmenData, a: TitleActions): () => void {
  const root = layer();
  const embers = h('div', { class: 'embers' });
  for (let i = 0; i < 26; i++) {
    const e = h('i', { style: `left:${Math.random() * 100}%;animation-duration:${5 + Math.random() * 7}s;animation-delay:${-Math.random() * 10}s;` });
    embers.append(e);
  }
  const click = (fn: () => void) => () => { initAudio(); sfx.ui(); fn(); };
  const screen = h('div', { class: 'title-screen' },
    embers,
    h('img', { class: 'emblem', src: '/art/ui/emblem.svg', alt: '' }),
    h('h1', {}, 'EMBERDEEP'),
    h('div', { class: 'sub' }, 'a 5e-compatible delve'),
    h('div', { class: 'omen parchment torn' },
      h('div', { class: 'k' }, `Tonight's omen · ${omen.date}`),
      h('div', { class: 'n' }, omen.omen.name),
      h('div', { class: 't' }, omen.omen.text),
    ),
    h('div', { class: 'menu' },
      a.onContinue ? h('button', { class: 'btn primary', onclick: click(a.onContinue) }, a.continueLabel ?? 'Continue the delve') : null,
      h('button', { class: `btn ${a.onContinue ? '' : 'primary'}`, onclick: click(a.onNew) }, 'Play solo'),
      h('button', { class: 'btn', onclick: click(a.onCoop) }, 'Play together · 1–4 players'),
      h('div', { class: 'row', style: 'gap:8px' },
        h('button', { class: 'btn ghost', style: 'flex:1', onclick: click(a.onSettings) }, 'Settings'),
        h('button', { class: 'btn ghost', style: 'flex:1', onclick: click(a.onCredits) }, 'Credits'),
      ),
    ),
    h('p', { class: 'legal' }, 'Emberdeep is an independent, 5e-compatible game built on the System Reference Document 5.2.1 (CC-BY-4.0). Not affiliated with Wizards of the Coast.'),
  );
  root.append(screen);
  return () => root.remove();
}
