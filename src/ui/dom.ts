// Tiny DOM helpers. The UI is DOM laid over the Pixi stage, styled as part of the world.

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined | null>;
type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// "con" is a reserved device name on Windows, so git there can't store or check out con.svg.
const ICON_FILES: Record<string, string> = { con: 'constitution' };

export function icon(name: string, cls = ''): HTMLImageElement {
  return h('img', { src: `/art/icons/${ICON_FILES[name] ?? name}.svg`, alt: '', class: cls, draggable: 'false' });
}
export function token(name: string, cls = 'tok'): HTMLImageElement {
  return h('img', { src: `/art/tokens/${name}.svg`, alt: '', class: cls, draggable: 'false' });
}
export function portrait(name: string, cls = 'portrait'): HTMLImageElement {
  return h('img', { src: `/art/portraits/${name}.svg`, alt: '', class: cls, draggable: 'false' });
}

export const ui = (): HTMLElement => document.getElementById('ui')!;

export function layer(cls = ''): HTMLDivElement {
  const d = h('div', { class: `layer ${cls}` });
  ui().append(d);
  return d;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
