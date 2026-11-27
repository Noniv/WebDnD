// The free-text conversation panel used with the AI dungeon master. One panel renders a
// TalkVM (protocol.ts), so the host, solo players and co-op guests all draw the same thing;
// only the player whose turn it is gets the text box.
import type { Creature } from '../rules/creature';
import { checkBonus } from '../rules/creature';
import { fmtMod } from '../rules/dice';
import { SKILL_NAME } from '../rules/types';
import type { TalkVM } from '../net/protocol';
import { clear, h, portrait, token } from './dom';
import { sfx } from './sfx';

export interface TalkHandlers {
  onSend: (text: string, actorId: string | null) => void;
  onLeave: () => void;
  onContinue: () => void;
  /** Host only: answer for an absent or slow player. */
  onTakeOver?: () => void;
}

export class TalkPanel {
  readonly scrim = h('div', { class: 'scrim talk-scrim' });
  private head = h('div', { class: 'head' });
  private log = h('div', { class: 'talk-log' });
  private status = h('p', { class: 'waitnote talk-status' });
  private controls = h('div', { class: 'talk-controls' });
  private input = h('textarea', { class: 'talk-input', rows: 2, maxlength: 240, placeholder: 'What do you say or do?', 'aria-label': 'What do you say or do?' }) as HTMLTextAreaElement;
  private shownLines = 0;
  private vm: TalkVM | null = null;
  private actorId: string | null = null;
  private ctlKey = '';
  private handlers: TalkHandlers;

  constructor(parent: HTMLElement, handlers: TalkHandlers) {
    this.handlers = handlers;
    const page = h('div', { class: 'page parchment torn talk-page' }, this.log, this.status, this.controls);
    this.scrim.append(h('div', { class: 'dlg talk' }, this.head, page));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    parent.append(this.scrim);
  }

  destroy(): void { this.scrim.remove(); }

  private send(text = this.input.value): void {
    const t = text.trim();
    if (!t) { sfx.deny(); this.input.focus(); return; }
    sfx.ui();
    this.input.value = '';
    this.handlers.onSend(t.slice(0, 240), this.actorId);
  }

  /** Redraw from the view model. `mine`: this device holds the turn. `party`: heroes this player may speak as. */
  update(vm: TalkVM, mine: boolean, party: Creature[], names: Record<string, string> = {}, host = false): void {
    const fresh = !this.vm || this.vm.id !== vm.id;
    this.vm = vm;
    this.scrim.style.display = vm.rolling ? 'none' : '';
    if (fresh) {
      clear(this.head);
      this.head.append(portrait(vm.npc.portrait, ''), h('div', { class: 'spk' }, vm.npc.name, h('small', {}, vm.npc.title)));
      clear(this.log);
      this.shownLines = 0;
    }
    if (vm.lines.length < this.shownLines) { clear(this.log); this.shownLines = 0; }
    for (let i = this.shownLines; i < vm.lines.length; i++) {
      const l = vm.lines[i];
      if (l.who === 'npc') this.log.append(h('p', { class: 'say' }, l.text));
      else if (l.who === 'hero') this.log.append(h('p', { class: 'said' }, h('b', {}, `${l.name}: `), l.text));
      else if (l.who === 'roll') this.log.append(h('p', { class: `rollnote ${l.ok ? 'ok' : 'bad'}` }, l.text));
      else this.log.append(h('p', { class: 'note' }, l.text));
    }
    if (vm.lines.length !== this.shownLines) {
      this.shownLines = vm.lines.length;
      requestAnimationFrame(() => { this.log.scrollTop = this.log.scrollHeight; });
    }

    const who = vm.turn ? names[vm.turn] ?? 'Another player' : '';
    this.status.textContent = vm.thinking ? `${vm.npc.name.split(',')[0]} is thinking…` : !mine && vm.turn && !vm.done ? `${who} is speaking for the party…` : '';
    this.status.classList.toggle('thinking', vm.thinking);

    // Controls: only rebuilt when their inputs change, so typing is never interrupted.
    const able = party.filter((c) => c.hp > 0 && !c.death.dead);
    if (!this.actorId || !able.some((c) => c.id === this.actorId)) this.actorId = vm.actorId && able.some((c) => c.id === vm.actorId) ? vm.actorId : able[0]?.id ?? null;
    const key = JSON.stringify([vm.id, vm.ask, mine, vm.thinking, vm.done, vm.suggestions, able.map((c) => c.id), this.actorId, host, vm.turn]);
    if (key === this.ctlKey) return;
    this.ctlKey = key;
    clear(this.controls);
    if (vm.done) {
      if (mine) this.controls.append(h('button', { class: 'btn primary', style: 'width:100%', onclick: () => { sfx.ui(); this.handlers.onContinue(); } }, 'Continue'));
      return;
    }
    if (!mine) {
      if (host && this.handlers.onTakeOver && vm.turn && !vm.thinking) {
        this.controls.append(h('button', { class: 'chip', onclick: () => { sfx.ui(); this.handlers.onTakeOver!(); } }, 'Answer for them'));
      }
      return;
    }
    if (vm.thinking) return;
    if (able.length > 1) {
      const chips = h('div', { class: 'who-chips' });
      for (const c of able) {
        chips.append(h('button', { class: `who ${this.actorId === c.id ? 'on' : ''}`, onclick: () => { this.actorId = c.id; this.ctlKey = ''; sfx.ui(); this.update(vm, mine, party, names, host); } },
          token(c.token, ''), c.name, h('small', {}, ` ${fmtMod(checkBonus(c, 'persuasion'))}`)));
      }
      this.controls.append(h('div', { class: 'sec', style: 'margin-top:0' }, 'Who speaks?'), chips);
    }
    if (vm.suggestions.length) {
      const sug = h('div', { class: 'talk-sugs' });
      for (const s of vm.suggestions) sug.append(h('button', { class: 'chip', onclick: () => this.send(s) }, s));
      this.controls.append(sug);
    }
    const sendBtn = h('button', { class: 'btn primary talk-send', onclick: () => this.send() }, 'Say');
    this.controls.append(h('div', { class: 'talk-row' }, this.input, sendBtn),
      h('div', { class: 'talk-foot' },
        h('span', { class: 'hint' }, `Speak or act in your own words. ${SKILL_NAME.persuasion}, ${SKILL_NAME.insight.toLowerCase()} and the rest are rolled when it matters.`),
        h('button', { class: `btn ghost dark small ${vm.leaveLabel === 'Fight!' ? 'danger' : ''}`, onclick: () => { sfx.ui(); this.handlers.onLeave(); } }, vm.leaveLabel)));
  }
}
