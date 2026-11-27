// Boot: fonts, Pixi, art, today's omen, then the title screen.
import './style.css';
import { Application } from 'pixi.js';
import { dateKey, omenFor } from '../shared/omen.js';
import { Director } from './game/director';
import { SPEED_SCALE, clearSave, loadGame, loadSettings, saveSettings, type Settings } from './game/save';
import { loadWorld, newGame, type OmenData } from './game/state';
import { DiceOverlay } from './render/dice';
import { loadArt, setRenderer } from './render/textures';
import { installTweens, setReducedMotion, setTimeScale } from './render/tween';
import { MapView } from './render/view';
import { buildCharacter, type CharacterBuild } from './rules/creature';
import { CLASSES } from './rules/content';
import { NetError, identity, roomCall, saveIdentity } from './net/api';
import { GuestClient } from './net/guest';
import { HostLink } from './net/host';
import type { RoomMeta } from './net/protocol';
import { showCoopStart, LobbyView } from './ui/lobby';
import { seedRng } from './rules/dice';
import { defaultBuild, showCreate } from './ui/create';
import { h, layer } from './ui/dom';
import { Hud } from './ui/hud';
import { initAudio, setMuted, setVolume, sfx } from './ui/sfx';
import { showTitle } from './ui/title';

async function fetchOmen(): Promise<OmenData> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('/api/daily', { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json();
      if (data?.omen?.name) return data as OmenData;
    }
  } catch {
    /* offline or static hosting: compute locally */
  }
  return omenFor(dateKey()) as OmenData;
}

const HOSTING_KEY = 'emberdeep.hosting.v1';
interface Hosting { code: string; hostKey: string; builds: CharacterBuild[]; t?: number }
function saveHosting(h: Hosting): void { try { localStorage.setItem(HOSTING_KEY, JSON.stringify({ ...h, t: Date.now() })); } catch { /* ignore */ } }
function clearHosting(): void { try { localStorage.removeItem(HOSTING_KEY); } catch { /* ignore */ } }
function loadHosting(): Hosting | null {
  try {
    const v = JSON.parse(localStorage.getItem(HOSTING_KEY) ?? 'null') as Hosting | null;
    return v && v.code && v.hostKey && Date.now() - (v.t ?? 0) < 8 * 3600_000 ? v : null;
  } catch { return null; }
}
function isBuild(b: unknown): b is CharacterBuild {
  const x = b as CharacterBuild;
  return !!x && typeof x.name === 'string' && x.classId in CLASSES && typeof x.scores === 'object' && Array.isArray(x.skills);
}

(async () => {
  const fonts = Promise.race([
    Promise.all([
      document.fonts.load('800 32px Cinzel'),
      document.fonts.load('900 32px Cinzel'),
      document.fonts.load('700 16px "Alegreya Sans"'),
    ]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#04060e',
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  document.getElementById('stage')!.appendChild(app.canvas);
  setRenderer(app.renderer);
  installTweens(app.ticker);
  document.addEventListener('visibilitychange', () => (document.hidden ? app.stop() : app.start()));

  const [omen] = await Promise.all([fetchOmen(), loadArt(), fonts]);
  seedRng(omen.seed ^ Date.now());

  let settings: Settings = loadSettings();
  const applySettings = () => {
    setReducedMotion(settings.reducedMotion);
    setVolume(settings.volume);
    setMuted(settings.muted);
    setTimeScale(SPEED_SCALE[settings.speed]);
    saveSettings(settings);
  };

  const view = new MapView(app);
  const dice = new DiceOverlay(app);
  applySettings();
  view.root.visible = false;

  let director: Director | null = null;
  let guest: GuestClient | null = null;
  let link: HostLink | null = null;
  let closeScreen: (() => void) | null = null;
  let timers: number[] = [];
  const popups = new Hud();
  popups.root.remove();
  document.getElementById('ui')!.append(popups.modal);
  const me = identity();

  const hooks = {
    onQuit: () => { if (link) void endRoom(); title(); },
    onNewParty: () => {
      clearSave();
      if (link) { link.setMeta({ status: 'lobby' }); hostLobby(link); } else create();
    },
    onReload: () => { const s = loadGame(); if (s) play(s); else create(); },
  };

  /** Close screens, the game and any polling. Keeps the host link alive unless `dropLink`. */
  function teardown(dropLink = false): void {
    director?.destroy();
    director = null;
    guest?.destroy();
    guest = null;
    closeScreen?.();
    closeScreen = null;
    timers.forEach((t) => clearInterval(t));
    timers = [];
    popups.modal.innerHTML = '';
    if (dropLink && link) { link.stop(); link = null; }
  }

  function title(): void {
    teardown(true);
    view.root.visible = false;
    const saved = loadGame();
    const hosting = loadHosting();
    closeScreen = showTitle(omen, {
      onNew: () => create(),
      onCoop: () => coopStart(''),
      onContinue: saved ? () => {
        if (hosting && saved.party.length) {
          link = new HostLink(hosting.code, hosting.hostKey, me.id, { status: 'playing', hostId: me.id, builds: hosting.builds, created: Date.now() });
          link.start();
        }
        play(saved);
      } : null,
      continueLabel: saved && hosting ? `Continue hosting room ${hosting.code}` : undefined,
      onSettings: () => openSettings(),
      onCredits: () => openCredits(),
    });
  }

  function create(): void {
    teardown(true);
    clearHosting();
    view.root.visible = false;
    closeScreen = showCreate((builds) => {
      const party = builds.map(buildCharacter);
      const world = newGame(party, omen);
      startDirector(world, false);
    }, () => title());
  }

  function play(state: NonNullable<ReturnType<typeof loadGame>>): void {
    teardown();
    startDirector(loadWorld(state), true);
  }

  function startDirector(world: ReturnType<typeof newGame>, isLoad: boolean): void {
    teardown();
    initAudio();
    view.root.visible = true;
    director = new Director(app, view, dice, world, hooks, link);
    director.start(isLoad);
    if (import.meta.env.DEV) (window as unknown as { __ed: unknown }).__ed = director;
  }

  // ---------------- Co-op ----------------

  let builds: CharacterBuild[] = [];

  function coopStart(prefill: string): void {
    teardown(true);
    view.root.visible = false;
    closeScreen = showCoopStart(me.name, prefill, {
      onBack: () => title(),
      onHost: async (name) => {
        me.name = name; saveIdentity(me);
        builds = (['fighter', 'rogue', 'wizard', 'cleric'] as const).map((c, i) => defaultBuild(c, i));
        try {
          const r = await roomCall<{ code: string; hostKey: string }>({ op: 'create', playerId: me.id, name, builds });
          link = new HostLink(r.code, r.hostKey, me.id, { status: 'lobby', hostId: me.id, builds, created: Date.now() });
          link.start();
          hostLobby(link);
          return null;
        } catch (e) { return (e as Error).message; }
      },
      onJoin: async (code, name) => {
        me.name = name; saveIdentity(me);
        try {
          await roomCall({ op: 'join', code, playerId: me.id, name });
          guestLobby(code);
          return null;
        } catch (e) { return (e as Error).message; }
      },
    });
  }

  function lobbyPlayers(names: Record<string, string>, seen: Record<string, number>, hostId: string) {
    return Object.entries(names).map(([id, name]) => ({ id, name, host: id === hostId, online: id === me.id || Date.now() - (seen[id] ?? 0) < 15000 }))
      .sort((a, b) => Number(b.host) - Number(a.host));
  }

  function hostLobby(l: HostLink): void {
    teardown();
    view.root.visible = false;
    if (l.meta.builds) builds = l.meta.builds;
    l.setMeta({ status: 'lobby', builds });
    let lobby: LobbyView | null = null;
    const refresh = () => lobby?.update({ players: lobbyPlayers({ [me.id]: me.name, ...l.names }, l.seen, me.id), seats: l.seats, builds, error: l.error || undefined });
    const seat = (idx: number, take: boolean) => {
      void roomCall({ op: 'seat', code: l.code, playerId: me.id, seat: idx, take, hostKey: l.hostKey, target: take ? me.id : l.seats[String(idx)] })
        .then(() => l.sync()).then(refresh).catch((e) => lobby?.update({ players: [], seats: l.seats, builds, error: (e as Error).message }));
    };
    const editParty = (only?: number) => {
      lobby?.destroy();
      lobby = null;
      closeScreen = showCreate((b) => { builds = b; l.setMeta({ builds }); hostLobby(l); }, () => hostLobby(l),
        { builds, only, title: only === undefined ? 'Edit the party' : 'Your hero', doneLabel: 'Save' });
    };
    l.onPlayers = refresh;
    l.onIntent = (i) => {
      if (i.type === 'build' && l.seats[String(i.idx)] === i.from && isBuild(i.build)) {
        builds[i.idx] = i.build;
        l.setMeta({ builds });
        refresh();
      }
    };
    lobby = new LobbyView({
      code: l.code, me: me.id, isHost: true,
      onSeat: seat, onCustomize: (i) => editParty(i), onEditParty: () => editParty(),
      onStart: () => {
        const party = builds.map(buildCharacter);
        const world = newGame(party, omen);
        l.setMeta({ status: 'playing', builds });
        saveHosting({ code: l.code, hostKey: l.hostKey, builds });
        startDirector(world, false);
      },
      onLeave: () => { void endRoom(); title(); },
    });
    closeScreen = () => lobby?.destroy();
    refresh();
    timers.push(window.setInterval(refresh, 1500));
  }

  async function endRoom(): Promise<void> {
    const l = link;
    if (!l) return;
    l.setMeta({ status: 'ended' });
    try { await l.sync(); } catch { /* best effort */ }
    l.stop();
    if (link === l) link = null;
    clearHosting();
  }

  function guestLobby(code: string): void {
    teardown(true);
    view.root.visible = false;
    let meta: RoomMeta | null = null;
    let lobby: LobbyView | null = null;
    let names: Record<string, string> = {};
    let seen: Record<string, number> = {};
    let seats: Record<string, string> = {};
    let error = '';
    const refresh = () => meta && lobby?.update({ players: lobbyPlayers(names, seen, meta.hostId), seats, builds: meta.builds, error: error || undefined });
    const poll = async () => {
      try {
        const r = await roomCall<{ meta: string; players: Record<string, string>; seats: Record<string, string>; seen: Record<string, string>; now: number }>({ op: 'lobby', code, playerId: me.id });
        meta = JSON.parse(r.meta) as RoomMeta;
        const skew = Date.now() - r.now;
        names = {};
        for (const [id, v] of Object.entries(r.players)) { try { names[id] = JSON.parse(v).name; } catch { names[id] = '?'; } }
        seen = {};
        for (const [id, t] of Object.entries(r.seen)) seen[id] = Number(t) + skew;
        seats = r.seats;
        error = '';
        if (meta.status === 'playing') { startGuest(code); return; }
        if (meta.status === 'ended') { title(); popups.localToast('The host closed the room.'); return; }
      } catch (e) {
        error = (e as Error).message;
        if (e instanceof NetError && e.status === 404) { title(); popups.localToast('That room has closed.'); return; }
      }
      refresh();
    };
    const seat = (idx: number, take: boolean) => {
      void roomCall<{ ok: boolean }>({ op: 'seat', code, playerId: me.id, seat: idx, take })
        .then((r) => { if (!r.ok) popups.localToast('Someone else just took that hero.'); return poll(); });
    };
    const customize = (idx: number) => {
      if (!meta?.builds) return;
      lobby?.destroy();
      lobby = null;
      const back = () => openLobby(); // openLobby() closes this builder via closeScreen
      closeScreen = showCreate((b) => {
        void roomCall({ op: 'intent', code, playerId: me.id, intent: { type: 'build', idx, build: b[idx] } });
        back();
      }, back, { builds: meta.builds, only: idx, title: 'Your hero', doneLabel: 'Send to host' });
    };
    const openLobby = () => {
      closeScreen?.();
      lobby = new LobbyView({ code, me: me.id, isHost: false, onSeat: seat, onCustomize: customize, onLeave: () => title() });
      closeScreen = () => lobby?.destroy();
      refresh();
    };
    openLobby();
    void poll();
    timers.push(window.setInterval(() => void poll(), 1500));
  }

  function startGuest(code: string): void {
    teardown(true);
    initAudio();
    view.root.visible = true;
    guest = new GuestClient(app, view, dice, code, me, () => title(), () => guestLobby(code));
    guest.start();
    if (import.meta.env.DEV) (window as unknown as { __guest: unknown }).__guest = guest;
  }

  // Invite links: ?join=CODE opens the join screen with the code filled in.
  const joinParam = new URLSearchParams(location.search).get('join');

  function openSettings(): void {
    const row = (label: string, on: boolean, fn: (v: boolean) => void) =>
      h('button', { class: `opt ${on ? 'primary' : ''}`, onclick: () => { fn(!on); applySettings(); sfx.ui(); document.querySelector('.scrim')?.remove(); openSettings(); } },
        h('span'), h('span', {}, h('b', {}, label)), h('span', { class: 'odds' }, on ? 'On' : 'Off'));
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: settings.volume, style: 'width:100%' }) as HTMLInputElement;
    vol.addEventListener('input', () => { settings.volume = parseFloat(vol.value); applySettings(); });
    vol.addEventListener('change', () => { initAudio(); sfx.ui(); });
    const body = h('div', { class: 'opts' },
      h('div', { class: 'sec', style: 'margin-top:0' }, 'Game speed'),
      h('div', { class: 'seg', style: 'display:flex;gap:6px;margin-bottom:8px' }, ...(['relaxed', 'normal', 'fast'] as const).map((sp) =>
        h('button', { class: `chip ${settings.speed === sp ? 'on' : ''}`, style: 'flex:1;padding:9px 0', onclick: () => { settings = { ...settings, speed: sp }; applySettings(); sfx.ui(); document.querySelector('.scrim')?.remove(); openSettings(); } },
          sp === 'relaxed' ? 'Relaxed' : sp === 'normal' ? 'Normal' : 'Fast'))),
      h('p', { class: 'hint', style: 'margin:0 0 12px' }, 'How long dice, attacks and messages stay on screen.'),
      row('Reduced motion', settings.reducedMotion, (v) => (settings = { ...settings, reducedMotion: v })),
      row('Mute sound', settings.muted, (v) => (settings = { ...settings, muted: v })),
      h('div', { class: 'sec' }, 'Volume'), vol,
    );
    void popups.panel('Settings', body, true);
  }

  function openCredits(): void {
    const body = h('div', {},
      h('p', { class: 'feat' }, 'Emberdeep is an independent, 5e-compatible game. Code, art and writing are original to this project.'),
      h('div', { class: 'sec' }, 'Rules attribution'),
      h('p', { class: 'feat', html: 'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener">https://www.dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener">https://creativecommons.org/licenses/by/4.0/legalcode</a>.' }),
      h('p', { class: 'feat' }, 'Changes: rules are simplified for a short digital delve (levels 1–3, eight skills, a subset of spells, conditions and monsters). The Ash Warden, Snikk and the dungeon are original.'),
      h('div', { class: 'sec' }, 'Built with'),
      h('p', { class: 'feat' }, 'PixiJS v8 · Vite · Cinzel & Alegreya Sans (SIL Open Font License).'),
    );
    void popups.panel('Credits & license', body, true);
  }

  if (joinParam && /^[A-Za-z]{4}$/.test(joinParam)) {
    history.replaceState(null, '', location.pathname);
    coopStart(joinParam.toUpperCase());
  } else title();
  void layer;
})();
