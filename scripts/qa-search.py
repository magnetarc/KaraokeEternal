"""Rapid real key events against 52,494 fictional songs on loopback only."""
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
import json
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'qa-artifacts/search'
fixture = json.loads((OUT / 'fixture.json').read_text(encoding='utf-8'))
BASE = fixture['url']
assert BASE == 'http://127.0.0.1:18073' and fixture['songsCount'] == 52494
assert Path(fixture['database']).resolve().is_relative_to((ROOT / '.test-instance').resolve())
checks, errors = [], []


def passed(text):
    checks.append(text)
    print('PASS:', text, flush=True)


def query(url):
    return parse_qs(urlparse(str(url)).query).get('query', [''])[0]


with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for phone in (False, True):
        context = browser.new_context(viewport={'width': 390 if phone else 1366, 'height': 844 if phone else 900}, is_mobile=phone, has_touch=phone)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        assert context.request.get(BASE + '/api/instance').json() == {'isTest': True}
        page.add_init_script("""window.searchNavigations=[];
          for (const method of ['pushState','replaceState']) {
            const original=history[method];
            history[method]=function(...args) {window.searchNavigations.push({url:String(args[2]),time:performance.now()});return original.apply(this,args)};
          }""")
        page.goto(BASE + '/library?roomId=1')
        page.get_by_placeholder('Username or email').fill('host')
        page.get_by_placeholder('Password', exact=True).fill('preview-host-2026')
        page.get_by_role('button', name='Sign In', exact=True).click()
        expect(page.get_by_role('heading', name='Categories', exact=True)).to_be_visible(timeout=30000)
        session = context.new_cdp_session(page)
        session.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        for book in (False, True):
            route = '/songbook' if book else '/library'
            label = 'Search full songbook' if book else 'Search songs or artists'
            clear = 'Clear songbook search' if book else 'Clear song search'
            name = ('phone' if phone else 'desktop') + (' songbook' if book else ' library')
            page.goto(BASE + route + '?roomId=1')
            field = page.get_by_role('searchbox', name=label)
            expect(field).to_be_visible()
            expect(page.get_by_role('heading', name='Categories', exact=True)).to_be_visible(timeout=30000)
            page.evaluate('window.searchNavigations=[]')
            text = 'fictional scale ensemble perfect'
            field.press_sequentially(text, delay=8)
            expect(field).to_have_value(text)
            page.wait_for_url(lambda url: query(url) == text)
            expect(field).to_be_focused()
            expect(page.get_by_role('article').first).to_contain_text('Perfect', timeout=30000)
            commits = page.evaluate('window.searchNavigations.map(n=>n.url)')
            commits = [url for url in commits if query(url)]
            assert len(commits) == 1, commits
            passed(name + ': rapid typing retains every character/focus and submits once under 4x CPU throttling')

            # Native editing keys, not only fill(), must survive re-renders.
            field.press('ControlOrMeta+A')
            field.press_sequentially('Moonlighx', delay=10)
            field.press('Backspace')
            field.press_sequentially('t')
            field.press('Enter')
            page.wait_for_url(lambda url: query(url) == 'Moonlight')
            expect(field).to_have_value('Moonlight')
            expect(page.get_by_role('article').first).to_contain_text('Moonlight', timeout=30000)
            (page.get_by_role('button', name=clear).tap() if phone else page.get_by_role('button', name=clear).click())
            expect(field).to_have_value('')
            expect(field).to_be_focused()
            page.wait_for_url(lambda url: query(url) == '')
            passed(name + ': replacement, backspace, Enter and clear work without losing focus')

            # Composition does not submit intermediate phonetic/IME characters.
            field.evaluate("""element=>{
              element.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,'你好');
              element.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'你好',isComposing:true}));
              element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true}));
            }""")
            page.wait_for_timeout(450)
            assert query(page.url) == ''
            expect(field).to_have_value('你好')
            field.evaluate("element=>element.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:element.value}))")
            page.wait_for_url(lambda url: query(url) == '你好')
            passed(name + ': IME composition waits until the text is complete, including composition Enter')

            # A category action cancels a not-yet-submitted edit.
            field.fill('must never leak')
            page.get_by_role('button', name='All categories', exact=True).first.click()
            expect(field).to_have_value('')
            page.wait_for_timeout(500)
            assert query(page.url) == ''
            page.get_by_role('button', name='Browse Pop', exact=True).click()
            field.fill('cancel this draft too')
            page.go_back()
            expect(field).to_have_value('')
            page.wait_for_timeout(500)
            assert query(page.url) == ''
            passed(name + ': category navigation and browser Back discard pending text without a delayed search')

            # Back/Forward must also restore a nonempty committed search.
            field.fill('Moonlight')
            field.press('Enter')
            page.wait_for_url(lambda url: query(url) == 'Moonlight')
            page.get_by_role('button', name='All categories', exact=True).first.click()
            field.fill('unfinished')
            page.go_back()
            expect(field).to_have_value('Moonlight')
            page.wait_for_timeout(500)
            assert query(page.url) == 'Moonlight'
            page.go_forward()
            expect(field).to_have_value('')
            passed(name + ': Back/Forward restore the URL search rather than an unfinished local draft')

            field.fill('Perfect')
            field.press('Enter')
            page.wait_for_url(lambda url: query(url) == 'Perfect')
            expect(page.get_by_role('article').first).to_contain_text('Perfect', timeout=30000)
            page.screenshot(path=str(OUT / (name.replace(' ', '-') + '.png')))
            if book:
                held = []
                failed = []
                page.on('requestfailed', lambda request: failed.append(request.url))
                def hold_old(request_route):
                    if parse_qs(urlparse(request_route.request.url).query).get('q') == ['Moonlight']:
                        held.append(request_route)
                    else:
                        request_route.continue_()
                page.route('**/api/songbook/?*', hold_old)
                field.fill('Moonlight')
                field.press('Enter')
                for _ in range(100):
                    if held:
                        break
                    page.wait_for_timeout(30)
                assert held
                field.press_sequentially(' next', delay=8)
                expect(field).to_have_value('Moonlight next')
                field.fill('Perfect')
                field.press('Enter')
                page.wait_for_url(lambda url: query(url) == 'Perfect')
                expect(page.get_by_role('article').first).to_contain_text('Perfect', timeout=30000)
                for _ in range(100):
                    if any('q=Moonlight' in url for url in failed):
                        break
                    page.wait_for_timeout(30)
                assert any('q=Moonlight' in url for url in failed), failed
                # Finish the already-cancelled interception so Playwright has no
                # pending route callback when this context closes.
                for pending in held:
                    pending.abort('aborted')
                page.unroute('**/api/songbook/?*', hold_old)
                passed(name + ': typing continues while a slow request is pending; superseded request is aborted')
        context.close()
    browser.close()
assert not errors, errors
(OUT / 'checks.json').write_text(json.dumps({'checkedAt': datetime.now(timezone.utc).isoformat(), 'songs': 52494, 'cpuThrottle': 4, 'checks': checks, 'errors': errors}, indent=2), encoding='utf-8')
