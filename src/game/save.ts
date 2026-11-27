// localStorage saves: versioned, wrapped in try/catch, tolerant of junk.
import { CONFIG } from '../config';
import type { GameState } from './state';

export function saveGame(s: GameState): void {
  try {
    localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify({ v: CONFIG.SAVE_VERSION, t: Date.now(), s }));
  } catch {
    /* storage full or blocked: play on without saving */
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(CONFIG.SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.v !== CONFIG.SAVE_VERSION || !data.s?.party?.length) return null;
    return data.s as GameState;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return loadGame() !== null;
}

export function clearSave(): void {
  try { localStorage.removeItem(CONFIG.SAVE_KEY); } catch { /* ignore */ }
}

export type GameSpeed = 'relaxed' | 'normal' | 'fast';
export const SPEED_SCALE: Record<GameSpeed, number> = { relaxed: 1.5, normal: 1, fast: 0.55 };
export interface Settings { speed: GameSpeed; reducedMotion: boolean; volume: number; muted: boolean; fastDice?: boolean }

export function loadSettings(): Settings {
  const def: Settings = {
    speed: 'normal',
    reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    volume: 0.6,
    muted: false,
  };
  try {
    const raw = localStorage.getItem(CONFIG.SETTINGS_KEY);
    const v = raw ? { ...def, ...JSON.parse(raw) } : def;
    if (!raw?.includes('"speed"') && v.fastDice) v.speed = 'fast';
    if (!(v.speed in SPEED_SCALE)) v.speed = 'normal';
    return v;
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
