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
import { identity, saveIdentity } from './net/identity';
import { GuestClient, GuestLink } from './net/guest';
import { HostLink } from './net/host';
import { newRoomCode } from './net/p2p';
import type { RoomInfo } from './net/protocol';
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
interface Hosting { code: string; builds: CharacterBuild[]; seats?: Record<string, string>; t?: number }
function saveHosting(h: Hosting): void { try { localStorage.setItem(HOSTING_KEY, JSON.stringify({ ...h, t: Date.now() })); } catch { /* ignore */ } }
function clearHosting(): void { try { localStorage.removeItem(HOSTING_KEY); } catch { /* ignore */ } }
function loadHosting(): Hosting | null {
  try {
    const v = JSON.parse(localStorage.getItem(HOSTING_KEY) ?? 'null') as Hosting | null;
    return v && v.code && Date.now() - (v.t ?? 0) < 8 * 3600_000 ? v : null;
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
  let glink: GuestLink | null = null;
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

  /** Close screens and the game. Keeps the co-op links alive unless `dropLink`. */
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
    if (dropLink && glink) { glink.leave(); glink = null; }
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
          link = new HostLink(hosting.code, me.id, me.name || 'Host', { status: 'playing', hostId: me.id, builds: hosting.builds, created: Date.now() });
          link.seats = { ...(hosting.seats ?? {}) };
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
        link = new HostLink(newRoomCode(), me.id, name, { status: 'lobby', hostId: me.id, builds, created: Date.now() });
        link.start();
        hostLobby(link);
        return null;
      },
      onJoin: async (code, name) => {
        me.name = name; saveIdentity(me);
        glink?.leave();
        const l = new GuestLink(code, me);
        glink = l;
        const r = await l.connect(30000);
        if (glink !== l) return null; // backed out meanwhile
        if (r !== 'ok') {
          l.leave();
          glink = null;
          return r === 'full' ? 'That room is full: 4 players already.'
            : `Could not find room ${code}. Check the code, and make sure the host has the game open with the room on screen.`;
        }
        if (l.room?.meta.status === 'playing') startGuest(); else guestLobby();
        return null;
      },
    });
  }

  function lobbyPlayers(r: Pick<RoomInfo, 'names' | 'online'>, hostId: string) {
    const online = new Set(r.online);
    return Object.entries(r.names).map(([id, name]) => ({ id, name, host: id === hostId, online: id === me.id || online.has(id) }))
      .filter((p) => p.online || p.host || Object.values(link?.seats ?? glink?.room?.seats ?? {}).includes(p.id))
      .sort((a, b) => Number(b.host) - Number(a.host));
  }

  function hostLobby(l: HostLink): void {
    teardown();
    view.root.visible = false;
    if (l.meta.builds) builds = l.meta.builds;
    l.setMeta({ status: 'lobby', builds });
    let lobby: LobbyView | null = null;
    const refresh = () => lobby?.update({ players: lobbyPlayers({ names: l.names, online: l.onlineIds() }, me.id), seats: { ...l.seats }, builds, error: l.error || undefined });
    const seat = (idx: number, take: boolean) => { l.setSeat(idx, take ? me.id : null); refresh(); };
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
        saveHosting({ code: l.code, builds, seats: l.seats });
        startDirector(world, false);
      },
      onLeave: () => { void endRoom(); title(); },
    });
    closeScreen = () => lobby?.destroy();
    refresh();
  }

  async function endRoom(): Promise<void> {
    const l = link;
    if (!l) return;
    l.setMeta({ status: 'ended' });
    if (link === l) link = null;
    clearHosting();
    // Give the goodbye a moment to reach everyone before closing the connections.
    await new Promise((r) => setTimeout(r, 600));
    l.stop();
  }

  function guestLobby(): void {
    const l = glink;
    if (!l) { title(); return; }
    teardown();
    view.root.visible = false;
    let lobby: LobbyView | null = null;
    const refresh = () => {
      const r = l.room;
      if (!r || !lobby) return;
      lobby.update({ players: lobbyPlayers(r, r.meta.hostId), seats: { ...r.seats }, builds: r.meta.builds, error: l.hostHere ? undefined : 'Lost the host. Reconnecting…' });
    };
    const onRoom = (r: RoomInfo) => {
      if (r.meta.status === 'playing') { startGuest(); return; }
      if (r.meta.status === 'ended') { title(); popups.localToast('The host closed the room.'); return; }
      refresh();
    };
    l.onRoom = onRoom;
    l.onHost = () => refresh();
    const seat = (idx: number, take: boolean) => {
      if (!l.send({ type: 'seat', seat: idx, take })) popups.localToast('Not connected to the host right now. Try again in a moment.');
    };
    const customize = (idx: number) => {
      const b = l.room?.meta.builds;
      if (!b) return;
      lobby?.destroy();
      lobby = null;
      const back = () => openLobby(); // openLobby() closes this builder via closeScreen
      closeScreen = showCreate((nb) => {
        if (!l.send({ type: 'build', idx, build: nb[idx] })) popups.localToast('Not connected to the host: your changes were not sent.');
        back();
      }, back, { builds: b, only: idx, title: 'Your hero', doneLabel: 'Send to host' });
    };
    const openLobby = () => {
      closeScreen?.();
      lobby = new LobbyView({ code: l.code, me: me.id, isHost: false, onSeat: seat, onCustomize: customize, onLeave: () => title() });
      closeScreen = () => lobby?.destroy();
      refresh();
    };
    openLobby();
    if (l.room) onRoom(l.room);
  }

  function startGuest(): void {
    const l = glink;
    if (!l) { title(); return; }
    teardown();
    initAudio();
    view.root.visible = true;
    guest = new GuestClient(app, view, dice, l, me, () => title(), () => guestLobby());
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
