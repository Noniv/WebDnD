// GET /api/daily[?date=YYYY-MM-DD] -> today's omen and map seed.
// Stateless and dependency-free so it runs on Vercel's free (Hobby) tier.
import { omenFor, dateKey } from '../shared/omen.js';

export default function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const q = url.searchParams.get('date');
  const key = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : dateKey();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Cache at the edge until the day is likely to roll over; cheap on the free tier.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.statusCode = 200;
  res.end(JSON.stringify(omenFor(key)));
}
