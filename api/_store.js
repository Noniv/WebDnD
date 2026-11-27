// Room storage for co-op. Files starting with "_" are not routes on Vercel.
//
// Production: Upstash Redis over its REST API (free tier; add it in Vercel via
// Storage -> "Upstash for Redis", which injects KV_REST_API_URL / KV_REST_API_TOKEN).
// Every operation is ONE Lua script call, so one request = one billed command.
//
// Local dev (`npm run dev`): an in-memory store in the single Vite process.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
export { LUA as _LUA };
export const TTL = 60 * 60 * 8; // rooms expire 8 hours after the last write

export function storageMode() {
  if (URL_ && TOKEN) return 'redis';
  // On Vercel, memory is per-instance and would silently split a room: refuse instead.
  if (process.env.VERCEL) return 'missing';
  return 'memory';
}

const k = (code) => ({
  meta: `ed:{${code}}:meta`, key: `ed:{${code}}:key`, state: `ed:{${code}}:state`, sv: `ed:{${code}}:sv`,
  ev: `ed:{${code}}:ev`, in: `ed:{${code}}:in`, seen: `ed:{${code}}:seen`, players: `ed:{${code}}:players`, seats: `ed:{${code}}:seats`,
});
const allKeys = (code) => Object.values(k(code));

// ---------------- Lua scripts (Redis) ----------------
// KEYS order everywhere: meta key state sv ev in seen players seats

const LUA = {
  create: `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[2], ARGV[1]); redis.call('SET', KEYS[1], ARGV[2])
redis.call('HSET', KEYS[8], ARGV[3], ARGV[4]); redis.call('HSET', KEYS[7], ARGV[3], ARGV[5])
for i=1,#KEYS do redis.call('EXPIRE', KEYS[i], tonumber(ARGV[6])) end
return 1`,
  join: `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
if redis.call('HEXISTS', KEYS[8], ARGV[1]) == 0 and redis.call('HLEN', KEYS[8]) >= tonumber(ARGV[4]) then return -2 end
redis.call('HSET', KEYS[8], ARGV[1], ARGV[2]); redis.call('HSET', KEYS[7], ARGV[1], ARGV[3])
return 1`,
  seat: `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
local cur = redis.call('HGET', KEYS[9], ARGV[1])
local isHost = redis.call('GET', KEYS[2]) == ARGV[4]
if ARGV[3] == '1' then
  if cur and cur ~= ARGV[2] and not isHost then return 0 end
  redis.call('HSET', KEYS[9], ARGV[1], ARGV[2])
else
  if cur and (cur == ARGV[2] or isHost) then redis.call('HDEL', KEYS[9], ARGV[1]) end
end
return 1`,
  intent: `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
if redis.call('LLEN', KEYS[6]) > 300 then return 0 end
redis.call('RPUSH', KEYS[6], ARGV[1])
return 1`,
  lobby: `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
redis.call('HSET', KEYS[7], ARGV[1], ARGV[2])
return {redis.call('GET', KEYS[1]), redis.call('HGETALL', KEYS[8]), redis.call('HGETALL', KEYS[9]), redis.call('HGETALL', KEYS[7]), redis.call('GET', KEYS[4]) or '0', redis.call('LLEN', KEYS[5])}`,
  poll: `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
redis.call('HSET', KEYS[7], ARGV[1], ARGV[2])
local sv = tonumber(redis.call('GET', KEYS[4]) or '0')
local st = false
if sv > tonumber(ARGV[3]) then st = redis.call('GET', KEYS[3]) end
local from = tonumber(ARGV[4])
local ev = redis.call('LRANGE', KEYS[5], from, from + 299)
return {sv, st, ev, redis.call('GET', KEYS[1]), redis.call('HGETALL', KEYS[8]), redis.call('HGETALL', KEYS[9]), redis.call('HGETALL', KEYS[7]), redis.call('LLEN', KEYS[5])}`,
  host: `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return redis.error_reply('NOTHOST') end
redis.call('HSET', KEYS[7], ARGV[2], ARGV[3])
if ARGV[4] ~= '' then redis.call('SET', KEYS[1], ARGV[4]) end
if ARGV[5] ~= '' then redis.call('SET', KEYS[3], ARGV[5]); redis.call('INCR', KEYS[4]) end
local n = tonumber(ARGV[6])
for i=1,n do redis.call('RPUSH', KEYS[5], ARGV[6+i]) end
local ttl = tonumber(ARGV[7+n])
for i=1,#KEYS do redis.call('EXPIRE', KEYS[i], ttl) end
local intents = redis.call('LRANGE', KEYS[6], 0, -1)
redis.call('DEL', KEYS[6])
return {intents, redis.call('HGETALL', KEYS[8]), redis.call('HGETALL', KEYS[9]), redis.call('HGETALL', KEYS[7]), redis.call('LLEN', KEYS[5])}`,
};

async function evalRedis(script, keys, args) {
  const res = await fetch(`${URL_}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['EVAL', script, String(keys.length), ...keys, ...args.map(String)]),
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (data.error) throw new Error(data.error);
  return data.result;
}

const hashToObj = (arr) => {
  const o = {};
  if (Array.isArray(arr)) for (let i = 0; i + 1 < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
};

// ---------------- In-memory backend (dev) ----------------

const mem = globalThis.__edRooms || (globalThis.__edRooms = new Map());
function room(code) { return mem.get(code); }

// ---------------- Public operations ----------------

export async function createRoom(code, hostKey, metaJson, playerId, playerJson, now) {
  if (storageMode() === 'redis') return (await evalRedis(LUA.create, allKeys(code), [hostKey, metaJson, playerId, playerJson, now, TTL])) === 1;
  if (mem.has(code)) return false;
  mem.set(code, { key: hostKey, meta: metaJson, state: null, sv: 0, ev: [], in: [], seen: { [playerId]: String(now) }, players: { [playerId]: playerJson }, seats: {} });
  return true;
}

export const MAX_PLAYERS = 4;

/** 1 = joined, 0 = no such room, -2 = room full. */
export async function joinRoom(code, playerId, playerJson, now) {
  if (storageMode() === 'redis') return Number(await evalRedis(LUA.join, allKeys(code), [playerId, playerJson, now, MAX_PLAYERS]));
  const r = room(code);
  if (!r) return 0;
  if (!r.players[playerId] && Object.keys(r.players).length >= MAX_PLAYERS) return -2;
  r.players[playerId] = playerJson;
  r.seen[playerId] = String(now);
  return 1;
}

/** Claim (take=true) or release a seat. The host (hostKey) may change any seat. */
export async function setSeat(code, idx, playerId, take, hostKey) {
  if (storageMode() === 'redis') return evalRedis(LUA.seat, allKeys(code), [idx, playerId, take ? '1' : '0', hostKey || '-']);
  const r = room(code);
  if (!r) return -1;
  const cur = r.seats[idx];
  const isHost = hostKey && hostKey === r.key;
  if (take) {
    if (cur && cur !== playerId && !isHost) return 0;
    r.seats[idx] = playerId;
  } else if (cur && (cur === playerId || isHost)) delete r.seats[idx];
  return 1;
}

export async function pushIntent(code, json) {
  if (storageMode() === 'redis') return (await evalRedis(LUA.intent, allKeys(code), [json])) === 1;
  const r = room(code);
  if (!r || r.in.length > 300) return false;
  r.in.push(json);
  return true;
}

export async function lobby(code, playerId, now) {
  if (storageMode() === 'redis') {
    const res = await evalRedis(LUA.lobby, allKeys(code), [playerId, now]);
    if (!res) return null;
    return { meta: res[0], players: hashToObj(res[1]), seats: hashToObj(res[2]), seen: hashToObj(res[3]), sv: Number(res[4]), evLen: Number(res[5]) };
  }
  const r = room(code);
  if (!r) return null;
  r.seen[playerId] = String(now);
  return { meta: r.meta, players: { ...r.players }, seats: { ...r.seats }, seen: { ...r.seen }, sv: r.sv, evLen: r.ev.length };
}

export async function poll(code, playerId, now, sv, from) {
  if (storageMode() === 'redis') {
    const res = await evalRedis(LUA.poll, allKeys(code), [playerId, now, sv, from]);
    if (!res) return null;
    return { sv: Number(res[0]), state: res[1] || null, events: res[2] || [], meta: res[3], players: hashToObj(res[4]), seats: hashToObj(res[5]), seen: hashToObj(res[6]), evLen: Number(res[7]) };
  }
  const r = room(code);
  if (!r) return null;
  r.seen[playerId] = String(now);
  return {
    sv: r.sv, state: r.sv > sv ? r.state : null, events: r.ev.slice(from, from + 300), meta: r.meta,
    players: { ...r.players }, seats: { ...r.seats }, seen: { ...r.seen }, evLen: r.ev.length,
  };
}

/** Host write: optional meta/state, appended events; returns and clears pending intents. */
export async function hostSync(code, hostKey, playerId, now, metaJson, stateJson, events) {
  if (storageMode() === 'redis') {
    const res = await evalRedis(LUA.host, allKeys(code), [hostKey, playerId, now, metaJson || '', stateJson || '', events.length, ...events, TTL]);
    return { intents: res[0] || [], players: hashToObj(res[1]), seats: hashToObj(res[2]), seen: hashToObj(res[3]), evLen: Number(res[4]) };
  }
  const r = room(code);
  if (!r || r.key !== hostKey) throw new Error('NOTHOST');
  r.seen[playerId] = String(now);
  if (metaJson) r.meta = metaJson;
  if (stateJson) { r.state = stateJson; r.sv++; }
  r.ev.push(...events);
  const intents = r.in;
  r.in = [];
  return { intents, players: { ...r.players }, seats: { ...r.seats }, seen: { ...r.seen }, evLen: r.ev.length };
}
