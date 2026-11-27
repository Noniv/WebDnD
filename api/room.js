// POST /api/room  { op, ... }  -> co-op rooms for Emberdeep.
// The host's browser runs the game; this endpoint only relays: the host publishes
// state + events, guests poll them and send back intents (taps, choices).
import { createRoom, hostSync, joinRoom, lobby, poll, pushIntent, setSeat, storageMode } from './_store.js';

const LETTERS = 'ACDEFHJKLMNPRTUVWXY'; // no B/8, G/6, I/1, O/0, Q, S/5, Z/2: easy to read aloud
const MAX_BODY = 900_000;
const okCode = (c) => typeof c === 'string' && /^[A-Z]{4}$/.test(c);
const okId = (s) => typeof s === 'string' && /^[a-z0-9-]{6,40}$/i.test(s);
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || 'Adventurer';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel parses JSON for us
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error('too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function newCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return c;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
  const mode = storageMode();
  if (mode === 'missing') {
    return send(res, 503, {
      error: 'storage',
      message: 'Co-op needs a free Redis database. In Vercel: Storage → Upstash for Redis → Create & connect to this project, then redeploy.',
    });
  }
  let b;
  try { b = await readBody(req); } catch { return send(res, 400, { error: 'Bad request body' }); }
  const now = Date.now();
  try {
    switch (b.op) {
      case 'create': {
        if (!okId(b.playerId)) return send(res, 400, { error: 'Bad player id' });
        const hostKey = crypto.randomUUID();
        const meta = JSON.stringify({ status: 'lobby', hostId: b.playerId, builds: b.builds ?? null, created: now });
        const player = JSON.stringify({ name: cleanName(b.name), host: true });
        for (let tries = 0; tries < 12; tries++) {
          const code = newCode();
          if (await createRoom(code, hostKey, meta, b.playerId, player, now)) return send(res, 200, { code, hostKey, mode });
        }
        return send(res, 503, { error: 'Could not find a free room code, try again' });
      }
      case 'join': {
        if (!okCode(b.code) || !okId(b.playerId)) return send(res, 400, { error: 'Room codes are 4 letters' });
        const r = await joinRoom(b.code, b.playerId, JSON.stringify({ name: cleanName(b.name) }), now);
        if (r === -2) return send(res, 409, { error: 'That room is full: 4 players already.' });
        return r === 1 ? send(res, 200, { ok: true }) : send(res, 404, { error: `No room called ${b.code}. Check the code with your host.` });
      }
      case 'seat': {
        if (!okCode(b.code) || !okId(b.playerId) || !Number.isInteger(b.seat) || b.seat < 0 || b.seat > 3) return send(res, 400, { error: 'Bad seat' });
        const r = await setSeat(b.code, String(b.seat), b.target && okId(b.target) ? b.target : b.playerId, !!b.take, b.hostKey);
        if (r === -1) return send(res, 404, { error: 'Room closed' });
        return send(res, 200, { ok: r === 1 });
      }
      case 'intent': {
        if (!okCode(b.code) || !okId(b.playerId) || typeof b.intent !== 'object') return send(res, 400, { error: 'Bad intent' });
        const ok = await pushIntent(b.code, JSON.stringify({ ...b.intent, from: b.playerId, t: now }));
        return send(res, ok ? 200 : 404, { ok });
      }
      case 'lobby': {
        if (!okCode(b.code) || !okId(b.playerId)) return send(res, 400, { error: 'Bad request' });
        const r = await lobby(b.code, b.playerId, now);
        return r ? send(res, 200, { ...r, now }) : send(res, 404, { error: 'Room closed' });
      }
      case 'poll': {
        if (!okCode(b.code) || !okId(b.playerId)) return send(res, 400, { error: 'Bad request' });
        const r = await poll(b.code, b.playerId, now, Number(b.sv) || 0, Math.max(0, Number(b.from) || 0));
        return r ? send(res, 200, { ...r, now }) : send(res, 404, { error: 'Room closed' });
      }
      case 'host': {
        if (!okCode(b.code) || !okId(b.playerId) || typeof b.hostKey !== 'string') return send(res, 400, { error: 'Bad request' });
        const events = Array.isArray(b.events) ? b.events.slice(0, 400).map((e) => JSON.stringify(e)) : [];
        const r = await hostSync(b.code, b.hostKey, b.playerId, now,
          b.meta ? JSON.stringify(b.meta) : '', b.state ? JSON.stringify(b.state) : '', events);
        return send(res, 200, { ...r, intents: r.intents.map((s) => JSON.parse(s)), now });
      }
      default:
        return send(res, 400, { error: 'Unknown op' });
    }
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('NOTHOST')) return send(res, 403, { error: 'Only the host can do that' });
    return send(res, 500, { error: 'Room server error', detail: msg.slice(0, 200) });
  }
}
