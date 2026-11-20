// CampusPass — Telegram bot logic (FR-34 … FR-38, FR-46 … FR-49). One module for both versions:
// localhost (long polling, server/telegram.js) and Netlify (webhook, netlify/functions/telegram.mjs).
// handle() reads one Telegram update and returns the Bot API calls to make; it never calls the network itself.
// Each role gets its own menu and commands:
//   student   — events, register, my tickets (cancel), coins
//   organizer — my club's events, participants, check-in by ticket code
//   moderator — events waiting for review (approve / reject with a reason), club requests, statistics
//   admin     — complaints (status + answer) and everything the moderator has
// All actions go through the same API rules as the website (adapter.call), so rights are checked in one place.
// Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.
'use strict';
const assistant = require('./assistant');

const LANGS = ['en', 'kk', 'ru'];
const T = {
  en: {
    r_shop: 'merch shop cashier', help_shop: 'ℹ️ Merch shop\nScan student vouchers on the website: Check-out.\n/today, /events — events\n/lang — language · /stop — disconnect', voucher_used: '🛍 Your merch voucher {code} was used: {pct}% discount, {discount} ₸ off. Thank you!', voucher_line: '🛍 Active voucher: {code} ({pct}%), valid until {until}', shop_hint: '🛍 Merch shop: 5% off for 300 coins, 10% off for 700 coins (at most 2 000 ₸). Get a voucher on the website: Profile → Merch shop. Coins expire on {date}.', plan: '🙋 I plan to come', planned_n: '🙋 {n} plan to come · open event, no seat limit', st_planned: 'You plan to come', planned_ok: '🙋 Noted: you plan to come.', consent: 'First accept the data processing terms on the website (it opens after sign-in).', welcome: '👋 Hi! I am the CampusPass bot.\nChoose what you need:', welcome_role: '👋 Hi, {name}! You are signed in as: {role}.\nChoose what you need:',
    linked: '✅ CampusPass is connected for {name} ({role}). Your menu and commands are ready.',
    bad_code: '⚠️ This link is not valid or was already used. Open your Profile in CampusPass and press “Connect Telegram” again.',
    not_linked: '🔒 This needs your CampusPass account. Open Profile → “Connect Telegram” on the website, then press Start.',
    no_access: '🔒 This is not available for your role.',
    r_student: 'student', r_organizer: 'organizer', r_moderator: 'moderator (Student Affairs)', r_admin: 'administrator',
    help_guest: 'ℹ️ What I can do\n/today — events today\n/events — events this week\n/lang — language\n/help — this message\n\nConnect your account in the Profile on the website to get your own menu.',
    help_student: 'ℹ️ Student\n/today, /events — events, register with one button\n/my — my tickets (you can cancel)\n/coins — Campus Coins\n/lang — language\n/stop — disconnect this chat\n\nReminders come here 1 day and 1 hour before your events.',
    help_organizer: 'ℹ️ Organizer\n/club — events of my club, seats and participants\n/checkin — check a student in: just send the ticket code (CP-…)\n/today, /events — all events\n/lang — language · /stop — disconnect\n\nYou get a message when the moderator approves or rejects your event.',
    help_moderator: 'ℹ️ Moderator\n/pending — events waiting for review: approve or reject with a reason\n/requests — club join requests\n/stats — statistics\n/today, /events — events\n/lang — language · /stop — disconnect\n\nNew events for review arrive here with buttons.',
    help_admin: 'ℹ️ Administrator\n/complaints — open complaints: in review, resolve or reject with an answer\n/pending, /requests, /stats — moderation tools\n/today, /events — events\n/lang — language · /stop — disconnect\n\nNew complaints arrive here at once.',
    today: '📅 Today', week: '🗓 This week', my: '🎟 My tickets', coins: '🪙 Coins', club: '📋 My club', checkin: '✅ Check-in',
    pending: '🕒 For review', requests: '🙋 Club requests', stats: '📊 Statistics', complaints: '🚩 Complaints', lang: '🌐 Language', helpb: 'ℹ️ Help', back: '⬅️ Back', menu: '🏠 Menu',
    none_today: 'No events today. Try /events for the whole week.', none_week: 'No events in the next 7 days.', none_my: 'You have no active registrations. Open /events to find one.',
    choose_lang: 'Choose the language of the bot:', lang_set: '✅ Language: English',
    free: '{n} of {c} seats free', full: 'Full · waitlist {n}', coins_n: '+{n} coins',
    register: '✅ Register', registered: '✅ You are registered. Ticket: {code}', waitlisted: '🕒 The event is full. You are on the waitlist, position {n}.',
    cancel_reg: '✖️ Cancel registration', cancelled: 'Registration cancelled. The seat goes to the next student on the waitlist.',
    st_confirmed: 'Confirmed · ticket {code}', st_waitlisted: 'Waitlist · position {n}', st_checked_in: 'Checked in',
    only_students: 'Only students can register for events.', started: 'The event has already started.', already: 'You are already registered or on the waitlist.', not_found: 'Not found.',
    open_site: '🌐 Open in CampusPass', tap_event: 'Tap an event to see details.',
    coins_title: '🪙 Campus Coins: {n}', coins_hist: 'Last changes:',
    club_title: '📋 Events of {club}', club_none: 'Your club has no upcoming events. Submit one on the website: My events.',
    s_pending: '🕒 waiting for review', s_approved: '✅ approved', s_rejected: '❌ rejected', s_cancelled: '⛔ cancelled',
    seats_taken: '👥 {t}/{c} registered · waitlist {w}', participants: '👥 Participants', part_title: '👥 {title}: {n} participants ({k} checked in)', part_none: 'No participants yet.',
    checkin_ask: '✅ Check-in\nSend the ticket code from the student’s QR ticket, for example CP-1A2B3C4D5E. You can send codes one after another.\n/cancel — stop',
    checkin_ok: '✅ {name} checked in at “{title}”. +{coins} coins.', checkin_none: 'No event of yours has open check-in now (from 1 hour before the start until the end).',
    pending_title: '🕒 Events waiting for review ({n})', pending_none: 'Nothing is waiting for review. 👍',
    approve: '✅ Approve', reject: '❌ Reject', approved: '✅ Approved: {title}', rejected: '❌ Rejected: {title}',
    reject_ask: 'Write the reason for rejecting “{title}” in one message (at least 5 characters). The organizer will see it.\n/cancel — stop',
    requests_title: '🙋 Club requests ({n})', requests_none: 'No club requests. 👍', accept: '✅', decline: '❌', req_done: 'Done: {name} → {club}',
    stats_title: '📊 Statistics', stats_body: 'Clubs: {clubs}\nApproved events: {events}\nRegistrations: {regs}\nWaiting for review: {pending}{compl}', stats_top: 'Most filled:',
    compl_line: '\nOpen complaints: {n}',
    complaints_title: '🚩 Open complaints ({n})', complaints_none: 'No open complaints. 👍',
    c_review: '🔎 In review', c_resolve: '✅ Resolve', c_reject: '❌ Reject', c_set: 'Status of #{id}: {status}',
    c_answer_ask: 'Write the answer to the person for complaint #{id} in one message (at least 5 characters).\n/cancel — stop',
    cst_new: 'new', cst_in_review: 'in review', cst_resolved: 'resolved', cst_rejected: 'rejected',
    stopped: '👋 This chat is disconnected from CampusPass. You can connect again in your Profile.', cancelled_wait: 'OK, stopped.',
    rem_day: '🔔 Reminder: “{title}” starts in less than a day — {when}.\n📍 {place}', rem_hour: '🔔 Reminder: “{title}” starts in less than an hour ({when}).\n📍 {place}',
    complaint: '🚩 New complaint #{id}\n{target}: {title}\nReason: {reason}\n“{text}”\n(The author is shown on the website.)',
    new_event: '🆕 New event for review\n{title}\n🕒 {when}\n📍 {place}\n👥 {club} · {cap} seats',
    decided_ok: '✅ Your event “{title}” was approved and is now on the poster.', decided_no: '❌ Your event “{title}” was rejected.\nReason: {comment}',
    promoted: '🎉 A seat became free: you are now registered for “{title}”. Ticket: {code}',
    c_status_msg: '🚩 Your complaint #{id} is now: {status}.{answer}', c_answer: '\nAnswer: {text}',
    club_ok: '✅ Your request to join {club} was accepted.', club_no: 'Your request to join {club} was declined.',
    err: '⚠️ {msg}', unknown: 'I did not understand. Use the buttons or /help.', ask_hint: '💬 You can also just write a question, for example “events tomorrow” or “how does the waitlist work?”.'
  },
  kk: {
    r_shop: 'мерч дүкенінің кассирі', help_shop: 'ℹ️ Мерч дүкені\nСтуденттердің ваучерлерін сайтта тексеріңіз: Касса.\n/today, /events — іс-шаралар\n/lang — тіл · /stop — ажырату', voucher_used: '🛍 {code} мерч ваучеріңіз қолданылды: {pct}% жеңілдік, {discount} ₸ үнемделді. Рақмет!', voucher_line: '🛍 Белсенді ваучер: {code} ({pct}%), {until} дейін жарамды', shop_hint: '🛍 Мерч дүкені: 300 монетаға 5%, 700 монетаға 10% жеңілдік (ең көбі 2 000 ₸). Ваучерді сайтта алыңыз: Профиль → Мерч дүкені. Монеталар {date} күйеді.', plan: '🙋 Барамын', planned_n: '🙋 {n} адам барады · ашық іс-шара, орын шектеусіз', st_planned: 'Барамын деп белгіледіңіз', planned_ok: '🙋 Белгіленді: барасыз.', consent: 'Алдымен сайтта деректерді өңдеу шарттарын қабылдаңыз (кіргеннен кейін ашылады).', welcome: '👋 Сәлем! Мен CampusPass ботымын.\nҚажетін таңдаңыз:', welcome_role: '👋 Сәлем, {name}! Сіздің рөліңіз: {role}.\nҚажетін таңдаңыз:',
    linked: '✅ CampusPass {name} үшін қосылды ({role}). Мәзір мен командалар дайын.',
    bad_code: '⚠️ Сілтеме жарамсыз немесе қолданылып қойған. CampusPass профилінде «Telegram-ды қосу» батырмасын қайта басыңыз.',
    not_linked: '🔒 Бұл үшін CampusPass аккаунты керек. Сайтта Профиль → «Telegram-ды қосу», содан кейін Start басыңыз.',
    no_access: '🔒 Бұл сіздің рөліңізге қолжетімсіз.',
    r_student: 'студент', r_organizer: 'ұйымдастырушы', r_moderator: 'модератор (студенттер ісі)', r_admin: 'әкімші',
    help_guest: 'ℹ️ Не істей аламын\n/today — бүгінгі іс-шаралар\n/events — осы аптадағы іс-шаралар\n/lang — тіл\n/help — осы хабарлама\n\nӨз мәзіріңізді алу үшін сайттағы Профильде аккаунтты қосыңыз.',
    help_student: 'ℹ️ Студент\n/today, /events — іс-шаралар, бір батырмамен тіркелу\n/my — билеттерім (бас тартуға болады)\n/coins — Campus Coins\n/lang — тіл\n/stop — чатты ажырату\n\nЕске салулар іс-шараға 1 күн және 1 сағат қалғанда келеді.',
    help_organizer: 'ℹ️ Ұйымдастырушы\n/club — клубымның іс-шаралары, орындар мен қатысушылар\n/checkin — студентті тіркеу: билет кодын (CP-…) жіберіңіз\n/today, /events — барлық іс-шаралар\n/lang — тіл · /stop — ажырату\n\nМодератор іс-шараңызды мақұлдағанда не қабылдамағанда хабар келеді.',
    help_moderator: 'ℹ️ Модератор\n/pending — қаралуды күтетін іс-шаралар: мақұлдау немесе себебімен қабылдамау\n/requests — клубқа өтінімдер\n/stats — статистика\n/today, /events — іс-шаралар\n/lang — тіл · /stop — ажырату\n\nЖаңа іс-шаралар осында батырмалармен келеді.',
    help_admin: 'ℹ️ Әкімші\n/complaints — ашық шағымдар: қарау, шешу немесе жауаппен қабылдамау\n/pending, /requests, /stats — модерация құралдары\n/today, /events — іс-шаралар\n/lang — тіл · /stop — ажырату\n\nЖаңа шағымдар осында бірден келеді.',
    today: '📅 Бүгін', week: '🗓 Осы апта', my: '🎟 Билеттерім', coins: '🪙 Монеталар', club: '📋 Менің клубым', checkin: '✅ Тіркеу',
    pending: '🕒 Қаралуда', requests: '🙋 Клубқа өтінімдер', stats: '📊 Статистика', complaints: '🚩 Шағымдар', lang: '🌐 Тіл', helpb: 'ℹ️ Көмек', back: '⬅️ Артқа', menu: '🏠 Мәзір',
    none_today: 'Бүгін іс-шара жоқ. Бүкіл аптаны көру үшін /events.', none_week: 'Алдағы 7 күнде іс-шара жоқ.', none_my: 'Белсенді тіркелулер жоқ. /events арқылы іс-шара табыңыз.',
    choose_lang: 'Бот тілін таңдаңыз:', lang_set: '✅ Тіл: қазақша',
    free: '{c} орынның {n} бос', full: 'Орын жоқ · кезекте {n}', coins_n: '+{n} монета',
    register: '✅ Тіркелу', registered: '✅ Сіз тіркелдіңіз. Билет: {code}', waitlisted: '🕒 Орын жоқ. Сіз кезектесіз, орныңыз {n}.',
    cancel_reg: '✖️ Тіркелуден бас тарту', cancelled: 'Тіркелу тоқтатылды. Орын кезектегі келесі студентке беріледі.',
    st_confirmed: 'Расталды · билет {code}', st_waitlisted: 'Кезек · орны {n}', st_checked_in: 'Тіркелді',
    only_students: 'Іс-шараға тек студенттер тіркеле алады.', started: 'Іс-шара басталып кетті.', already: 'Сіз тіркелгенсіз немесе кезектесіз.', not_found: 'Табылмады.',
    open_site: '🌐 CampusPass-та ашу', tap_event: 'Толығырақ көру үшін іс-шараны басыңыз.',
    coins_title: '🪙 Campus Coins: {n}', coins_hist: 'Соңғы өзгерістер:',
    club_title: '📋 {club}: іс-шаралар', club_none: 'Клубыңызда алдағы іс-шаралар жоқ. Сайтта ұсыныңыз: Менің іс-шараларым.',
    s_pending: '🕒 қаралуда', s_approved: '✅ мақұлданды', s_rejected: '❌ қабылданбады', s_cancelled: '⛔ тоқтатылды',
    seats_taken: '👥 {t}/{c} тіркелді · кезекте {w}', participants: '👥 Қатысушылар', part_title: '👥 {title}: {n} қатысушы ({k} тіркелді)', part_none: 'Әзірге қатысушы жоқ.',
    checkin_ask: '✅ Тіркеу\nСтуденттің QR-билетіндегі кодты жіберіңіз, мысалы CP-1A2B3C4D5E. Кодтарды бірінен соң бірін жібере беруге болады.\n/cancel — тоқтату',
    checkin_ok: '✅ {name} «{title}» іс-шарасында тіркелді. +{coins} монета.', checkin_none: 'Қазір тіркеу ашық іс-шараңыз жоқ (басталуға 1 сағат қалғаннан соңына дейін).',
    pending_title: '🕒 Қаралуды күтетін іс-шаралар ({n})', pending_none: 'Қаралатын ештеңе жоқ. 👍',
    approve: '✅ Мақұлдау', reject: '❌ Қабылдамау', approved: '✅ Мақұлданды: {title}', rejected: '❌ Қабылданбады: {title}',
    reject_ask: '«{title}» іс-шарасын қабылдамау себебін бір хабарламамен жазыңыз (кемінде 5 таңба). Ұйымдастырушы оны көреді.\n/cancel — тоқтату',
    requests_title: '🙋 Клубқа өтінімдер ({n})', requests_none: 'Өтінім жоқ. 👍', accept: '✅', decline: '❌', req_done: 'Дайын: {name} → {club}',
    stats_title: '📊 Статистика', stats_body: 'Клубтар: {clubs}\nМақұлданған іс-шаралар: {events}\nТіркелулер: {regs}\nҚаралуды күтуде: {pending}{compl}', stats_top: 'Ең толығы:',
    compl_line: '\nАшық шағымдар: {n}',
    complaints_title: '🚩 Ашық шағымдар ({n})', complaints_none: 'Ашық шағым жоқ. 👍',
    c_review: '🔎 Қарауға алу', c_resolve: '✅ Шешілді', c_reject: '❌ Қабылдамау', c_set: '#{id} мәртебесі: {status}',
    c_answer_ask: '#{id} шағымы бойынша адамға жауапты бір хабарламамен жазыңыз (кемінде 5 таңба).\n/cancel — тоқтату',
    cst_new: 'жаңа', cst_in_review: 'қаралуда', cst_resolved: 'шешілді', cst_rejected: 'қабылданбады',
    stopped: '👋 Чат CampusPass-тан ажыратылды. Профильде қайта қосуға болады.', cancelled_wait: 'Жарайды, тоқтаттым.',
    rem_day: '🔔 Еске салу: «{title}» бір тәулікке жетпей басталады — {when}.\n📍 {place}', rem_hour: '🔔 Еске салу: «{title}» бір сағатқа жетпей басталады ({when}).\n📍 {place}',
    complaint: '🚩 Жаңа шағым #{id}\n{target}: {title}\nСебебі: {reason}\n«{text}»\n(Авторы сайтта көрсетіледі.)',
    new_event: '🆕 Қаралатын жаңа іс-шара\n{title}\n🕒 {when}\n📍 {place}\n👥 {club} · {cap} орын',
    decided_ok: '✅ «{title}» іс-шараңыз мақұлданды және афишаға шықты.', decided_no: '❌ «{title}» іс-шараңыз қабылданбады.\nСебебі: {comment}',
    promoted: '🎉 Орын босады: сіз «{title}» іс-шарасына тіркелдіңіз. Билет: {code}',
    c_status_msg: '🚩 #{id} шағымыңыздың мәртебесі: {status}.{answer}', c_answer: '\nЖауап: {text}',
    club_ok: '✅ {club} клубына өтініміңіз қабылданды.', club_no: '{club} клубына өтініміңіз қабылданбады.',
    err: '⚠️ {msg}', unknown: 'Түсінбедім. Батырмаларды немесе /help пайдаланыңыз.', ask_hint: '💬 Сұрағыңызды жай жаза беріңіз, мысалы «ертеңгі іс-шаралар» немесе «күту тізімі қалай жұмыс істейді?».'
  },
  ru: {
    r_shop: 'кассир магазина мерча', help_shop: 'ℹ️ Магазин мерча\nПроверяйте ваучеры студентов на сайте: Касса.\n/today, /events — мероприятия\n/lang — язык · /stop — отключить', voucher_used: '🛍 Ваш ваучер на мерч {code} использован: скидка {pct}%, {discount} ₸. Спасибо!', voucher_line: '🛍 Активный ваучер: {code} ({pct}%), действует до {until}', shop_hint: '🛍 Магазин мерча: скидка 5% за 300 монет, 10% за 700 монет (не больше 2 000 ₸). Ваучер — на сайте: Профиль → Магазин мерча. Монеты сгорают {date}.', plan: '🙋 Я планирую прийти', planned_n: '🙋 Планируют прийти: {n} · открытое мероприятие, без лимита мест', st_planned: 'Вы планируете прийти', planned_ok: '🙋 Отмечено: вы планируете прийти.', consent: 'Сначала примите условия обработки данных на сайте (экран откроется после входа).', welcome: '👋 Привет! Я бот CampusPass.\nВыберите, что нужно:', welcome_role: '👋 Привет, {name}! Ваша роль: {role}.\nВыберите, что нужно:',
    linked: '✅ CampusPass подключён для {name} ({role}). Меню и команды готовы.',
    bad_code: '⚠️ Ссылка недействительна или уже использована. Откройте Профиль в CampusPass и снова нажмите «Подключить Telegram».',
    not_linked: '🔒 Для этого нужен аккаунт CampusPass. На сайте откройте Профиль → «Подключить Telegram», затем нажмите Start.',
    no_access: '🔒 Это недоступно для вашей роли.',
    r_student: 'студент', r_organizer: 'организатор', r_moderator: 'модератор (Student Affairs)', r_admin: 'администратор',
    help_guest: 'ℹ️ Что я умею\n/today — мероприятия сегодня\n/events — мероприятия на неделю\n/lang — язык\n/help — эта справка\n\nПодключите аккаунт в Профиле на сайте, чтобы получить своё меню.',
    help_student: 'ℹ️ Студент\n/today, /events — мероприятия, запись одной кнопкой\n/my — мои билеты (можно отменить)\n/coins — Campus Coins\n/lang — язык\n/stop — отключить чат\n\nНапоминания приходят за 1 день и за 1 час до ваших мероприятий.',
    help_organizer: 'ℹ️ Организатор\n/club — мероприятия моего клуба, места и участники\n/checkin — отметить студента: просто отправьте код билета (CP-…)\n/today, /events — все мероприятия\n/lang — язык · /stop — отключить\n\nКогда модератор одобрит или отклонит ваше мероприятие, придёт сообщение.',
    help_moderator: 'ℹ️ Модератор\n/pending — мероприятия на модерации: одобрить или отклонить с причиной\n/requests — заявки в клубы\n/stats — статистика\n/today, /events — мероприятия\n/lang — язык · /stop — отключить\n\nНовые мероприятия на модерацию приходят сюда с кнопками.',
    help_admin: 'ℹ️ Администратор\n/complaints — открытые жалобы: взять в работу, решить или отклонить с ответом\n/pending, /requests, /stats — инструменты модерации\n/today, /events — мероприятия\n/lang — язык · /stop — отключить\n\nНовые жалобы приходят сюда сразу.',
    today: '📅 Сегодня', week: '🗓 На неделю', my: '🎟 Мои билеты', coins: '🪙 Монеты', club: '📋 Мой клуб', checkin: '✅ Отметка',
    pending: '🕒 На модерации', requests: '🙋 Заявки в клубы', stats: '📊 Статистика', complaints: '🚩 Жалобы', lang: '🌐 Язык', helpb: 'ℹ️ Помощь', back: '⬅️ Назад', menu: '🏠 Меню',
    none_today: 'Сегодня мероприятий нет. Посмотрите всю неделю: /events.', none_week: 'В ближайшие 7 дней мероприятий нет.', none_my: 'Активных записей нет. Найдите мероприятие в /events.',
    choose_lang: 'Выберите язык бота:', lang_set: '✅ Язык: русский',
    free: 'свободно {n} из {c}', full: 'Мест нет · в очереди {n}', coins_n: '+{n} монет',
    register: '✅ Записаться', registered: '✅ Вы записаны. Билет: {code}', waitlisted: '🕒 Мест нет. Вы в листе ожидания, место {n}.',
    cancel_reg: '✖️ Отменить запись', cancelled: 'Запись отменена. Место перейдёт следующему студенту из очереди.',
    st_confirmed: 'Подтверждено · билет {code}', st_waitlisted: 'Очередь · место {n}', st_checked_in: 'Отмечен',
    only_students: 'Записаться могут только студенты.', started: 'Мероприятие уже началось.', already: 'Вы уже записаны или в листе ожидания.', not_found: 'Не найдено.',
    open_site: '🌐 Открыть в CampusPass', tap_event: 'Нажмите на мероприятие, чтобы увидеть детали.',
    coins_title: '🪙 Campus Coins: {n}', coins_hist: 'Последние изменения:',
    club_title: '📋 Мероприятия: {club}', club_none: 'У клуба нет предстоящих мероприятий. Подайте на сайте: Мои мероприятия.',
    s_pending: '🕒 на модерации', s_approved: '✅ одобрено', s_rejected: '❌ отклонено', s_cancelled: '⛔ отменено',
    seats_taken: '👥 {t}/{c} записались · в очереди {w}', participants: '👥 Участники', part_title: '👥 {title}: {n} участников ({k} отмечены)', part_none: 'Пока никто не записался.',
    checkin_ask: '✅ Отметка\nОтправьте код с QR-билета студента, например CP-1A2B3C4D5E. Коды можно отправлять один за другим.\n/cancel — закончить',
    checkin_ok: '✅ {name} отмечен(а) на «{title}». +{coins} монет.', checkin_none: 'Сейчас нет вашего мероприятия с открытой отметкой (с 1 часа до начала и до конца).',
    pending_title: '🕒 На модерации ({n})', pending_none: 'На модерации ничего нет. 👍',
    approve: '✅ Одобрить', reject: '❌ Отклонить', approved: '✅ Одобрено: {title}', rejected: '❌ Отклонено: {title}',
    reject_ask: 'Напишите одним сообщением причину отклонения «{title}» (минимум 5 символов). Организатор её увидит.\n/cancel — отменить',
    requests_title: '🙋 Заявки в клубы ({n})', requests_none: 'Заявок нет. 👍', accept: '✅', decline: '❌', req_done: 'Готово: {name} → {club}',
    stats_title: '📊 Статистика', stats_body: 'Клубов: {clubs}\nОдобренных мероприятий: {events}\nЗаписей: {regs}\nЖдут рассмотрения: {pending}{compl}', stats_top: 'Самые заполненные:',
    compl_line: '\nОткрытых жалоб: {n}',
    complaints_title: '🚩 Открытые жалобы ({n})', complaints_none: 'Открытых жалоб нет. 👍',
    c_review: '🔎 Взять в работу', c_resolve: '✅ Решена', c_reject: '❌ Отклонить', c_set: 'Статус #{id}: {status}',
    c_answer_ask: 'Напишите одним сообщением ответ человеку по жалобе #{id} (минимум 5 символов).\n/cancel — отменить',
    cst_new: 'новая', cst_in_review: 'на рассмотрении', cst_resolved: 'решена', cst_rejected: 'отклонена',
    stopped: '👋 Чат отключён от CampusPass. Подключить снова можно в Профиле.', cancelled_wait: 'Хорошо, отменил.',
    rem_day: '🔔 Напоминание: «{title}» меньше чем через сутки — {when}.\n📍 {place}', rem_hour: '🔔 Напоминание: «{title}» начнётся меньше чем через час ({when}).\n📍 {place}',
    complaint: '🚩 Новая жалоба #{id}\n{target}: {title}\nПричина: {reason}\n«{text}»\n(Автор указан на сайте.)',
    new_event: '🆕 Новое мероприятие на модерацию\n{title}\n🕒 {when}\n📍 {place}\n👥 {club} · {cap} мест',
    decided_ok: '✅ Ваше мероприятие «{title}» одобрено и появилось в афише.', decided_no: '❌ Ваше мероприятие «{title}» отклонено.\nПричина: {comment}',
    promoted: '🎉 Освободилось место: вы записаны на «{title}». Билет: {code}',
    c_status_msg: '🚩 Ваша жалоба #{id}: {status}.{answer}', c_answer: '\nОтвет: {text}',
    club_ok: '✅ Ваша заявка в {club} принята.', club_no: 'Ваша заявка в {club} отклонена.',
    err: '⚠️ {msg}', unknown: 'Не понял. Используйте кнопки или /help.', ask_hint: '💬 Можно просто написать вопрос, например «мероприятия завтра» или «как работает лист ожидания?».'
  }
};
// Short messages for the most common rule errors (the rest show the API message)
const ERR = {
  en: { checkin_closed: 'Check-in is open from 1 hour before the start until the end.', ticket_not_found: 'Ticket not found. Check the code.', already_checked_in: 'This student is already checked in.', not_confirmed: 'This ticket is not confirmed (cancelled or waitlist).', comment_required: 'The reason is too short (at least 5 characters).', answer_required: 'The answer is too short (at least 5 characters).', not_pending: 'This event was already reviewed.', room_busy: 'The room is already taken at this time.', request_not_found: 'The request was already handled.', forbidden: 'This is not available for your role.' },
  kk: { checkin_closed: 'Тіркеу басталуға 1 сағат қалғаннан соңына дейін ашық.', ticket_not_found: 'Билет табылмады. Кодты тексеріңіз.', already_checked_in: 'Бұл студент тіркеліп қойған.', not_confirmed: 'Бұл билет расталмаған (бас тартқан немесе кезекте).', comment_required: 'Себебі тым қысқа (кемінде 5 таңба).', answer_required: 'Жауап тым қысқа (кемінде 5 таңба).', not_pending: 'Бұл іс-шара қаралып қойған.', room_busy: 'Аудитория бұл уақытта бос емес.', request_not_found: 'Өтінім қаралып қойған.', forbidden: 'Бұл сіздің рөліңізге қолжетімсіз.' },
  ru: { checkin_closed: 'Отметка открыта с 1 часа до начала и до конца мероприятия.', ticket_not_found: 'Билет не найден. Проверьте код.', already_checked_in: 'Этот студент уже отмечен.', not_confirmed: 'Билет не подтверждён (отменён или в очереди).', comment_required: 'Причина слишком короткая (минимум 5 символов).', answer_required: 'Ответ слишком короткий (минимум 5 символов).', not_pending: 'Это мероприятие уже рассмотрено.', room_busy: 'Аудитория в это время занята.', request_not_found: 'Заявка уже обработана.', forbidden: 'Это недоступно для вашей роли.' }
};
const REASONS = { en: { wrong_info: 'wrong information', spam: 'spam or advertising', offensive: 'offensive content', safety: 'safety problem', other: 'other' },
  kk: { wrong_info: 'қате ақпарат', spam: 'спам немесе жарнама', offensive: 'дөрекі мазмұн', safety: 'қауіпсіздік мәселесі', other: 'басқа' },
  ru: { wrong_info: 'неверная информация', spam: 'спам или реклама', offensive: 'оскорбительное содержание', safety: 'проблема безопасности', other: 'другое' } };
const TARGET = { en: { event: 'Event', club: 'Club' }, kk: { event: 'Іс-шара', club: 'Клуб' }, ru: { event: 'Мероприятие', club: 'Клуб' } };

// Menus (buttons) and command lists for each role
const MENU = {
  guest: [['today', 'week'], ['lang', 'help']],
  student: [['today', 'week'], ['my', 'coins'], ['lang', 'help']],
  organizer: [['club', 'checkin'], ['today', 'week'], ['lang', 'help']],
  moderator: [['pending', 'requests'], ['stats'], ['today', 'week'], ['lang', 'help']],
  admin: [['complaints', 'pending'], ['requests', 'stats'], ['today', 'week'], ['lang', 'help']],
  shop: [['today', 'week'], ['lang', 'help']]
};
const ROLE_CMDS = {
  guest: ['today', 'events', 'lang', 'help'],
  student: ['today', 'events', 'my', 'coins', 'lang', 'help', 'stop'],
  organizer: ['club', 'checkin', 'today', 'events', 'lang', 'help', 'stop'],
  moderator: ['pending', 'requests', 'stats', 'today', 'events', 'lang', 'help', 'stop'],
  admin: ['complaints', 'pending', 'requests', 'stats', 'today', 'events', 'lang', 'help', 'stop'],
  shop: ['today', 'events', 'lang', 'help', 'stop']
};
const CMD_TEXT = {
  en: { today: 'Events today', events: 'Events this week', my: 'My tickets', coins: 'Campus Coins', club: 'Events of my club', checkin: 'Check a student in by ticket code', pending: 'Events waiting for review', requests: 'Club join requests', stats: 'Statistics', complaints: 'Open complaints', lang: 'Change language', help: 'Help', stop: 'Disconnect this chat' },
  kk: { today: 'Бүгінгі іс-шаралар', events: 'Осы аптадағы іс-шаралар', my: 'Билеттерім', coins: 'Campus Coins', club: 'Клубымның іс-шаралары', checkin: 'Билет коды бойынша тіркеу', pending: 'Қаралатын іс-шаралар', requests: 'Клубқа өтінімдер', stats: 'Статистика', complaints: 'Ашық шағымдар', lang: 'Тілді ауыстыру', help: 'Көмек', stop: 'Чатты ажырату' },
  ru: { today: 'Мероприятия сегодня', events: 'Мероприятия на неделю', my: 'Мои билеты', coins: 'Campus Coins', club: 'Мероприятия моего клуба', checkin: 'Отметить студента по коду билета', pending: 'Мероприятия на модерации', requests: 'Заявки в клубы', stats: 'Статистика', complaints: 'Открытые жалобы', lang: 'Сменить язык', help: 'Помощь', stop: 'Отключить чат' }
};
// Which role may use which action
const ALLOW = {
  my: ['student'], coins: ['student'], club: ['organizer', 'admin'], checkin: ['organizer', 'moderator', 'admin'],
  pending: ['moderator', 'admin'], requests: ['moderator', 'admin'], stats: ['moderator', 'admin'], complaints: ['admin']
};

const tr = (lang, key, v = {}) => String((T[lang] || T.en)[key] ?? T.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
const pickLang = (code) => { const c = String(code || '').slice(0, 2).toLowerCase(); return c === 'kk' ? 'kk' : c === 'ru' ? 'ru' : 'en'; };
const L = (o, f, lang) => (o && o.i18n && o.i18n[lang] && o.i18n[lang][f]) || (o && o[f]) || '';
const TZ = 5 * 3600000; // Astana time (UTC+5), whatever the time zone of the server is
const WD = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], kk: ['Жс', 'Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб'], ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] };
const MO = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], kk: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'], ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] };
const local = (d) => new Date(new Date(d).getTime() + TZ);
const hhmm = (d) => { const x = local(d); return String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0'); };
const when = (d, lang) => { const x = local(d); return `${WD[lang][x.getUTCDay()]}, ${x.getUTCDate()} ${MO[lang][x.getUTCMonth()]}, ${hhmm(d)}`; };
const dayStart = (now) => { const x = local(now); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - TZ); };
const placeOf = (e, lang) => (e.place ? L(e.place, 'name', lang) : '') || L(e, 'location', lang);
const clubOf = (e, lang) => (e.clubI18n && e.clubI18n[lang] && e.clubI18n[lang].name) || e.club || '';
const httpsUrl = (u) => /^https:\/\//.test(u || '');
const kb = (rows) => ({ inline_keyboard: rows });
const btn = (lang, key, data) => ({ text: tr(lang, key), callback_data: data || key });
const errText = (lang, err) => tr(lang, 'err', { msg: (ERR[lang] && ERR[lang][err.code]) || ERR.en[err.code] || err.message || 'Error' });
const roleOf = (user) => (user ? user.role : 'guest');

function menu(lang, role) { return kb(MENU[role].map((row) => row.map((k) => btn(lang, k === 'help' ? 'helpb' : k, k)))); }
const backMenu = (lang, back) => kb([[...(back ? [btn(lang, 'back', back)] : []), btn(lang, 'menu', 'menu')]]);

function eventLine(e, lang, i) {
  const seats = e.open ? tr(lang, 'planned_n', { n: e.planned }) : e.free ? tr(lang, 'free', { n: e.free, c: e.capacity }) : tr(lang, 'full', { n: e.waitlist });
  return `${i}. ${L(e, 'title', lang)}\n   🕒 ${when(e.startsAt, lang)} · 📍 ${placeOf(e, lang)}\n   👥 ${seats}`;
}
function listMsg(title, items, lang, emptyKey, line, data, back) {
  if (!items.length) return { text: `${title}\n\n${tr(lang, emptyKey)}`, reply_markup: backMenu(lang, back) };
  const shown = items.slice(0, 10);
  const rows = shown.map((x, i) => [{ text: `${i + 1}. ${line.label(x)}`.slice(0, 60), callback_data: data(x) }]);
  rows.push([...(back ? [btn(lang, 'back', back)] : []), btn(lang, 'menu', 'menu')]);
  return { text: `${title}\n\n${shown.map((x, i) => line.text(x, i + 1)).join('\n\n')}`.slice(0, 4000), reply_markup: kb(rows) };
}
function statusLine(e, lang) {
  const m = e.my; if (!m) return '';
  if (m.status === 'confirmed') return tr(lang, 'st_confirmed', { code: m.ticketCode });
  if (m.status === 'waitlisted') return tr(lang, 'st_waitlisted', { n: m.position });
  if (m.status === 'checked_in') return tr(lang, 'st_checked_in');
  if (m.status === 'planned') return tr(lang, 'st_planned');
  return '';
}
function eventCard(e, lang, opts) {
  const seats = e.open ? tr(lang, 'planned_n', { n: e.planned }) : e.free ? tr(lang, 'free', { n: e.free, c: e.capacity }) : tr(lang, 'full', { n: e.waitlist });
  const st = statusLine(e, lang);
  const text = `${L(e, 'title', lang)}\n🕒 ${when(e.startsAt, lang)}–${hhmm(e.endsAt)}\n📍 ${placeOf(e, lang)}\n👥 ${clubOf(e, lang)} · ${seats} · ${tr(lang, 'coins_n', { n: e.coins })}${st ? '\n🎟 ' + st : ''}\n\n${L(e, 'description', lang)}`;
  const rows = [], future = new Date(e.startsAt) > opts.now;
  if (opts.role === 'student' && !e.my && future) rows.push([{ text: tr(lang, e.open ? 'plan' : 'register'), callback_data: 'reg:' + e.id }]);
  if (opts.role === 'student' && e.my && ['confirmed', 'waitlisted', 'planned'].includes(e.my.status) && future) rows.push([{ text: tr(lang, 'cancel_reg'), callback_data: 'cx:' + e.id }]);
  if (httpsUrl(opts.siteUrl)) rows.push([{ text: tr(lang, 'open_site'), url: `${opts.siteUrl}/#/events?e=${e.id}` }]);
  rows.push([btn(lang, 'back', opts.back || 'week'), btn(lang, 'menu', 'menu')]);
  return { text: text.slice(0, 4000), reply_markup: kb(rows) };
}
const SHOW = { pending: 's_pending', approved: 's_approved', rejected: 's_rejected', cancelled: 's_cancelled' };

// One update → list of Bot API calls. api: the data adapter; opts: { siteUrl, now }
async function handle(update, api, opts = {}) {
  const now = opts.now ? opts.now() : new Date();
  const calls = [];
  const msg = update && update.message, cb = update && update.callback_query;
  const chat = msg ? msg.chat : cb && cb.message ? cb.message.chat : null;
  if (!chat) return calls;
  const chatId = String(chat.id), from = msg ? msg.from : cb.from;
  let info = await api.chatInfo(chatId);
  // Language: chosen in the bot, else the Telegram app language, else the website language
  let lang = info.lang || (from && from.language_code ? pickLang(from.language_code) : null) || (info.user && info.user.lang) || 'en';
  if (!info.lang) await api.setChatLang(chatId, lang);
  let user = info.user, role = roleOf(user);
  const say = (m) => { if (cb && cb.message) calls.push({ method: 'editMessageText', params: { chat_id: chatId, message_id: cb.message.message_id, text: m.text, reply_markup: m.reply_markup, disable_web_page_preview: true } }); else send(m); };
  const send = (m) => calls.push({ method: 'sendMessage', params: { chat_id: chatId, text: m.text, reply_markup: m.reply_markup, disable_web_page_preview: true } });
  const toast = (text) => { if (cb) calls.push({ method: 'answerCallbackQuery', params: { callback_query_id: cb.id, text: text || undefined } }); };
  const as = (method, path, body) => api.call(user.id, method, path, body);
  const welcome = () => ({ text: user ? tr(lang, 'welcome_role', { name: user.name, role: tr(lang, 'r_' + role) }) : tr(lang, 'welcome'), reply_markup: menu(lang, role) });
  const denied = (action) => { if (!ALLOW[action]) return false; if (!user) { say({ text: tr(lang, 'not_linked'), reply_markup: backMenu(lang) }); return true; } if (!ALLOW[action].includes(role)) { say({ text: tr(lang, 'no_access'), reply_markup: menu(lang, role) }); return true; } return false; };

  const evList = async (days, key, emptyKey) => {
    const a = now, b = days === 0 ? new Date(dayStart(now).getTime() + 86400000) : new Date(now.getTime() + days * 86400000);
    const list = await api.events(a, b, user && user.id);
    say(listMsg(tr(lang, key) + (list.length ? '' : ''), list, lang, emptyKey, { label: (e) => L(e, 'title', lang), text: (e, i) => eventLine(e, lang, i) }, (e) => 'ev:' + e.id));
  };
  const actions = {
    menu: () => say(welcome()),
    help: () => say({ text: tr(lang, 'help_' + role) + '\n\n' + tr(lang, 'ask_hint'), reply_markup: backMenu(lang) }),
    today: () => evList(0, 'today', 'none_today'),
    week: () => evList(7, 'week', 'none_week'),
    lang: () => say({ text: tr(lang, 'choose_lang'), reply_markup: kb([[{ text: 'English', callback_data: 'setlang:en' }, { text: 'Қазақша', callback_data: 'setlang:kk' }, { text: 'Русский', callback_data: 'setlang:ru' }], [btn(lang, 'menu', 'menu')]]) }),
    stop: async () => { await api.unlink(chatId); say({ text: tr(lang, 'stopped') }); },
    // ---- student
    my: async () => {
      const list = (await as('GET', '/api/me/registrations')).filter((e) => new Date(e.endsAt) > now);
      say(listMsg(tr(lang, 'my'), list, lang, 'none_my', { label: (e) => L(e, 'title', lang), text: (e, i) => `${i}. ${L(e, 'title', lang)}\n   🕒 ${when(e.startsAt, lang)}\n   🎟 ${statusLine(e, lang)}` }, (e) => 'my:' + e.id));
    },
    coins: async () => {
      const c = await as('GET', '/api/me/coins'), shop = await as('GET', '/api/shop');
      const v = shop.vouchers.find((x) => x.status === 'active'), d = (x) => { const y = local(x); return `${y.getUTCDate()} ${MO[lang][y.getUTCMonth()]} ${y.getUTCFullYear()}`; };
      say({ text: `${tr(lang, 'coins_title', { n: c.balance })}\n${v ? '\n' + tr(lang, 'voucher_line', { code: v.code, pct: v.pct, until: d(v.expiresAt) }) + '\n' : ''}\n${tr(lang, 'shop_hint', { date: d(shop.coinsExpireAt) })}\n\n${tr(lang, 'coins_hist')}\n${c.history.slice(0, 6).map((h) => `${h.amount > 0 ? '+' : ''}${h.amount} · ${h.event || h.reason}`).join('\n')}`, reply_markup: backMenu(lang) });
    },
    // ---- organizer
    club: async () => {
      const list = (await as('GET', '/api/organizer/events')).filter((e) => new Date(e.endsAt) > now);
      const name = list[0] ? clubOf(list[0], lang) : '';
      say(listMsg(tr(lang, 'club_title', { club: name || '—' }), list, lang, 'club_none', { label: (e) => L(e, 'title', lang), text: (e, i) => `${i}. ${L(e, 'title', lang)} — ${tr(lang, SHOW[e.status])}\n   🕒 ${when(e.startsAt, lang)}\n   ${tr(lang, 'seats_taken', { t: e.taken, c: e.capacity, w: e.waitlist })}` }, (e) => 'oe:' + e.id));
    },
    checkin: async () => { await api.setAwait(chatId, 'checkin'); say({ text: tr(lang, 'checkin_ask'), reply_markup: backMenu(lang) }); },
    // ---- moderator / admin
    pending: async () => {
      const list = await as('GET', '/api/admin/pending-events');
      say(listMsg(tr(lang, 'pending_title', { n: list.length }), list, lang, 'pending_none', { label: (e) => L(e, 'title', lang), text: (e, i) => `${i}. ${L(e, 'title', lang)}\n   🕒 ${when(e.startsAt, lang)} · 📍 ${placeOf(e, lang)}\n   👥 ${clubOf(e, lang)} · ${e.capacity}` }, (e) => 'pe:' + e.id));
    },
    requests: async () => {
      const list = await as('GET', '/api/admin/club-requests');
      if (!list.length) return say({ text: `${tr(lang, 'requests_title', { n: 0 })}\n\n${tr(lang, 'requests_none')}`, reply_markup: backMenu(lang) });
      const shown = list.slice(0, 8), cn = (r) => (r.clubI18n && r.clubI18n[lang] && r.clubI18n[lang].name) || r.club;
      const rows = shown.map((r, i) => [{ text: `${tr(lang, 'accept')} ${i + 1}`, callback_data: `cr:a:${r.userId}:${r.clubId}` }, { text: `${tr(lang, 'decline')} ${i + 1}`, callback_data: `cr:d:${r.userId}:${r.clubId}` }]);
      rows.push([btn(lang, 'menu', 'menu')]);
      say({ text: `${tr(lang, 'requests_title', { n: list.length })}\n\n${shown.map((r, i) => `${i + 1}. ${r.name} → ${cn(r)}${r.message ? `\n   “${r.message}”` : ''}`).join('\n\n')}`, reply_markup: kb(rows) });
    },
    stats: async () => {
      const s = await as('GET', '/api/admin/stats');
      const top = s.events.slice().sort((a, b) => b.fillRate - a.fillRate).slice(0, 5).map((e) => `• ${L(e, 'title', lang)} — ${e.fillRate}% (${e.registered}/${e.capacity})`).join('\n');
      say({ text: `${tr(lang, 'stats_title')}\n\n${tr(lang, 'stats_body', { clubs: s.totals.clubs, events: s.totals.approvedEvents, regs: s.totals.registrations, pending: s.totals.pending, compl: s.totals.complaints !== undefined && role === 'admin' ? tr(lang, 'compl_line', { n: s.totals.complaints }) : '' })}\n\n${tr(lang, 'stats_top')}\n${top}`, reply_markup: backMenu(lang) });
    },
    complaints: async () => {
      const list = (await as('GET', '/api/admin/complaints')).filter((c) => c.status === 'new' || c.status === 'in_review');
      say(listMsg(tr(lang, 'complaints_title', { n: list.length }), list, lang, 'complaints_none', { label: (c) => `#${c.id} ${c.targetTitle || ''}`, text: (c, i) => `${i}. #${c.id} · ${TARGET[lang][c.targetType]}: ${c.targetTitle}\n   ${REASONS[lang][c.reason]} · ${tr(lang, 'cst_' + c.status)}\n   “${c.text}”` }, (c) => 'cp:' + c.id));
    }
  };
  const run = async (action) => { if (denied(action)) return; try { await actions[action](); } catch (err) { say({ text: errText(lang, err), reply_markup: backMenu(lang) }); } };

  // Check-in by ticket code (organizer of the club, moderator, administrator): the event is found among those with open check-in
  async function checkin(code) {
    const open = (await as('GET', '/api/organizer/events')).filter((e) => e.status === 'approved' && now >= new Date(new Date(e.startsAt).getTime() - 3600000) && now <= new Date(e.endsAt));
    if (!open.length) return send({ text: tr(lang, 'checkin_none'), reply_markup: backMenu(lang) });
    let last = null;
    for (const e of open) {
      try { const r = await as('POST', '/api/checkin', { eventId: e.id, ticketCode: code }); return send({ text: tr(lang, 'checkin_ok', { name: r.name, sid: r.studentId, title: L(e, 'title', lang), coins: r.coins }) }); }
      catch (err) { last = err; if (err.code !== 'wrong_event') break; }
    }
    send({ text: errText(lang, last.code === 'wrong_event' ? { code: 'ticket_not_found' } : last) });
  }

  if (msg && typeof msg.text === 'string') {
    const text = msg.text.trim();
    const start = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{6,64}))?$/.exec(text);
    if (start) {
      if (start[1]) {
        const name = await api.link(start[1], chatId);
        if (!name) { send({ text: tr(lang, 'bad_code') }); return calls; }
        info = await api.chatInfo(chatId); user = info.user; role = roleOf(user);
        send({ text: tr(lang, 'linked', { name, role: tr(lang, 'r_' + role) }) });
        calls.push(...chatCommands(chatId, role, lang));
      }
      send(welcome());
      return calls;
    }
    if (/^\/cancel/.test(text)) { await api.setAwait(chatId, null); send({ text: tr(lang, 'cancelled_wait'), reply_markup: menu(lang, role) }); return calls; }
    const cmd = /^\/(\w+)/.exec(text);
    if (cmd) {
      await api.setAwait(chatId, null);
      const map = { events: 'week', week: 'week', today: 'today', my: role === 'organizer' ? 'club' : 'my', coins: 'coins', club: 'club', checkin: 'checkin', pending: 'pending', requests: 'requests', stats: 'stats', complaints: 'complaints', help: 'help', lang: 'lang', language: 'lang', menu: 'menu', stop: 'stop' };
      const a = map[cmd[1].toLowerCase()];
      if (a) { await run(a); return calls; }
      send({ text: tr(lang, 'unknown'), reply_markup: menu(lang, role) }); return calls;
    }
    // A ticket code typed by an organizer, moderator or administrator → check-in
    if (user && ALLOW.checkin.includes(role) && /^CP-[0-9A-F]{6,12}$/i.test(text)) { await checkin(text.toUpperCase()); return calls; }
    // Answers the bot asked for: a rejection reason, an answer to a complaint
    const wait = info.await;
    if (user && wait) {
      let m;
      if (wait === 'checkin') { send({ text: tr(lang, 'checkin_ask'), reply_markup: backMenu(lang) }); return calls; }
      try {
        if ((m = /^reject:(\d+)$/.exec(wait))) {
          const r = await as('POST', `/api/admin/events/${m[1]}/decision`, { decision: 'reject', comment: text });
          await api.setAwait(chatId, null); const ev = await api.anyEvent(Number(m[1]));
          send({ text: tr(lang, 'rejected', { title: ev ? L(ev, 'title', lang) : '#' + r.id }), reply_markup: kb([[btn(lang, 'pending', 'pending'), btn(lang, 'menu', 'menu')]]) }); return calls;
        }
        if ((m = /^cans:(\d+):(resolved|rejected)$/.exec(wait))) {
          await as('PUT', `/api/admin/complaints/${m[1]}`, { status: m[2], comment: text });
          await api.setAwait(chatId, null);
          send({ text: tr(lang, 'c_set', { id: m[1], status: tr(lang, 'cst_' + m[2]) }), reply_markup: kb([[btn(lang, 'complaints', 'complaints'), btn(lang, 'menu', 'menu')]]) }); return calls;
        }
      } catch (err) { send({ text: errText(lang, err) }); return calls; } // the bot keeps waiting, so the person can write again
    }
    // FR-50 Any other text → the built-in assistant, with the rights of the linked user (guests: public data only)
    try {
      const snap = await assistant.buildSnapshot((p) => api.call(user ? user.id : null, 'GET', p), user ? role : null);
      const a = await assistant.smartAnswer(text, [], lang, snap, now);
      const lines = [a.text, ...a.items.map((i) => `• ${i.title} — ${i.sub}`)];
      if (a.more) lines.push(`… +${a.more}`);
      if (a.chips.length) lines.push('', ...a.chips.map((c) => '› ' + c));
      const rows = a.items.filter((i) => i.kind === 'event').map((i) => [{ text: ('📅 ' + i.title).slice(0, 60), callback_data: 'ev:' + i.id }]);
      send({ text: lines.join('\n').slice(0, 3900), reply_markup: rows.length ? kb([...rows, [btn(lang, 'menu', 'menu')]]) : menu(lang, role) });
    } catch (err) { send({ text: tr(lang, 'unknown'), reply_markup: menu(lang, role) }); }
    return calls;
  }

  if (cb) {
    const data = String(cb.data || '');
    if (actions[data]) { toast(); await api.setAwait(chatId, null); await run(data); return calls; }
    let m;
    try {
      if ((m = /^setlang:(en|kk|ru)$/.exec(data))) { lang = m[1]; await api.setChatLang(chatId, lang); toast(tr(lang, 'lang_set')); say(welcome()); calls.push(...(user ? chatCommands(chatId, role, lang) : [])); return calls; }
      if ((m = /^(ev|my):(\d+)$/.exec(data))) {
        const e = await api.event(Number(m[2]), user && user.id);
        if (!e) { toast(tr(lang, 'not_found')); return calls; }
        toast(); say(eventCard(e, lang, { now, role, siteUrl: opts.siteUrl, back: m[1] === 'my' ? 'my' : 'week' })); return calls;
      }
      if ((m = /^reg:(\d+)$/.exec(data))) {
        if (!user) { toast(); say({ text: tr(lang, 'not_linked'), reply_markup: backMenu(lang) }); return calls; }
        if (role !== 'student') { toast(tr(lang, 'only_students')); return calls; }
        try {
          const e = await api.register(user.id, Number(m[1]));
          toast(e.my.status === 'confirmed' ? tr(lang, 'registered', { code: e.my.ticketCode }) : e.my.status === 'planned' ? tr(lang, 'planned_ok') : tr(lang, 'waitlisted', { n: e.my.position }));
          say(eventCard(e, lang, { now, role, siteUrl: opts.siteUrl, back: 'week' }));
        } catch (err) { toast(tr(lang, { already_registered: 'already', already_started: 'started', consent_required: 'consent' }[err.code] || 'not_found')); }
        return calls;
      }
      if ((m = /^cx:(\d+)$/.exec(data)) && role === 'student') {
        await as('DELETE', `/api/events/${m[1]}/registration`);
        toast(tr(lang, 'cancelled')); say(eventCard(await api.event(Number(m[1]), user.id), lang, { now, role, siteUrl: opts.siteUrl, back: 'my' })); return calls;
      }
      if ((m = /^oe:(\d+)$/.exec(data)) && ALLOW.club.includes(role)) {
        const e = (await as('GET', '/api/organizer/events')).find((x) => x.id === Number(m[1])); if (!e) { toast(tr(lang, 'not_found')); return calls; }
        toast();
        say({ text: `${L(e, 'title', lang)} — ${tr(lang, SHOW[e.status])}\n🕒 ${when(e.startsAt, lang)}–${hhmm(e.endsAt)}\n📍 ${placeOf(e, lang)}\n${tr(lang, 'seats_taken', { t: e.taken, c: e.capacity, w: e.waitlist })}${e.comment ? '\n💬 ' + e.comment : ''}`, reply_markup: kb([[btn(lang, 'participants', 'op:' + e.id)], [btn(lang, 'checkin', 'checkin')], [btn(lang, 'back', 'club'), btn(lang, 'menu', 'menu')]]) });
        return calls;
      }
      if ((m = /^op:(\d+)$/.exec(data)) && ALLOW.checkin.includes(role)) {
        const list = await as('GET', `/api/events/${m[1]}/participants`), e = (await as('GET', '/api/organizer/events')).find((x) => x.id === Number(m[1]));
        toast();
        say({ text: `${tr(lang, 'part_title', { title: e ? L(e, 'title', lang) : '', n: list.length, k: list.filter((p) => p.status === 'checked_in').length })}\n\n${list.slice(0, 40).map((p) => `${p.status === 'checked_in' ? '✅' : '▫️'} ${p.name}`).join('\n') || tr(lang, 'part_none')}`.slice(0, 4000), reply_markup: kb([[btn(lang, 'back', 'oe:' + m[1]), btn(lang, 'menu', 'menu')]]) });
        return calls;
      }
      if ((m = /^pe:(\d+)$/.exec(data)) && ALLOW.pending.includes(role)) {
        const e = (await as('GET', '/api/admin/pending-events')).find((x) => x.id === Number(m[1]));
        if (!e) { toast(tr(lang, 'not_found')); await run('pending'); return calls; }
        toast();
        say({ text: `${L(e, 'title', lang)}\n🕒 ${when(e.startsAt, lang)}–${hhmm(e.endsAt)}\n📍 ${placeOf(e, lang)}\n👥 ${clubOf(e, lang)} · ${e.capacity}\n\n${L(e, 'description', lang)}`.slice(0, 4000), reply_markup: kb([[btn(lang, 'approve', 'mod:ok:' + e.id), btn(lang, 'reject', 'mod:no:' + e.id)], [btn(lang, 'back', 'pending'), btn(lang, 'menu', 'menu')]]) });
        return calls;
      }
      if ((m = /^mod:(ok|no):(\d+)$/.exec(data))) {
        if (!user || !ALLOW.pending.includes(role)) { toast(tr(lang, 'no_access')); return calls; }
        const e = await api.anyEvent(Number(m[2])), title = e ? L(e, 'title', lang) : '#' + m[2];
        if (m[1] === 'ok') { await as('POST', `/api/admin/events/${m[2]}/decision`, { decision: 'approve' }); toast(tr(lang, 'approved', { title })); say({ text: tr(lang, 'approved', { title }), reply_markup: kb([[btn(lang, 'pending', 'pending'), btn(lang, 'menu', 'menu')]]) }); return calls; }
        if (e && e.status !== 'pending') { toast(errText(lang, { code: 'not_pending' })); return calls; }
        await api.setAwait(chatId, 'reject:' + m[2]); toast(); send({ text: tr(lang, 'reject_ask', { title }) }); return calls;
      }
      if ((m = /^cr:(a|d):(\d+):(\d+)$/.exec(data))) {
        if (!user || !ALLOW.requests.includes(role)) { toast(tr(lang, 'no_access')); return calls; }
        await as('POST', '/api/admin/club-requests/decision', { userId: Number(m[2]), clubId: Number(m[3]), decision: m[1] === 'a' ? 'accept' : 'decline' });
        toast('✓'); await run('requests'); return calls;
      }
      if ((m = /^cp:(\d+)$/.exec(data)) && role === 'admin') {
        const c = (await as('GET', '/api/admin/complaints')).find((x) => x.id === Number(m[1])); if (!c) { toast(tr(lang, 'not_found')); return calls; }
        toast();
        say({ text: `🚩 #${c.id} · ${tr(lang, 'cst_' + c.status)}\n${TARGET[lang][c.targetType]}: ${c.targetTitle}\n${REASONS[lang][c.reason]}\n\n“${c.text}”${c.comment ? '\n💬 ' + c.comment : ''}`, reply_markup: complaintButtons(lang, c.id, 'complaints') });
        return calls;
      }
      if ((m = /^cs:(r|s|x):(\d+)$/.exec(data))) {
        if (!user || role !== 'admin') { toast(tr(lang, 'no_access')); return calls; }
        if (m[1] === 'r') { await as('PUT', `/api/admin/complaints/${m[2]}`, { status: 'in_review' }); toast(tr(lang, 'c_set', { id: m[2], status: tr(lang, 'cst_in_review') })); say({ text: tr(lang, 'c_set', { id: m[2], status: tr(lang, 'cst_in_review') }), reply_markup: complaintButtons(lang, m[2], 'complaints') }); return calls; }
        await api.setAwait(chatId, `cans:${m[2]}:${m[1] === 's' ? 'resolved' : 'rejected'}`); toast(); send({ text: tr(lang, 'c_answer_ask', { id: m[2] }) }); return calls;
      }
    } catch (err) { toast(); say({ text: errText(lang, err), reply_markup: menu(lang, role) }); return calls; }
    toast(tr(lang, 'no_access')); return calls;
  }
  return calls;
}
const complaintButtons = (lang, id, back) => kb([[btn(lang, 'c_review', 'cs:r:' + id)], [btn(lang, 'c_resolve', 'cs:s:' + id), btn(lang, 'c_reject', 'cs:x:' + id)], ...(back ? [[btn(lang, 'back', back), btn(lang, 'menu', 'menu')]] : [])]);

// Commands next to the input field: the general list for everybody, the role list for a linked chat
function chatCommands(chatId, role, lang) {
  return [{ method: 'setMyCommands', params: { scope: { type: 'chat', chat_id: chatId }, commands: ROLE_CMDS[role].map((c) => ({ command: c, description: CMD_TEXT[lang][c] })) } }];
}
function commandSets() {
  return LANGS.map((l) => ({ ...(l === 'en' ? {} : { language_code: l }), commands: ROLE_CMDS.guest.map((c) => ({ command: c, description: CMD_TEXT[l][c] })) }));
}

// ---------- messages the website sends to a linked chat ----------
const okLang = (lang) => (LANGS.includes(lang) ? lang : 'en');
const site = (siteUrl, lang, path) => (httpsUrl(siteUrl) ? [[{ text: tr(lang, 'open_site'), url: siteUrl + path }]] : []);
function reminder(lang, e, kind, siteUrl) {
  lang = okLang(lang);
  return { text: tr(lang, kind === 'hour' ? 'rem_hour' : 'rem_day', { title: L(e, 'title', lang), when: when(e.startsAt, lang), place: placeOf(e, lang) }), reply_markup: kb([[{ text: tr(lang, 'my'), callback_data: 'my:' + e.id }], ...site(siteUrl, lang, '/#/tickets')]) };
}
function complaintAlert(lang, c, siteUrl) {
  lang = okLang(lang);
  return { text: tr(lang, 'complaint', { id: c.id, target: TARGET[lang][c.targetType], title: c.targetTitle, reason: REASONS[lang][c.reason] || c.reason, from: c.fromName, text: c.text }), reply_markup: kb([...complaintButtons(lang, c.id).inline_keyboard, ...site(siteUrl, lang, '/#/admin?tab=complaints')]) };
}
function newEventAlert(lang, e, siteUrl) {
  lang = okLang(lang);
  return { text: tr(lang, 'new_event', { title: L(e, 'title', lang), when: when(e.startsAt, lang), place: placeOf(e, lang), club: clubOf(e, lang), cap: e.capacity }), reply_markup: kb([[btn(lang, 'approve', 'mod:ok:' + e.id), btn(lang, 'reject', 'mod:no:' + e.id)], ...site(siteUrl, lang, '/#/moderation')]) };
}
function decisionMsg(lang, e, status, comment) { lang = okLang(lang); return { text: tr(lang, status === 'approved' ? 'decided_ok' : 'decided_no', { title: L(e, 'title', lang), comment }), reply_markup: kb([[btn(lang, 'club', 'club')]]) }; }
function promotedMsg(lang, e, code) { lang = okLang(lang); return { text: tr(lang, 'promoted', { title: L(e, 'title', lang), code }), reply_markup: kb([[{ text: tr(lang, 'my'), callback_data: 'my:' + e.id }]]) }; }
function complaintStatusMsg(lang, id, status, answer) { lang = okLang(lang); return { text: tr(lang, 'c_status_msg', { id, status: tr(lang, 'cst_' + status), answer: answer ? tr(lang, 'c_answer', { text: answer }) : '' }) }; }
function clubDecisionMsg(lang, clubName, status) { lang = okLang(lang); return { text: tr(lang, status === 'accepted' ? 'club_ok' : 'club_no', { club: clubName }) }; }

module.exports = { handle, reminder, complaintAlert, newEventAlert, decisionMsg, promotedMsg, complaintStatusMsg, clubDecisionMsg, commandSets, chatCommands, tr, LANGS, MENU, ROLE_CMDS };
