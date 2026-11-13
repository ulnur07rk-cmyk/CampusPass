// CampusPass — Telegram bot for reminders (FR-08, SW02). Uses the Telegram Bot API over HTTPS, no packages.
// The bot token lives only in .env (TELEGRAM_BOT_TOKEN) and is never committed.
// Only the numeric chat id is stored, never the Telegram name or phone number.
// Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.
'use strict';

function createTelegram(token, { onStart, log = console.log } = {}) {
  const enabled = Boolean(token);
  let username = null, offset = 0, running = false;

  async function call(method, params) {
    if (!enabled) throw new Error('Telegram is not configured');
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`${method}: ${data.description || res.status}`);
    return data.result;
  }

  async function botName() {
    if (!enabled) return null;
    if (!username) { const me = await call('getMe'); username = me.username; }
    return username;
  }

  // Send a message; errors are logged, never thrown into the app
  async function send(chatId, text) {
    if (!enabled || !chatId) return false;
    try { await call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true }); return true; }
    catch (err) { log('Telegram send failed:', err.message); return false; }
  }

  // Handle one update (used by long polling on localhost and by the webhook on Netlify)
  async function handleUpdate(u) {
    const msg = u && u.message; if (!msg || !msg.text || !msg.chat) return;
    const m = /^\/start(?:\s+([A-Za-z0-9_-]{6,64}))?/.exec(msg.text.trim());
    if (!m) { await send(msg.chat.id, 'CampusPass reminders bot. Open your Profile in CampusPass and press “Connect Telegram”.'); return; }
    if (!m[1]) { await send(msg.chat.id, 'Welcome! To receive reminders, open your Profile in CampusPass and press “Connect Telegram”.'); return; }
    const name = await onStart(m[1], String(msg.chat.id));
    await send(msg.chat.id, name
      ? `✅ CampusPass is connected for ${name}. You will get event reminders here. Disconnect any time in your Profile.`
      : '⚠️ This link is not valid or was already used. Open your Profile in CampusPass and press “Connect Telegram” again.');
  }

  // Long polling for localhost (a webhook needs a public HTTPS address)
  async function startPolling() {
    if (!enabled || running) return;
    running = true;
    try { await call('deleteWebhook', { drop_pending_updates: false }); log(`Telegram bot @${await botName()} is listening (long polling).`); }
    catch (err) { log('Telegram bot could not start:', err.message); running = false; return; }
    while (running) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
        for (const u of updates) { offset = u.update_id + 1; await handleUpdate(u); }
      } catch (err) { log('Telegram polling error:', err.message); await new Promise((r) => setTimeout(r, 5000)); }
    }
  }
  const stop = () => { running = false; };

  return { enabled, call, botName, send, handleUpdate, startPolling, stop };
}

module.exports = { createTelegram };
