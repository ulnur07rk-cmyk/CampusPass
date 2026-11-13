"""Records the demo video (Team06_FP_Demo): run `npm run reset`, then `npm start`, then `python3 scripts/record-demo.py` (needs Python + Playwright + Chrome; ffmpeg converts the .webm to .mp4).
Records Team06_FP_Demo.mp4: a scripted walk through the CampusPass prototype (localhost, fictional data).
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
        for e, pw in [('moderator@test.local', 'Moderator123!'), ('shop@test.local', 'Shop123!')]:
            api.post('/api/auth/login', data={'email': e, 'password': pw}); api.post('/api/me/consent', data={}); api.post('/api/auth/logout', data={})
        ctx = b.new_context(viewport={'width': W, 'height': H}, record_video_dir='/tmp/vid', record_video_size={'width': W, 'height': H})
        pg = ctx.new_page()
        pg.add_init_script("try{localStorage.setItem('cp.theme','light');localStorage.setItem('cp.lang','en')}catch(e){}")

        def ov():
            pg.evaluate(OVERLAY)
        def cap(text, sub=''):
            ov(); pg.evaluate("([t,s]) => { document.getElementById('demo-cap').innerHTML = t + (s ? '<small>' + s + '</small>' : ''); }", [text, sub])
            pg.wait_for_timeout(1400)  # time to read the caption
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

        # 0. Title
        card('CampusPass — Team 06', ['Demo of the working prototype (localhost, SQLite, REST API)',
             'Educational project for the course Business Analysis. Not a real product or service. All data are fictional.',
             'Roles shown: student · organizer · moderator · merch-shop cashier'], 6)

        # 1. Student: sign in, poster, filters, search
        sign_in('student1@test.local', 'Student signs in with a fictional test account and sees only the student menu', 'F1, FR-01 · UI01')
        cap('The poster shows the events of the next 7 days with free seats, waitlist and coins', 'F2, F3 · FR-02, FR-03')
        pg.wait_for_timeout(2500)
        click('[data-type="tech"]', 1200); cap('Filter by type and by day; keyword search', 'F2 · FR-02')
        click('[data-type="all"]', 600); slow_type('#kw', 'demo'); pg.wait_for_timeout(1500)
        pg.fill('#kw', ''); pg.wait_for_timeout(900); ov()

        # 2. Register, QR ticket
        cap('Open the event: time, room, free seats, description', 'F3 · FR-03')
        art = 'article:has-text("Open Lab Demo Day")'
        click(f'{art} [data-open]', 1800)
        cap('One tap: “Register” — the student gets a confirmed seat and a unique QR ticket', 'F4, F5 · FR-04, FR-07')
        click('.modal [data-reg]', 1800)
        click('a[href="#/tickets"]', 1500)
        cap('Tickets: the QR code holds only a random ticket code, never personal data', 'F5 · COM06, HW01')
        code = pg.inner_text('.ticket .code').strip(); pg.wait_for_timeout(2500)

        # 3. Language and theme
        cap('The interface works in Kazakh, Russian and English, with a day and a night theme', 'F12, C03 · UI07 (WCAG AA contrast)')
        point('#lang'); pg.select_option('#lang', 'kk'); pg.wait_for_timeout(1500); ov(); cap('Қазақша', 'F12, C03')
        pg.select_option('#lang', 'ru'); pg.wait_for_timeout(1300); ov(); cap('Русский', 'F12, C03')
        click('#theme', 1300); cap('Night theme', 'UI07')
        click('#theme', 600); pg.select_option('#lang', 'en'); pg.wait_for_timeout(1000); ov()
        sign_out()

        # 4. Organizer: consent screen, check-in by ticket code
        sign_in('organizer1@test.local', 'Second role: the organizer of the GDSC club signs in', 'F1 · role “organizer”')
        cap('First sign-in: the consent screen explains what data are kept, why and for how long', 'C08 (Law of the RK “On Personal Data”)')
        pg.wait_for_timeout(2500); click('#cagree', 600); click('#cok', 1500)
        click('a[href="#/checkin"]', 1500)
        cap('Check-in opens 1 hour before the start. The organizer scans the QR or types the code', 'F15 · FR-14, BR4')
        slow_type('#cc', code); pg.wait_for_timeout(500)
        click('#cgo', 1800)
        cap('Checked in: the registration saved by the student is found, coins are added', 'F15, F16 · FR-14, FR-16')
        pg.wait_for_timeout(2600)
        slow_type('#cc', code); click('#cgo', 1500)
        cap('A second check-in with the same ticket is refused', 'BR4 · AT-07')
        pg.wait_for_timeout(2200)
        sign_out()

        # 5. Moderator: statistics show the check-in
        sign_in('moderator@test.local', 'Third role: the moderator from Student Affairs', 'F16, F17 · moderation queue')
        pg.wait_for_timeout(1500)
        click('a[href="#/stats"]', 1500)
        cap('Statistics already show the organizer’s check-in: registered, fill rate, checked in', 'F18 · FR-18 · BO2, BO3')
        row = pg.locator('tr:has-text("Open Lab Demo Day")').first
        row.scroll_into_view_if_needed(); bb = row.bounding_box()
        if bb: pg.evaluate("([x,y]) => { const d = document.getElementById('demo-dot'); d.style.left = x + 'px'; d.style.top = y + 'px'; }", [bb['x'] + 60, bb['y'] + bb['height'] / 2])
        pg.wait_for_timeout(3500)
        sign_out()

        # 6. Student: coins → merch voucher
        sign_in('student1@test.local', 'Back to the student: Campus Coins from the check-in are in the Profile', 'F10 · FR-16')
        click('a[href="#/profile"]', 1600); pg.wait_for_timeout(1200)
        cap('Coins can be exchanged in the university merch shop', 'FR-28 · BR-07: 5% for 300 coins, 10% for 700 coins')
        click('a[href="#/shop"]', 1600); pg.wait_for_timeout(1500)
        click('[data-buy="5"]', 900); click('[data-yes]', 1800)
        cap('A 5% voucher with a QR code: valid 7 days, one purchase, at most 2 000 ₸ off', 'FR-29, FR-30 · BR-08, BR-09')
        voucher = pg.inner_text('.ticket .code').strip(); pg.wait_for_timeout(3000)
        sign_out()

        # 7. Cashier: redeem the voucher
        sign_in('shop@test.local', 'Fourth role: the cashier of the merch shop', 'role “shop”')
        cap('The cashier scans the voucher and types the purchase amount', 'FR-31')
        slow_type('#cc', voucher); slow_type('#camt', '18000'); click('#cchk', 1800)
        cap('The system shows the student, the discount and the amount to pay', 'FR-31 · BR-08')
        pg.wait_for_timeout(2500)
        click('#cconf', 1800)
        cap('Confirmed: the voucher is used once; the student gets a message', 'FR-31, FR-32 · AT-23')
        pg.wait_for_timeout(2800)
        sign_out()

        # 8. End card
        card('Tested and traceable', ['25 automated acceptance tests (npm test) · all pass',
             'Every step above is in the traceability matrix (Appendix F) and the test cases (Appendix G)',
             'Code: github.com/ulnur07rk-cmyk/CampusPass'], 6)
        path = pg.video.path(); ctx.close(); b.close()
        print('VIDEO', path)

t = time.time()
try:
    run()
except Exception as e:
    print('FAILED', str(e)[:300])
print('took', round(time.time() - t), 's')
