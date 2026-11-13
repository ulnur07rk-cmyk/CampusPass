// CampusPass — Netlify Function that serves /api/* for the Netlify version.
// Data are shared by all users and stored in Netlify Blobs (one JSON document, optimistic locking with ETags).
// Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.
import { getStore } from '@netlify/blobs';
import core from '../core.js';
import bot from '../../server/bot.js';
import seedData from '../../server/seed-data.json' with { type: 'json' };

const KEY = 'state-v9'; // bump when the data structure changes, so Netlify starts with fresh test data
const TG = process.env.TELEGRAM_BOT_TOKEN || '';
const tg = async (method, params) => { const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}) }); const d = await r.json(); if (!d.ok) throw new Error(d.description); return d.result; };
let BOT = null; const botName = async () => { if (!TG) return null; if (!BOT) BOT = (await tg('getMe')).username; return BOT; };
const json = (status, data, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export default async (req) => {
  const url = new URL(req.url);
  // Public settings for the frontend (the 2GIS key is a browser key restricted to our domains)
  if (url.pathname === '/api/config') return json(200, { mapKey: process.env.MAPGL_KEY || '', telegram: !!TG });
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
    // Telegram: send queued messages, add the bot name, turn the one-time code into a link
    const box = api.state.outbox || [];
    if (box.length && TG) { await Promise.all(box.map((m) => tg('sendMessage', { chat_id: m.chatId, text: m.text, reply_markup: m.reply_markup, disable_web_page_preview: true }).catch(() => null))); api.state.outbox = []; await store.set(KEY, JSON.stringify(api.state)); }
    if (url.pathname === '/api/me/telegram' && req.method === 'GET' && out.status === 200) { let bot = null; try { bot = await botName(); } catch { bot = null; } out.data = { ...out.data, enabled: !!bot, bot }; }
    if (url.pathname === '/api/me/telegram/link' && out.status === 200) {
      if (!TG) return json(503, { error: { code: 'telegram_off', message: 'The Telegram bot is not configured.' } });
      try { await tg('setWebhook', { url: `${url.origin}/tg-hook`, secret_token: (process.env.TELEGRAM_WEBHOOK_SECRET || TG.split(':')[1].slice(0, 32)).replace(/[^A-Za-z0-9_-]/g, ''), allowed_updates: ['message', 'callback_query'] }); for (const set of bot.commandSets()) await tg('setMyCommands', set); } catch { /* the link still works once the webhook is set */ }
      out.data = { url: `https://t.me/${await botName()}?start=${out.data.code}` };
    }
    const headers = {};
    if (out.token !== undefined) headers['Set-Cookie'] = out.token ? `cp_session=${out.token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200` : 'cp_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
    return json(out.status, out.data, headers);
  }
  return json(503, { error: { code: 'busy', message: 'The server is busy. Please try again.' } });
};

export const config = { path: '/api/*' };
