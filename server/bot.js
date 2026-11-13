// CampusPass — Telegram bot logic (FR-34 … FR-38). One module for both versions:
// localhost (long polling, server/telegram.js) and Netlify (webhook, netlify/functions/telegram.mjs).
// handle() reads one Telegram update and returns the Bot API calls to make; it never calls the network itself.
// Data come through an adapter (server/app.js → botApi, netlify/core.js → botApi), so the rules stay in one place.
// Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.
'use strict';

const LANGS = ['en', 'kk', 'ru'];
const T = {
  en: {
    welcome: '👋 Hi! I am the CampusPass bot.\nI show campus events, your tickets and send reminders.\nChoose what you need:',
    linked: '✅ CampusPass is connected for {name}. Reminders for your events will arrive here.',
    bad_code: '⚠️ This link is not valid or was already used. Open your Profile in CampusPass and press “Connect Telegram” again.',
    not_linked: '🔒 This needs your CampusPass account. Open Profile → “Connect Telegram” on the website, then press Start.',
    help: 'ℹ️ What I can do\n/today — events today\n/events — events this week\n/my — my registrations and tickets\n/lang — change language\n/stop — disconnect this chat from CampusPass\n/help — this message\n\nI only store the chat number, never your name or phone.',
    today: '📅 Events today', week: '🗓 Events this week', my: '🎟 My events', lang: '🌐 Language', helpb: 'ℹ️ Help', back: '⬅️ Back', menu: '🏠 Menu',
    none_today: 'No events today. Try /events for the whole week.', none_week: 'No events in the next 7 days.', none_my: 'You have no active registrations. Open /events to find one.',
    choose_lang: 'Choose the language of the bot:', lang_set: '✅ Language: English',
    free: '{n} of {c} seats free', full: 'Full · waitlist {n}', coins: '+{n} coins',
    register: '✅ Register', registered: '✅ You are registered. Ticket: {code}', waitlisted: '🕒 The event is full. You are on the waitlist, position {n}.',
    st_confirmed: 'Confirmed · ticket {code}', st_waitlisted: 'Waitlist · position {n}', st_checked_in: 'Checked in',
    only_students: 'Only students can register for events.', started: 'The event has already started.', already: 'You are already registered or on the waitlist.', not_found: 'Event not found.',
    open_site: '🌐 Open in CampusPass', tap_event: 'Tap an event to see details.',
    rem_day: '🔔 Reminder: “{title}” starts in less than a day — {when}.\n📍 {place}', rem_hour: '🔔 Reminder: “{title}” starts in less than an hour ({when}).\n📍 {place}',
    stopped: '👋 This chat is disconnected from CampusPass. You can connect again in your Profile.',
    complaint: '🚩 New complaint #{id}\n{target}: {title}\nReason: {reason}\nFrom: {from}\n“{text}”\n\nOpen Administration → Complaints on the website.',
    unknown: 'I did not understand. Use the buttons or /help.'
  },
  kk: {
    welcome: '👋 Сәлем! Мен CampusPass ботымын.\nКампустағы іс-шараларды, билеттеріңізді көрсетемін және еске саламын.\nҚажетін таңдаңыз:',
    linked: '✅ CampusPass {name} үшін қосылды. Іс-шаралар туралы еске салулар осында келеді.',
    bad_code: '⚠️ Сілтеме жарамсыз немесе қолданылып қойған. CampusPass профилінде «Telegram-ды қосу» батырмасын қайта басыңыз.',
    not_linked: '🔒 Бұл үшін CampusPass аккаунты керек. Сайтта Профиль → «Telegram-ды қосу», содан кейін Start басыңыз.',
    help: 'ℹ️ Не істей аламын\n/today — бүгінгі іс-шаралар\n/events — осы аптадағы іс-шаралар\n/my — менің тіркелулерім мен билеттерім\n/lang — тілді ауыстыру\n/stop — чатты CampusPass-тан ажырату\n/help — осы хабарлама\n\nТек чат нөмірі сақталады, атыңыз бен телефоныңыз сақталмайды.',
    today: '📅 Бүгін', week: '🗓 Осы апта', my: '🎟 Менің іс-шараларым', lang: '🌐 Тіл', helpb: 'ℹ️ Көмек', back: '⬅️ Артқа', menu: '🏠 Мәзір',
    none_today: 'Бүгін іс-шара жоқ. Бүкіл аптаны көру үшін /events.', none_week: 'Алдағы 7 күнде іс-шара жоқ.', none_my: 'Белсенді тіркелулер жоқ. /events арқылы іс-шара табыңыз.',
    choose_lang: 'Бот тілін таңдаңыз:', lang_set: '✅ Тіл: қазақша',
    free: '{c} орынның {n} бос', full: 'Орын жоқ · кезекте {n}', coins: '+{n} монета',
    register: '✅ Тіркелу', registered: '✅ Сіз тіркелдіңіз. Билет: {code}', waitlisted: '🕒 Орын жоқ. Сіз кезектесіз, орныңыз {n}.',
    st_confirmed: 'Расталды · билет {code}', st_waitlisted: 'Кезек · орны {n}', st_checked_in: 'Тіркелді',
    only_students: 'Іс-шараға тек студенттер тіркеле алады.', started: 'Іс-шара басталып кетті.', already: 'Сіз тіркелгенсіз немесе кезектесіз.', not_found: 'Іс-шара табылмады.',
    open_site: '🌐 CampusPass-та ашу', tap_event: 'Толығырақ көру үшін іс-шараны басыңыз.',
    rem_day: '🔔 Еске салу: «{title}» бір тәулікке жетпей басталады — {when}.\n📍 {place}', rem_hour: '🔔 Еске салу: «{title}» бір сағатқа жетпей басталады ({when}).\n📍 {place}',
    stopped: '👋 Чат CampusPass-тан ажыратылды. Профильде қайта қосуға болады.',
    complaint: '🚩 Жаңа шағым #{id}\n{target}: {title}\nСебебі: {reason}\nКімнен: {from}\n«{text}»\n\nСайтта Әкімшілік → Шағымдар бөлімін ашыңыз.',
    unknown: 'Түсінбедім. Батырмаларды немесе /help пайдаланыңыз.'
  },
  ru: {
    welcome: '👋 Привет! Я бот CampusPass.\nПоказываю мероприятия кампуса, ваши билеты и присылаю напоминания.\nВыберите, что нужно:',
    linked: '✅ CampusPass подключён для {name}. Напоминания о ваших мероприятиях будут приходить сюда.',
    bad_code: '⚠️ Ссылка недействительна или уже использована. Откройте Профиль в CampusPass и снова нажмите «Подключить Telegram».',
    not_linked: '🔒 Для этого нужен аккаунт CampusPass. На сайте откройте Профиль → «Подключить Telegram», затем нажмите Start.',
    help: 'ℹ️ Что я умею\n/today — мероприятия сегодня\n/events — мероприятия на неделю\n/my — мои записи и билеты\n/lang — сменить язык\n/stop — отключить этот чат от CampusPass\n/help — эта справка\n\nХранится только номер чата, без имени и телефона.',
    today: '📅 Сегодня', week: '🗓 На неделю', my: '🎟 Мои мероприятия', lang: '🌐 Язык', helpb: 'ℹ️ Помощь', back: '⬅️ Назад', menu: '🏠 Меню',
    none_today: 'Сегодня мероприятий нет. Посмотрите всю неделю: /events.', none_week: 'В ближайшие 7 дней мероприятий нет.', none_my: 'Активных записей нет. Найдите мероприятие в /events.',
    choose_lang: 'Выберите язык бота:', lang_set: '✅ Язык: русский',
    free: 'свободно {n} из {c}', full: 'Мест нет · в очереди {n}', coins: '+{n} монет',
    register: '✅ Записаться', registered: '✅ Вы записаны. Билет: {code}', waitlisted: '🕒 Мест нет. Вы в листе ожидания, место {n}.',
    st_confirmed: 'Подтверждено · билет {code}', st_waitlisted: 'Очередь · место {n}', st_checked_in: 'Отмечен',
    only_students: 'Записаться могут только студенты.', started: 'Мероприятие уже началось.', already: 'Вы уже записаны или в листе ожидания.', not_found: 'Мероприятие не найдено.',
    open_site: '🌐 Открыть в CampusPass', tap_event: 'Нажмите на мероприятие, чтобы увидеть детали.',
    rem_day: '🔔 Напоминание: «{title}» меньше чем через сутки — {when}.\n📍 {place}', rem_hour: '🔔 Напоминание: «{title}» начнётся меньше чем через час ({when}).\n📍 {place}',
    stopped: '👋 Чат отключён от CampusPass. Подключить снова можно в Профиле.',
    complaint: '🚩 Новая жалоба #{id}\n{target}: {title}\nПричина: {reason}\nОт: {from}\n«{text}»\n\nОткройте на сайте Администрирование → Жалобы.',
    unknown: 'Не понял. Используйте кнопки или /help.'
  }
};
const REASONS = { en: { wrong_info: 'wrong information', spam: 'spam or advertising', offensive: 'offensive content', safety: 'safety problem', other: 'other' },
  kk: { wrong_info: 'қате ақпарат', spam: 'спам немесе жарнама', offensive: 'дөрекі мазмұн', safety: 'қауіпсіздік мәселесі', other: 'басқа' },
  ru: { wrong_info: 'неверная информация', spam: 'спам или реклама', offensive: 'оскорбительное содержание', safety: 'проблема безопасности', other: 'другое' } };
const TARGET = { en: { event: 'Event', club: 'Club' }, kk: { event: 'Іс-шара', club: 'Клуб' }, ru: { event: 'Мероприятие', club: 'Клуб' } };
const COMMANDS = {
  en: [['today', 'Events today'], ['events', 'Events this week'], ['my', 'My registrations and tickets'], ['lang', 'Change language'], ['help', 'Help'], ['stop', 'Disconnect this chat']],
  kk: [['today', 'Бүгінгі іс-шаралар'], ['events', 'Осы аптадағы іс-шаралар'], ['my', 'Менің тіркелулерім'], ['lang', 'Тілді ауыстыру'], ['help', 'Көмек'], ['stop', 'Чатты ажырату']],
  ru: [['today', 'Мероприятия сегодня'], ['events', 'Мероприятия на неделю'], ['my', 'Мои записи и билеты'], ['lang', 'Сменить язык'], ['help', 'Помощь'], ['stop', 'Отключить чат']]
};

const tr = (lang, key, v = {}) => String((T[lang] || T.en)[key] || T.en[key] || key).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
const pickLang = (code) => { const c = String(code || '').slice(0, 2).toLowerCase(); return c === 'kk' ? 'kk' : c === 'ru' ? 'ru' : 'en'; };
// Content in the chosen language, with the original text as fallback (same rule as the website)
const L = (o, f, lang) => (o && o.i18n && o.i18n[lang] && o.i18n[lang][f]) || (o && o[f]) || '';
// Dates in Astana time (UTC+5), whatever the time zone of the server is
const TZ = 5 * 3600000;
const WD = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], kk: ['Жс', 'Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб'], ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] };
const MO = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], kk: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'], ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] };
const local = (d) => new Date(new Date(d).getTime() + TZ);
const hhmm = (d) => { const x = local(d); return String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0'); };
const when = (d, lang) => { const x = local(d); return `${WD[lang][x.getUTCDay()]}, ${x.getUTCDate()} ${MO[lang][x.getUTCMonth()]}, ${hhmm(d)}`; };
const dayStart = (now) => { const x = local(now); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - TZ); };
const placeOf = (e, lang) => (e.place ? L(e.place, 'name', lang) : '') || L(e, 'location', lang);
const clubOf = (e, lang) => (e.clubI18n && e.clubI18n[lang] && e.clubI18n[lang].name) || e.club || '';
const httpsUrl = (u) => /^https:\/\//.test(u || '');

function menu(lang) {
  return { inline_keyboard: [[{ text: tr(lang, 'today'), callback_data: 'today' }, { text: tr(lang, 'week'), callback_data: 'week' }], [{ text: tr(lang, 'my'), callback_data: 'my' }], [{ text: tr(lang, 'lang'), callback_data: 'lang' }, { text: tr(lang, 'helpb'), callback_data: 'help' }]] };
}
function eventLine(e, lang, i) {
  const seats = e.free ? tr(lang, 'free', { n: e.free, c: e.capacity }) : tr(lang, 'full', { n: e.waitlist });
  return `${i}. ${L(e, 'title', lang)}\n   🕒 ${when(e.startsAt, lang)} · 📍 ${placeOf(e, lang)}\n   👥 ${seats}`;
}
function eventList(list, lang, emptyKey, title) {
  if (!list.length) return { text: `${title}\n\n${tr(lang, emptyKey)}`, reply_markup: { inline_keyboard: [[{ text: tr(lang, 'menu'), callback_data: 'menu' }]] } };
  const shown = list.slice(0, 10);
  const rows = shown.map((e, i) => [{ text: `${i + 1}. ${L(e, 'title', lang)}`.slice(0, 60), callback_data: 'ev:' + e.id }]);
  rows.push([{ text: tr(lang, 'menu'), callback_data: 'menu' }]);
  return { text: `${title}\n\n${shown.map((e, i) => eventLine(e, lang, i + 1)).join('\n\n')}\n\n${tr(lang, 'tap_event')}`, reply_markup: { inline_keyboard: rows } };
}
function statusLine(e, lang) {
  const m = e.my; if (!m) return '';
  if (m.status === 'confirmed') return tr(lang, 'st_confirmed', { code: m.ticketCode });
  if (m.status === 'waitlisted') return tr(lang, 'st_waitlisted', { n: m.position });
  if (m.status === 'checked_in') return tr(lang, 'st_checked_in');
  return '';
}
function eventCard(e, lang, opts) {
  const seats = e.free ? tr(lang, 'free', { n: e.free, c: e.capacity }) : tr(lang, 'full', { n: e.waitlist });
  const st = statusLine(e, lang);
  const text = `${L(e, 'title', lang)}\n🕒 ${when(e.startsAt, lang)}–${hhmm(e.endsAt)}\n📍 ${placeOf(e, lang)}\n👥 ${clubOf(e, lang)} · ${seats} · ${tr(lang, 'coins', { n: e.coins })}${st ? '\n🎟 ' + st : ''}\n\n${L(e, 'description', lang)}`;
  const rows = [];
  if (opts.canRegister && !e.my && new Date(e.startsAt) > opts.now) rows.push([{ text: tr(lang, 'register'), callback_data: 'reg:' + e.id }]);
  if (httpsUrl(opts.siteUrl)) rows.push([{ text: tr(lang, 'open_site'), url: `${opts.siteUrl}/#/events?e=${e.id}` }]);
  rows.push([{ text: tr(lang, 'back'), callback_data: opts.back || 'week' }, { text: tr(lang, 'menu'), callback_data: 'menu' }]);
  return { text: text.slice(0, 4000), reply_markup: { inline_keyboard: rows } };
}

// One update → list of Bot API calls. api: the data adapter; opts: { siteUrl, now }
async function handle(update, api, opts = {}) {
  const now = opts.now ? opts.now() : new Date();
  const calls = [];
  const msg = update && update.message, cb = update && update.callback_query;
  const chat = msg ? msg.chat : cb && cb.message ? cb.message.chat : null;
  if (!chat) return calls;
  const chatId = String(chat.id);
  const from = msg ? msg.from : cb.from;
  let info = await api.chatInfo(chatId);
  // Language: the one chosen in the bot, else the language of the Telegram app, else the website language
  let lang = info.lang || (from && from.language_code ? pickLang(from.language_code) : null) || (info.user && info.user.lang) || 'en';
  if (!info.lang) await api.setChatLang(chatId, lang); // remembered, so reminders come in the same language
  const user = info.user;
  // Answer: in a callback the bot edits its own message, after a command it sends a new one
  const say = (m) => { if (cb && cb.message) calls.push({ method: 'editMessageText', params: { chat_id: chatId, message_id: cb.message.message_id, text: m.text, reply_markup: m.reply_markup, disable_web_page_preview: true } }); else calls.push({ method: 'sendMessage', params: { chat_id: chatId, text: m.text, reply_markup: m.reply_markup, disable_web_page_preview: true } }); };
  const send = (m) => calls.push({ method: 'sendMessage', params: { chat_id: chatId, text: m.text, reply_markup: m.reply_markup, disable_web_page_preview: true } });
  const toast = (text) => { if (cb) calls.push({ method: 'answerCallbackQuery', params: { callback_query_id: cb.id, text: text || undefined } }); };

  const range = (days) => { const a = days === 0 ? now : now, b = days === 0 ? new Date(dayStart(now).getTime() + 86400000) : new Date(now.getTime() + days * 86400000); return [a, b]; };
  const actions = {
    menu: () => say({ text: tr(lang, 'welcome'), reply_markup: menu(lang) }),
    help: () => say({ text: tr(lang, 'help'), reply_markup: { inline_keyboard: [[{ text: tr(lang, 'menu'), callback_data: 'menu' }]] } }),
    today: async () => { const [a, b] = range(0); say(eventList(await api.events(a, b, user && user.id), lang, 'none_today', tr(lang, 'today'))); },
    week: async () => { const [a, b] = range(7); say(eventList(await api.events(a, b, user && user.id), lang, 'none_week', tr(lang, 'week'))); },
    my: async () => {
      if (!user) return say({ text: tr(lang, 'not_linked'), reply_markup: { inline_keyboard: [[{ text: tr(lang, 'menu'), callback_data: 'menu' }]] } });
      const list = (await api.myEvents(user.id)).filter((e) => new Date(e.endsAt) > now);
      if (!list.length) return say({ text: `${tr(lang, 'my')}\n\n${tr(lang, 'none_my')}`, reply_markup: { inline_keyboard: [[{ text: tr(lang, 'week'), callback_data: 'week' }, { text: tr(lang, 'menu'), callback_data: 'menu' }]] } });
      const rows = list.slice(0, 10).map((e, i) => [{ text: `${i + 1}. ${L(e, 'title', lang)}`.slice(0, 60), callback_data: 'my:' + e.id }]);
      rows.push([{ text: tr(lang, 'menu'), callback_data: 'menu' }]);
      say({ text: `${tr(lang, 'my')}\n\n${list.slice(0, 10).map((e, i) => `${i + 1}. ${L(e, 'title', lang)}\n   🕒 ${when(e.startsAt, lang)}\n   🎟 ${statusLine(e, lang)}`).join('\n\n')}`, reply_markup: { inline_keyboard: rows } });
    },
    lang: () => say({ text: tr(lang, 'choose_lang'), reply_markup: { inline_keyboard: [[{ text: 'English', callback_data: 'setlang:en' }, { text: 'Қазақша', callback_data: 'setlang:kk' }, { text: 'Русский', callback_data: 'setlang:ru' }], [{ text: tr(lang, 'menu'), callback_data: 'menu' }]] } }),
    stop: async () => { await api.unlink(chatId); say({ text: tr(lang, 'stopped') }); }
  };

  if (msg && typeof msg.text === 'string') {
    const text = msg.text.trim();
    const start = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{6,64}))?$/.exec(text);
    if (start) {
      if (start[1]) {
        const name = await api.link(start[1], chatId);
        if (!name) { send({ text: tr(lang, 'bad_code') }); return calls; }
        send({ text: tr(lang, 'linked', { name }) });
      }
      send({ text: tr(lang, 'welcome'), reply_markup: menu(lang) });
      return calls;
    }
    const cmd = /^\/(\w+)/.exec(text);
    const map = { events: 'week', week: 'week', today: 'today', my: 'my', help: 'help', lang: 'lang', language: 'lang', menu: 'menu', stop: 'stop' };
    if (cmd && map[cmd[1].toLowerCase()]) { await actions[map[cmd[1].toLowerCase()]](); return calls; }
    send({ text: tr(lang, 'unknown'), reply_markup: menu(lang) });
    return calls;
  }

  if (cb) {
    const data = String(cb.data || '');
    if (actions[data]) { toast(); await actions[data](); return calls; }
    let m;
    if ((m = /^setlang:(en|kk|ru)$/.exec(data))) { lang = m[1]; await api.setChatLang(chatId, lang); toast(tr(lang, 'lang_set')); say({ text: tr(lang, 'welcome'), reply_markup: menu(lang) }); return calls; }
    if ((m = /^(ev|my):(\d+)$/.exec(data))) {
      const e = await api.event(Number(m[2]), user && user.id);
      if (!e) { toast(tr(lang, 'not_found')); return calls; }
      toast(); say(eventCard(e, lang, { now, siteUrl: opts.siteUrl, canRegister: !!user && user.role === 'student', back: m[1] === 'my' ? 'my' : 'week' })); return calls;
    }
    if ((m = /^reg:(\d+)$/.exec(data))) {
      if (!user) { toast(); say({ text: tr(lang, 'not_linked'), reply_markup: { inline_keyboard: [[{ text: tr(lang, 'menu'), callback_data: 'menu' }]] } }); return calls; }
      if (user.role !== 'student') { toast(tr(lang, 'only_students')); return calls; }
      try {
        const e = await api.register(user.id, Number(m[1]));
        toast(e.my.status === 'confirmed' ? tr(lang, 'registered', { code: e.my.ticketCode }) : tr(lang, 'waitlisted', { n: e.my.position }));
        say(eventCard(e, lang, { now, siteUrl: opts.siteUrl, canRegister: true, back: 'week' }));
      } catch (err) {
        const key = { already_registered: 'already', already_started: 'started', event_not_found: 'not_found', not_open: 'not_found' }[err.code] || 'not_found';
        toast(tr(lang, key));
      }
      return calls;
    }
    toast(); return calls;
  }
  return calls;
}

// Reminder for a registration (sent by sendDueReminders on the server and reminders() in the Netlify core)
function reminder(lang, e, kind, siteUrl) {
  lang = LANGS.includes(lang) ? lang : 'en';
  const text = tr(lang, kind === 'hour' ? 'rem_hour' : 'rem_day', { title: L(e, 'title', lang), when: when(e.startsAt, lang), place: placeOf(e, lang) });
  const rows = [[{ text: tr(lang, 'my'), callback_data: 'my:' + e.id }]];
  if (httpsUrl(siteUrl)) rows.push([{ text: tr(lang, 'open_site'), url: `${siteUrl}/#/tickets` }]);
  return { text, reply_markup: { inline_keyboard: rows } };
}
// Message to administrators about a new complaint
function complaintAlert(lang, c, siteUrl) {
  lang = LANGS.includes(lang) ? lang : 'en';
  const text = tr(lang, 'complaint', { id: c.id, target: TARGET[lang][c.targetType], title: c.targetTitle, reason: REASONS[lang][c.reason] || c.reason, from: c.fromName, text: c.text });
  return { text, reply_markup: httpsUrl(siteUrl) ? { inline_keyboard: [[{ text: tr(lang, 'open_site'), url: `${siteUrl}/#/admin?tab=complaints` }]] } : undefined };
}
// Command menus shown by Telegram next to the input field, in three languages
function commandSets() {
  return [{ commands: COMMANDS.en.map(([command, description]) => ({ command, description })) },
    ...['kk', 'ru'].map((l) => ({ language_code: l, commands: COMMANDS[l].map(([command, description]) => ({ command, description })) }))];
}

module.exports = { handle, reminder, complaintAlert, commandSets, tr, LANGS };
