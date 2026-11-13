// CampusPass — Telegram webhook for the Netlify version: links a student account when they press Start in the bot.
// Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.
import { getStore } from '@netlify/blobs';
import core from '../core.js';
import seedData from '../../server/seed-data.json' with { type: 'json' };

const KEY = 'state-v7';
const TG = process.env.TELEGRAM_BOT_TOKEN || '';
const SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET || TG.split(':')[1] || '').slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '');
const send = (chat_id, text) => fetch(`https://api.telegram.org/bot${TG}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text }) }).catch(() => null);

export default async (req) => {
  if (req.method !== 'POST' || !TG || req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('ok');
  let u; try { u = await req.json(); } catch { return new Response('ok'); }
  const msg = u && u.message; if (!msg || !msg.text || !msg.chat) return new Response('ok');
  const m = /^\/start(?:\s+([A-Za-z0-9_-]{6,64}))?/.exec(msg.text.trim());
  if (!m || !m[1]) { await send(msg.chat.id, 'Welcome! To receive reminders, open your Profile in CampusPass and press “Connect Telegram”.'); return new Response('ok'); }
  const store = getStore({ name: 'campuspass', consistency: 'strong' });
  for (let attempt = 0; attempt < 5; attempt++) {
    const found = await store.getWithMetadata(KEY, { type: 'json' });
    if (!found) break;
    const api = core.createCore(seedData, found.data);
    const name = api.linkTelegram(m[1], String(msg.chat.id));
    if (!name) { await send(msg.chat.id, '⚠️ This link is not valid or was already used. Press “Connect Telegram” in your Profile again.'); return new Response('ok'); }
    const res = await store.set(KEY, JSON.stringify(api.state), { onlyIfMatch: found.etag });
    if (res && res.modified === false) continue;
    await send(msg.chat.id, `✅ CampusPass is connected for ${name}. You will get event reminders here.`);
    return new Response('ok');
  }
  return new Response('ok');
};

export const config = { path: '/tg-hook' };
