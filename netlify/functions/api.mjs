// CampusPass — Netlify Function that serves /api/* for the Netlify version.
// Data are shared by all users and stored in Netlify Blobs (one JSON document, optimistic locking with ETags).
// Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.
import { getStore } from '@netlify/blobs';
import core from '../core.js';
import seedData from '../../server/seed-data.json' with { type: 'json' };

const KEY = 'state-v6'; // bump when the data structure changes, so Netlify starts with fresh test data
const json = (status, data, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export default async (req) => {
  const url = new URL(req.url);
  const store = getStore({ name: 'campuspass', consistency: 'strong' });
  let body = {};
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const text = await req.text();
    if (text.length > 100000) return json(413, { error: { code: 'too_large', message: 'Request body is too large.' } });
    if (text) { try { body = JSON.parse(text); } catch { return json(400, { error: { code: 'bad_json', message: 'Invalid JSON.' } }); } }
  }
  const m = /(?:^|;\s*)cp_session=([a-f0-9]{64})/.exec(req.headers.get('cookie') || '');
  const token = m ? m[1] : null;

  // Optimistic locking: if another request changed the data meanwhile, read again and retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    const found = await store.getWithMetadata(KEY, { type: 'json' });
    const api = core.createCore(seedData, found ? found.data : null);
    const before = found ? JSON.stringify(found.data) : null;
    const out = api.handle(req.method, url.pathname + url.search, body, token);
    if (url.pathname.endsWith('/ics') && out.status === 200) {
      return new Response(out.data, { status: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="event.ics"' } });
    }
    const after = JSON.stringify(api.state);
    if (after !== before) {
      const res = found ? await store.set(KEY, after, { onlyIfMatch: found.etag }) : await store.set(KEY, after, { onlyIfNew: true });
      if (res && res.modified === false) continue; // conflict: try again with fresh data
    }
    const headers = {};
    if (out.token !== undefined) headers['Set-Cookie'] = out.token ? `cp_session=${out.token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200` : 'cp_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
    return json(out.status, out.data, headers);
  }
  return json(503, { error: { code: 'busy', message: 'The server is busy. Please try again.' } });
};

export const config = { path: '/api/*' };
