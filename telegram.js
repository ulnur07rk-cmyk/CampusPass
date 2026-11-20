// CampusPass — Telegram connection for localhost: long polling + sending (FR-08, FR-34 … FR-38).
// The conversation logic (commands, buttons, languages) is in server/bot.js and is shared with the Netlify webhook.
// The bot token lives only in .env (TELEGRAM_BOT_TOKEN) and is never committed.
// Only the numeric chat id is stored, never the Telegram name or phone number.
// Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.
'use strict';
const bot = require('./bot');

function createTelegram(token, { getApi, siteUrl = () => '', log = console.log } = {}) {
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

  // Send a message (optionally with inline buttons); errors are logged, never thrown into the app
  async function send(chatId, text, replyMarkup) {
    if (!enabled || !chatId) return false;
    try { await call('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup, disable_web_page_preview: true }); return true; }
    catch (err) { log('Telegram send failed:', err.message); return false; }
  }

  // Handle one update: bot.js decides what to answer, here the answers are sent
  async function handleUpdate(u) {
    const calls = await bot.handle(u, getApi(), { siteUrl: siteUrl() });
    for (const c of calls) {
      try { await call(c.method, c.params); }
      catch (err) { // "message is not modified" after a double tap: send the text as a new message instead
        if (c.method === 'editMessageText' && !/not modified/.test(err.message)) { try { await call('sendMessage', { chat_id: c.params.chat_id, text: c.params.text, reply_markup: c.params.reply_markup }); } catch (e2) { log('Telegram error:', e2.message); } }
        else if (!/not modified|query is too old/.test(err.message)) log('Telegram error:', err.message);
      }
    }
  }

  // Command list next to the input field, in EN / KK / RU
  async function setCommands() { for (const set of bot.commandSets()) await call('setMyCommands', set).catch((e) => log('setMyCommands:', e.message)); }

  // Long polling for localhost (a webhook needs a public HTTPS address)
  async function startPolling() {
    if (!enabled || running) return;
    running = true;
    try { await call('deleteWebhook', { drop_pending_updates: false }); await setCommands(); log(`Telegram bot @${await botName()} is listening (long polling).`); }
    catch (err) { log('Telegram bot could not start:', err.message); running = false; return; }
    while (running) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
        for (const u of updates) { offset = u.update_id + 1; await handleUpdate(u).catch((e) => log('Telegram update failed:', e.message)); }
      } catch (err) { log('Telegram polling error:', err.message); await new Promise((r) => setTimeout(r, 5000)); }
    }
  }
  const stop = () => { running = false; };

  return { enabled, call, botName, send, handleUpdate, startPolling, setCommands, stop };
}

module.exports = { createTelegram };
