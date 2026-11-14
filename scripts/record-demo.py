"""Records Team06_FP_Demo.mp4: a scripted walk through the CampusPass prototype (localhost, fictional data).
Captions at the bottom name each step and its requirement IDs; a dot shows where the mouse clicks."""
import time
from playwright.sync_api import sync_playwright

B = 'http://localhost:3000'
W, H = 1280, 720
OVERLAY = """
(() => {
  if (!document.getElementById('demo-cap')) {
    const s = document.createElement('style');
    s.textContent = `#demo-cap{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:1100px;background:rgba(18,24,19,.88);color:#fffcf5;
      font:600 19px/1.35 system-ui,Segoe UI,Arial;padding:10px 18px;border-radius:12px;z-index:99999;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.3)}
      #demo-cap small{display:block;font-weight:500;font-size:14px;color:#a9d8b8;margin-top:2px}
      #demo-dot{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(242,193,78,.85);border:2px solid #fff;
      z-index:99998;pointer-events:none;transition:left .45s ease, top .45s ease;left:640px;top:360px;box-shadow:0 0 0 6px rgba(242,193,78,.25)}`;
    document.head.appendChild(s);
    const c = document.createElement('div'); c.id = 'demo-cap'; document.body.appendChild(c);
    const d = document.createElement('div'); d.id = 'demo-dot'; document.body.appendChild(d);
  }
})();
"""

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome')
        # Consent for the staff accounts that are not shown signing in for the first time (the organizer shows the consent screen)
        api = p.request.new_context(base_url=B)
        for e, pw in [('admin@test.local', 'Admin123!'), ('moderator@test.local', 'Moderator123!'), ('shop@test.local', 'Shop123!')]:
            api.post('/api/auth/login', data={'email': e, 'password': pw}); api.post('/api/me/consent', data={}); api.post('/api/auth/logout', data={})
        ctx = b.new_context(viewport={'width': W, 'height': H}, record_video_dir='/tmp/vid', record_video_size={'width': W, 'height': H})
        pg = ctx.new_page()
        T0 = time.time(); MARKS = []
        pg.add_init_script("try{localStorage.setItem('cp.theme','light');localStorage.setItem('cp.lang','en')}catch(e){}")

        def ov():
            pg.evaluate(OVERLAY)
        def cap(text, sub=''):
            MARKS.append([round(time.time() - T0, 2), text])
            ov(); pg.evaluate("([t,s]) => { document.getElementById('demo-cap').innerHTML = t + (s ? '<small>' + s + '</small>' : ''); }", [text, sub])
            pg.wait_for_timeout(1150)  # time to read the caption
        def point(sel):
            ov(); el = pg.locator(sel).first; el.scroll_into_view_if_needed(); bb = el.bounding_box()
            if bb: pg.evaluate("([x,y]) => { const d = document.getElementById('demo-dot'); d.style.left = x + 'px'; d.style.top = y + 'px'; }", [bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2])
            pg.wait_for_timeout(550)
        def click(sel, wait=900):
            if pg.locator(sel).count() == 0: pg.screenshot(path='/tmp/fail.png'); print('MISSING', sel, pg.inner_text('#app')[:400].replace('\n',' | '))
            point(sel); pg.locator(sel).first.click(); pg.wait_for_timeout(wait); ov()
        def slow_type(sel, text):
            point(sel); pg.locator(sel).first.click(); pg.locator(sel).first.type(text, delay=60)
        def card(title, lines, secs):
            MARKS.append([round(time.time() - T0, 2), 'CARD ' + title])
            pg.set_content(f"""<html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2e6b45,#1f4d33);font-family:system-ui,Segoe UI,Arial;color:#fffcf5">
              <div style="text-align:center;max-width:980px"><div style="font-size:58px;font-weight:800">{title}</div>
              {''.join(f'<div style="font-size:24px;margin-top:14px;opacity:.92">{l}</div>' for l in lines)}</div></body></html>""")
            pg.wait_for_timeout(secs * 1000)
        def sign_in(email, text, sub):
            pg.goto(B + '/'); pg.wait_for_timeout(900); cap(text, sub)
            point('#who'); pg.select_option('#who', email); pg.wait_for_timeout(700)
            click('#f button', 1500)
        def sign_out():
            click('#signout', 1200)

        import base64, json, html as HT
        MAPIMG = base64.b64encode(open('scripts/demo-assets/map2gis.png','rb').read()).decode()
        BOT = json.load(open('scripts/demo-assets/bot_chats.json'))
        def still(img64, text, sub, secs):
            pg.set_content(f"""<html><body style="margin:0;background:#1f2a22;height:100vh;display:flex;align-items:center;justify-content:center">
              <img src="data:image/png;base64,{img64}" style="width:1280px;height:720px;object-fit:cover"></body></html>"""); cap(text, sub); pg.wait_for_timeout(secs * 1000)
        def bubble(m):
            t = HT.escape(m['text']).replace('\n', '<br>')
            if m['from'] == 'me': return f'<div class="b me">{t}</div>'
            if m['from'] == 'press': return f'<div class="b press">👆 {t}</div>'
            if m['from'] == 'toast': return f'<div class="b toast">{t}</div>'
            kb = ''.join('<div class="kr">' + ''.join(f'<span>{HT.escape(x)}</span>' for x in row) + '</div>' for row in (m.get('buttons') or []))
            return f'<div class="b bot">{"🔔 " if m.get("push") else ""}{t}{("<div class=kb>" + kb + "</div>") if kb else ""}</div>'
        def bot_scene(chats, secs):
            MARKS.append([round(time.time() - T0, 2), 'BOTSCENE'])
            cols = ''.join(f'<div class="ph"><div class="hd">✈️ CampusPass bot · <i>{HT.escape(who)}</i></div><div class="msgs">' + ''.join(bubble(m) for m in msgs) + '</div></div>' for who, msgs in chats)
            pg.set_content("""<html><head><style>body{margin:0;height:100vh;background:linear-gradient(135deg,#2e6b45,#1f4d33);font-family:system-ui,Segoe UI,Arial;display:flex;gap:18px;justify-content:center;padding:18px 18px 0;box-sizing:border-box}
              .ph{width:395px;height:600px;background:#dfe9d9;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.35)}
              .hd{background:#24423a;color:#fff;padding:11px 14px;font:600 15px system-ui}.hd i{font-weight:400;opacity:.8}
              .msgs{flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:8px;gap:6px}
              .b{max-width:88%;padding:7px 10px;border-radius:12px;font-size:12.5px;line-height:1.35;opacity:0;transition:opacity .35s}
              .b.show{opacity:1}.me{align-self:flex-end;background:#d4f5c0}.press{align-self:flex-end;background:#f2c14e;font-weight:600}
              .bot{align-self:flex-start;background:#fff}.toast{align-self:center;background:rgba(0,0,0,.65);color:#fff;font-size:12px}
              .kb{margin-top:6px}.kr{display:flex;gap:4px;margin-top:4px}.kr span{flex:1;text-align:center;background:#eaf2ec;border-radius:7px;padding:4px;font-size:11.5px;color:#24423a;font-weight:600}
              </style></head><body>""" + cols + "</body></html>")
            # Inline scripts are blocked by the app's CSP, so the bubbles are revealed from the test driver
            mx = pg.evaluate("Math.max(...[...document.querySelectorAll('.ph')].map(p => p.querySelectorAll('.b').length))")
            step = int(secs * 1000 * 0.7 / mx)
            pg.wait_for_timeout(300)
            for k in range(mx):
                pg.evaluate("(k) => document.querySelectorAll('.ph').forEach(p => { const b = p.querySelectorAll('.b')[k]; if (b) b.classList.add('show'); })", k)
                pg.wait_for_timeout(step)
            pg.wait_for_timeout(int(secs * 1000 * 0.3))

        # 0. Title
        card('CampusPass — Team 06', ['Demo of the working prototype (localhost, SQLite, REST API, Telegram bot)',
             'Educational project for the course Business Analysis. Not a real product or service. All data are fictional.',
             'Roles: student · organizer · moderator · administrator · merch-shop cashier'], 4)

        # 1. Student: sign in, poster, filters
        sign_in('student1@test.local', 'Student signs in with a fictional test account and sees only the student menu', 'F1, FR-01 · UI01')
        cap('Poster: events of the next 7 days with free seats, waitlist and coins', 'F2, F3 · FR-02, FR-03')
        click('[data-type="tech"]', 900); cap('Filter by type and day; keyword search', 'F2 · FR-02')
        click('[data-type="all"]', 500)

        # 2. Register, indoor route, QR ticket
        art = 'article:has-text("Open Lab Demo Day")'
        click(f'{art} [data-open]', 1300)
        cap('One tap: “Register” — a confirmed seat and a unique QR ticket', 'F4, F5 · FR-04, FR-07')
        click('.modal [data-reg]', 1500)
        cap('“Route inside”: floor plan with the way from the entrance to the room', 'F22 · FR-25')
        click(f'{art} [data-open]', 1200)
        click('.modal [data-indoor]', 1800); pg.wait_for_timeout(2200)
        for _ in range(3):
            if pg.locator('.modal').count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        print('modals left', pg.locator('.modal').count())
        click('a[href="#/tickets"]', 1200)
        cap('Tickets: the QR code holds only a random ticket code, never personal data', 'F5 · COM06, HW01')
        code = pg.inner_text('.ticket .code').strip(); pg.wait_for_timeout(1200)

        # 3. City map (live site screenshot) and history
        url = pg.url
        still(MAPIMG, 'City map (2GIS) on the live site: campus and city events, routes on foot or by car', 'F22 · FR-24 · online copy: campuspass-team06.netlify.app', 4)
        pg.goto('about:blank'); pg.goto(B + '/#/tickets'); pg.wait_for_timeout(900); click('a[href="#/history"]', 1300)
        cap('Attendance history: attended, missed, cancelled — with coins and a 1–5 star rating', 'FR-26, FR-16, FR-17')
        pg.wait_for_timeout(1800)

        # 4. Language and theme
        cap('Kazakh, Russian and English; day and night theme', 'FR-19 · C03 · NFR-12 (WCAG AA contrast)')
        point('#lang'); pg.select_option('#lang', 'kk'); pg.wait_for_timeout(1100); ov()
        pg.select_option('#lang', 'ru'); pg.wait_for_timeout(1000); ov()
        click('#theme', 1100); click('#theme', 400); pg.select_option('#lang', 'en'); pg.wait_for_timeout(800); ov()
        sign_out()

        # 5. Organizer: consent, free rooms, check-in
        sign_in('organizer1@test.local', 'Organizer of the GDSC club signs in', 'F1 · role “organizer”')
        cap('First sign-in: consent screen — what data are kept, why and how long', 'C08 (Law of the RK “On Personal Data”)')
        click('#cagree', 400); click('#cok', 1300)
        click('a[href="#/myevents"]', 1500)
        cap('New event: free rooms in block C1 for the chosen time — lectures and other events are taken into account', 'F21 · FR-22')
        pg.locator('#freebox').scroll_into_view_if_needed(); pg.wait_for_timeout(1500)
        click('#freebox [data-pick]', 1500)
        cap('“Use” puts the room and time into the event form', 'FR-22, FR-23 · BR5')
        pg.wait_for_timeout(1200)
        click('a[href="#/checkin"]', 1200)
        cap('Check-in: scan the QR or type the code (opens 1 hour before the start)', 'F15 · FR-14, BR4')
        slow_type('#cc', code); click('#cgo', 1500)
        cap('Checked in — coins are added. A second check-in is refused', 'F15, F16 · FR-14, FR-16 · BR4')
        slow_type('#cc', code); click('#cgo', 1300)
        sign_out()

        # 5b. Moderator (Student Affairs)
        sign_in('moderator@test.local', 'Moderator (Student Affairs) checks every new event before students see it', 'F13 · FR-12, FR-13 · role “moderator”')
        cap('Approve — the event appears on the poster and the organizer gets a message', 'FR-12 · C04')
        click('[data-ok]', 1300)
        click('[data-no]', 700); point('#rr'); pg.locator('#rr').type('Please add the room number and the time.', delay=22)
        cap('Reject — only with a reason, which the organizer sees', 'FR-12 · C04')
        click('#rgo', 1300)
        if pg.locator('[data-acc]').count():
            cap('Club requests: accept a student into a club', 'FR-13')
            click('[data-acc]', 1200)
        click('a[href="#/stats"]', 1200)
        cap('Statistics already show the organizer’s check-in: registered, fill rate, checked in', 'F18 · FR-18 · BO2, BO3')
        pg.wait_for_timeout(1500)
        sign_out()

        # 6. Telegram bot
        card('Telegram bot', ['One bot, a different menu for each role (FR-34 – FR-38, FR-46 – FR-49)', 'Replies below are produced by our server/bot.js on fictional test data; the live bot is shown at the defense'], 2.5)
        bot_scene([('student', BOT['student'][-9:]), ('organizer', BOT['organizer'][-5:]), ('administrator', BOT['admin'][-4:])], 12)

        # 7. Administrator
        sign_in('admin@test.local', 'Administrator: complaints, events, clubs, users and the database', 'FR-40 … FR-45 · role “admin”')
        cap('Complaints from students: set the status and write an answer — the student is notified', 'FR-42, FR-43')
        pg.select_option('#cs-1', 'resolved'); point('#cc-1'); pg.fill('#cc-1', ''); pg.locator('#cc-1').type('Room checked: it is on the 3rd floor. Poster updated.', delay=25)
        click('[data-csave="1"]', 1300)
        click('[data-cedit]', 1500)
        cap('Edit any event in three languages', 'FR-41, FR-39 · C03')
        pg.wait_for_timeout(700); pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
        click('[data-atab="users"]', 1400)
        cap('Users: change a role or club; reset the fictional test data', 'FR-20, FR-44')
        pg.wait_for_timeout(1200)
        click('[data-atab="db"]', 1500)
        cap('Database: 12 tables, live row counts; passwords and Telegram data are hidden', 'NFR-10 · ER diagram in Appendix B')
        pg.wait_for_timeout(1500)
        sign_out()

        # 8. Student: coins → merch voucher
        sign_in('student1@test.local', 'Student: coins from events → merch shop voucher', 'F25 · FR-16, FR-28')
        click('a[href="#/profile"]', 1100)
        click('a[href="#/shop"]', 1300)
        cap('5% for 300 coins, 10% for 700 coins', 'FR-28 · BR-07')
        click('[data-buy="5"]', 700); click('[data-yes]', 1500)
        cap('Voucher with QR: valid 7 days, one purchase, at most 2 000 ₸ off', 'FR-29, FR-30 · BR-08, BR-09')
        voucher = pg.inner_text('.ticket .code').strip(); pg.wait_for_timeout(1000)
        sign_out()

        # 9. Cashier
        sign_in('shop@test.local', 'Merch-shop cashier redeems the voucher', 'FR-31 · role “shop”')
        slow_type('#cc', voucher); slow_type('#camt', '18000'); click('#cchk', 1500)
        cap('Discount and amount to pay are shown; confirm — the voucher is used once', 'FR-31, FR-32 · BR-08 · AT-23')
        click('#cconf', 1800)
        sign_out()

        # 10. End card
        card('Tested and traceable', ['25 automated acceptance tests (npm test) · all pass',
             'Every step above is in the traceability matrix (Appendix F) and the test cases (Appendix G)',
             'Code: github.com/ulnur07rk-cmyk/CampusPass'], 4.5)
        MARKS.append([round(time.time() - T0, 2), 'END'])
        json.dump(MARKS, open('scripts/demo-assets/marks.json', 'w'), indent=0)
        path = pg.video.path(); ctx.close(); b.close()
        print('VIDEO', path)

t = time.time()
try:
    run()
except Exception as e:
    print('FAILED', str(e)[:300])
print('took', round(time.time() - t), 's')
