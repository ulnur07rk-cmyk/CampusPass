// CampusPass — Telegram webhook for the Netlify version (FR-34 … FR-38): commands, buttons, languages.
// The answers are decided by server/bot.js (the same logic as the localhost bot); data live in Netlify Blobs.
// Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.
import { getStore } from '@netlify/blobs';
import core from '../core.js';
import bot from '../../server/bot.js';
import seedData from '../../server/seed-data.json' with { type: 'json' };

const KEY = 'state-v10';
const TG = process.env.TELEGRAM_BOT_TOKEN || '';
const SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET || TG.split(':')[1] || '').slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '');
const call = async (method, params) => { const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) }); const d = await r.json(); if (!d.ok) throw new Error(d.description); return d.result; };

export default async (req) => {
  if (req.method !== 'POST' || !TG || req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('ok');
  let update; try { update = await req.json(); } catch { return new Response('ok'); }
  const store = getStore({ name: 'campuspass', consistency: 'strong' });
  const site = process.env.SITE_URL || process.env.URL || new URL(req.url).origin;
  let calls = [];
  // Optimistic locking: if the data changed meanwhile (for example a registration on the website), run again
  for (let attempt = 0; attempt < 5; attempt++) {
    const found = await store.getWithMetadata(KEY, { type: 'json' });
    const api = core.createCore(seedData, found ? found.data : null);
    const before = found ? JSON.stringify(found.data) : null;
    calls = await bot.handle(update, api.botApi, { siteUrl: site });
    const box = api.state.outbox || []; api.state.outbox = [];
    const after = JSON.stringify(api.state);
    if (after !== before) {
      const res = found ? await store.set(KEY, after, { onlyIfMatch: found.etag }) : await store.set(KEY, after, { onlyIfNew: true });
      if (res && res.modified === false) continue;
    }
    for (const m of box) calls.push({ method: 'sendMessage', params: { chat_id: m.chatId, text: m.text, reply_markup: m.reply_markup } });
    break;
  }
  for (const c of calls) {
    try { await call(c.method, c.params); }
    catch (err) { if (c.method === 'editMessageText' && !/not modified/.test(err.message)) await call('sendMessage', { chat_id: c.params.chat_id, text: c.params.text, reply_markup: c.params.reply_markup }).catch(() => null); }
  }
  return new Response('ok');
};

export const config = { path: '/tg-hook' };
