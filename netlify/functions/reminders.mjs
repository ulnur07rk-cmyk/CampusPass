// CampusPass — scheduled Netlify Function: every 10 minutes sends due reminders to Telegram (FR-08, FR-38),
// even when nobody opens the website. Free Netlify feature (scheduled functions), no paid services.
// Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.
import { getStore } from '@netlify/blobs';
import core from '../core.js';
import seedData from '../../server/seed-data.json' with { type: 'json' };

const KEY = 'state-v8';
const TG = process.env.TELEGRAM_BOT_TOKEN || '';

export default async () => {
  const store = getStore({ name: 'campuspass', consistency: 'strong' });
  for (let attempt = 0; attempt < 5; attempt++) {
    const found = await store.getWithMetadata(KEY, { type: 'json' });
    if (!found) return new Response('no data yet');
    const before = JSON.stringify(found.data); // the core changes the object in place, so remember it first
    const api = core.createCore(seedData, found.data);
    api.tick();
    const box = api.state.outbox || []; api.state.outbox = [];
    const after = JSON.stringify(api.state);
    if (after === before) return new Response('nothing due');
    const res = await store.set(KEY, after, { onlyIfMatch: found.etag });
    if (res && res.modified === false) continue;
    if (TG) await Promise.all(box.map((m) => fetch(`https://api.telegram.org/bot${TG}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: m.chatId, text: m.text, reply_markup: m.reply_markup, disable_web_page_preview: true }) }).catch(() => null)));
    return new Response(`sent ${box.length}`);
  }
  return new Response('busy');
};

export const config = { schedule: '*/10 * * * *' };
