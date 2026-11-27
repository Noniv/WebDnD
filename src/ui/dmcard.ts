// The "AI Dungeon Master" settings card: where the host (or a solo player) pastes an
// OpenRouter key. Used in Settings and in the co-op host lobby.
import { DM_DEFAULT_MODEL, DM_DEFAULT_PROVIDER, dmTest, loadDm, saveDm } from '../game/dm';
import { h } from './dom';
import { sfx } from './sfx';

export function dmCard(): HTMLElement {
  const st = loadDm();
  const key = h('input', { type: 'password', placeholder: 'sk-or-v1-…', value: st.key, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'OpenRouter API key' }) as HTMLInputElement;
  const model = h('input', { value: st.model, placeholder: DM_DEFAULT_MODEL, 'aria-label': 'Model' }) as HTMLInputElement;
  const provider = h('input', { value: st.provider, placeholder: DM_DEFAULT_PROVIDER, 'aria-label': 'Provider' }) as HTMLInputElement;
  const status = h('p', { class: `status ${st.key ? 'ok' : ''}` }, st.key ? 'Key saved. The AI dungeon master is on.' : 'No key: conversations use scripted choices.');
  const set = (text: string, cls = '') => { status.textContent = text; status.className = `status ${cls}`; };
  const save = async () => {
    const next = { key: key.value.trim(), model: model.value.trim() || DM_DEFAULT_MODEL, provider: provider.value.trim() };
    saveDm(next);
    if (!next.key) { set('Key removed: conversations use scripted choices.'); return; }
    set('Testing the key…');
    try {
      const line = await dmTest(next);
      sfx.success();
      set(`Working. A test innkeeper says: "${line.slice(0, 90)}"`, 'ok');
    } catch (e) {
      sfx.deny();
      set(`Saved, but the test failed: ${(e as Error).message}`, 'bad');
    }
  };
  return h('div', { class: 'card parchment torn dm-card' },
    h('h3', {}, 'AI Dungeon Master'),
    h('p', { class: 'hint', style: 'margin:0 0 8px' }, 'Paste an OpenRouter API key and an AI voices the villagers and goblins: say anything in your own words and it calls for the right dice roll. Only the host needs a key. It stays on this device and is sent only to OpenRouter.'),
    key,
    h('details', {}, h('summary', { class: 'hint', style: 'cursor:pointer' }, 'Model and provider'), model, provider),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary small', onclick: () => { sfx.ui(); void save(); } }, 'Save and test'),
      h('button', { class: 'btn ghost dark small', onclick: () => { sfx.ui(); key.value = ''; void save(); } }, 'Remove key')),
    status);
}
