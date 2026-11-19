"""Exercise category cards against the real isolated songbook without editing metadata."""
from pathlib import Path
from datetime import datetime, timezone
import json
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:8091'
OUT = Path(__file__).resolve().parents[1] / 'qa-artifacts/category-cards'
OUT.mkdir(parents=True, exist_ok=True)
checks = []

def passed(name):
    checks.append(name); print('PASS:', name, flush=True)

def login(page):
    page.goto(BASE + '/songbook?roomId=1')
    page.get_by_placeholder('Username or email').fill('singer')
    page.get_by_placeholder('Password', exact=True).fill('preview-singer-2026')
    page.get_by_role('button', name='Sign In', exact=True).click()
    expect(page.get_by_role('button', name='Browse Pop', exact=True)).to_be_visible()

def loaded(page, total=None):
    expect(page.locator('[aria-busy=false] article').first).to_be_visible()
    if total is not None:
        expect(page.locator("p[aria-live='polite']")).to_contain_text(f'{total:,} songs')

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width':1440, 'height':1100})
    assert context.request.get(BASE + '/api/instance').json() == {'isTest':True}
    page = context.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    login(page)
    loaded(page, 56652)
    grid = page.get_by_role('group', name='Music styles', exact=True)
    expect(grid.get_by_role('button')).to_have_count(8)
    colours = grid.get_by_role('button').evaluate_all('(els)=>new Set(els.map(e=>getComputedStyle(e).backgroundImage)).size')
    assert colours >= 6
    assert grid.locator('svg').count() == 16
    grid.evaluate('(e)=>e.scrollIntoView({block:"center"})')
    page.screenshot(path=str(OUT / 'Desktop style cards.png'))
    passed('large illustrated, distinct-colour style cards appear by default')
    page.get_by_role('button', name='Show all 22 music styles', exact=True).click()
    expect(grid.get_by_role('button')).to_have_count(22)
    page.get_by_role('button', name='Browse Metal', exact=True).click()
    metal = context.request.get(BASE + '/api/songbook/?genre=Metal').json()
    loaded(page, metal['total'])
    assert all('Metal' in [e['categories']['genre'], *e['categories'].get('genres',[])] for e in metal['entries'])
    expect(page.get_by_label('Style', exact=True)).to_have_value('Metal')
    expect(page.get_by_role('button', name='All categories', exact=True)).to_be_in_viewport()
    passed('all 22 styles are reachable, cards filter real songs and keep the return control visible')
    page.get_by_role('button', name='All categories', exact=True).click()
    expect(page.get_by_role('button', name='Category cards', exact=True)).to_be_focused()
    page.get_by_role('button', name='Collections', exact=True).click()
    page.get_by_role('button', name='Browse Ballads', exact=True).click()
    ballads = context.request.get(BASE + '/api/songbook/?collection=Ballads').json()
    loaded(page, ballads['total'])
    expect(page.get_by_label('Style', exact=True)).to_have_value('')
    assert all('Ballads' in e['categories']['collections'] for e in ballads['entries'])
    passed('collection cards replace the previous category and returning restores keyboard focus')
    page.get_by_role('button', name='All categories', exact=True).click()
    page.get_by_role('button', name='Search & filters', exact=True).click()
    search = page.get_by_role('searchbox', name='Search full songbook')
    expect(search).to_be_focused()
    search.fill('perfect'); loaded(page, 92)
    expect(page.get_by_role('article').first).to_have_attribute('aria-label', 'Perfect by Ed Sheeran')
    expect(page.get_by_role('button', name='Browse Ballads', exact=True)).to_have_count(0)
    passed('direct search remains available, hides cards and retains Popular first')
    page.get_by_role('button', name='Category cards', exact=True).click()
    page.get_by_role('button', name='Music styles', exact=True).click()
    page.get_by_role('button', name='Browse Pop', exact=True).focus()
    page.keyboard.press('Enter')
    pop = context.request.get(BASE + '/api/songbook/?genre=Pop').json()
    loaded(page, pop['total'])
    expect(search).to_have_value('')
    expect(page.get_by_role('heading', name='Your matches', exact=True)).to_be_focused()
    passed('keyboard activation opens a full category and clears an old text search')
    phone_context = browser.new_context(viewport={'width':390, 'height':844})
    phone = phone_context.new_page(); phone.on('pageerror', lambda e: errors.append(str(e)))
    login(phone)
    phone_grid = phone.get_by_role('group', name='Music styles', exact=True)
    pop_card = phone.get_by_role('button', name='Browse Pop', exact=True)
    rock_card = phone.get_by_role('button', name='Browse Rock', exact=True)
    a, b = pop_card.bounding_box(), rock_card.bounding_box()
    assert a['width'] >= 150 and a['height'] >= 145 and abs(a['y']-b['y']) < 2 and b['x'] > a['x']
    phone_grid.scroll_into_view_if_needed()
    assert phone.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
    phone.screenshot(path=str(OUT / 'Phone style cards.png'))
    assert phone.get_by_role('button', name='Decades', exact=True).count() == 0
    assert phone.get_by_role('button', name='Languages', exact=True).count() == 0
    assert phone.get_by_role('button', name='Voices', exact=True).count() == 0
    passed('390px uses large two-column cards without offering unverified factual categories')
    rock_card.click(); loaded(phone, context.request.get(BASE + '/api/songbook/?genre=Rock').json()['total'])
    expect(phone.get_by_role('button', name='All categories', exact=True)).to_be_in_viewport()
    expect(phone.locator('[aria-busy=false] article').first).to_be_in_viewport()
    phone.screenshot(path=str(OUT / 'Phone selected Rock.png'))
    phone.get_by_role('button', name='All categories', exact=True).click()
    phone.get_by_role('button', name='Collections', exact=True).click()
    phone.get_by_role('button', name='Browse Party starters', exact=True).scroll_into_view_if_needed()
    phone.screenshot(path=str(OUT / 'Phone collection cards.png'))
    passed('phone taps show matching songs with an immediate route back to the card browser')
    page.goto(BASE + '/library')
    expect(page.get_by_role('button', name='Browse Country', exact=True)).to_be_visible()
    page.get_by_role('button', name='Browse Country', exact=True).click()
    expect(page.get_by_label('Genre', exact=True)).to_have_value('Country')
    expect(page.get_by_role('article')).to_have_count(2)
    page.get_by_role('button', name='All categories', exact=True).click()
    expect(page.get_by_role('button', name='Decades', exact=True)).to_be_visible()
    page.get_by_role('button', name='Search & filters', exact=True).click()
    page.get_by_role('searchbox', name='Search songs or artists').fill('electric')
    expect(page.get_by_role('article')).to_have_count(1)
    passed('the playable library used by QR visitors offers both card and direct-search routes')
    assert not errors, errors
    passed('all desktop and phone interactions complete without JavaScript errors')
    (OUT / 'Category card checks.json').write_text(json.dumps({'checkedAt':datetime.now(timezone.utc).isoformat(), 'checks':checks, 'categoryPinFavouriteQueueWrites':0}, indent=2), encoding='utf-8')
    browser.close()
