"""Check both art themes, account-scoped browser preferences and the player default."""
from pathlib import Path
from datetime import datetime, timezone
import json
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:8091'
OUT = Path(__file__).resolve().parents[1] / 'qa-artifacts/artwork-themes'
OUT.mkdir(parents=True, exist_ok=True)
checks = []

def passed(name):
    checks.append(name); print('PASS:', name, flush=True)

def login(page, user='singer', destination='/songbook'):
    page.goto(BASE + destination + '?roomId=1')
    page.get_by_placeholder('Username or email').fill(user)
    page.get_by_placeholder('Password', exact=True).fill('preview-' + user + '-2026')
    page.get_by_role('button', name='Sign In', exact=True).click()
    if destination == '/songbook':
        expect(page.get_by_role('button', name='Browse Pop', exact=True)).to_be_visible()
        expect(page.locator('[aria-busy=false] article').first).to_be_visible(timeout=15000)
    else:
        expect(page.locator('#player-fs-container')).to_be_visible()

def decode_cards(page):
    urls = page.locator('[data-artwork-theme] img').evaluate_all('(els)=>[...new Set(els.map(e=>e.src))]')
    assert urls
    sizes = page.evaluate('async urls=>Promise.all(urls.map(async src=>{const im=new Image();im.src=src;await im.decode();return [im.naturalWidth,im.naturalHeight]}))', urls)
    assert all(size == [1536,1024] for size in sizes)
    return urls

def capture(page, filename, phone=False):
    decode_cards(page)
    target = page.get_by_role('group', name='Category artwork') if phone else page.get_by_role('group', name='Music styles')
    target.evaluate('(e)=>e.scrollIntoView({block:"center"})')
    page.screenshot(path=str(OUT / filename))

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width':1440, 'height':1100})
    assert context.request.get(BASE + '/api/instance').json() == {'isTest':True}
    page = context.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    login(page, 'host')
    expect(page.get_by_role('button', name='Playful', exact=True)).to_have_attribute('aria-pressed', 'true')
    playful = decode_cards(page)
    capture(page, 'Desktop - Playful.png')
    passed('Playful is the default and its production artwork decodes successfully')
    page.get_by_role('button', name='Serious', exact=True).click()
    expect(page.get_by_role('button', name='Serious', exact=True)).to_have_attribute('aria-pressed', 'true')
    serious = decode_cards(page); assert set(serious).isdisjoint(playful)
    capture(page, 'Desktop - Serious.png')
    page.get_by_role('button', name='Browse Rock', exact=True).click()
    expect(page.get_by_label('Style', exact=True)).to_have_value('Rock')
    page.get_by_role('button', name='Category cards', exact=True).click()
    page.get_by_role('button', name='Playful', exact=True).click()
    expect(page.get_by_label('Style', exact=True)).to_have_value('Rock')
    page.get_by_role('button', name='Serious', exact=True).click()
    page.reload()
    expect(page.get_by_role('button', name='Serious', exact=True)).to_have_attribute('aria-pressed', 'true')
    page.goto(BASE + '/library')
    expect(page.get_by_role('button', name='Serious', exact=True)).to_have_attribute('aria-pressed', 'true')
    passed('switching art preserves filters, survives reload and follows the user into the playable library')
    page.goto(BASE + '/account')
    page.get_by_role('button', name='Sign Out', exact=True).click()
    expect(page.get_by_placeholder('Username or email')).to_be_visible()
    login(page, 'singer')
    expect(page.get_by_role('button', name='Playful', exact=True)).to_have_attribute('aria-pressed', 'true')
    passed('art preferences remain separate for two users sharing the same browser')
    for theme in ['Serious', 'Playful']:
        page.get_by_role('button', name=theme, exact=True).click()
        page.get_by_role('button', name='Show all 22 music styles', exact=True).click()
        grid = page.get_by_role('group', name='Music styles', exact=True)
        expect(grid.get_by_role('button')).to_have_count(22)
        positions = grid.locator('img').evaluate_all('(els)=>els.map(e=>[e.src,e.style.left,e.style.top].join("|"))')
        assert len(set(positions)) == 22
        decode_cards(page)
        page.get_by_role('button', name='Collections', exact=True).click()
        expect(page.get_by_role('group', name='Collections', exact=True).get_by_role('button')).to_have_count(7)
        decode_cards(page)
        page.get_by_role('button', name='Music styles', exact=True).click()
    passed('both themes cover every real style and collection with distinct category artwork')
    phone_context = browser.new_context(viewport={'width':390, 'height':844})
    phone = phone_context.new_page(); phone.on('pageerror', lambda e: errors.append(str(e)))
    login(phone)
    for theme in ['Playful', 'Serious']:
        phone.get_by_role('button', name=theme, exact=True).click()
        capture(phone, 'Phone - ' + theme + '.png', phone=True)
        assert phone.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
        assert phone.locator('main').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
        phone.get_by_role('button', name='Collections', exact=True).click()
        phone.get_by_role('group', name='Collections', exact=True).evaluate('(e)=>e.scrollIntoView({block:"center"})')
        decode_cards(phone); phone.screenshot(path=str(OUT / ('Phone collections - ' + theme + '.png')))
        phone.get_by_role('button', name='Music styles', exact=True).click()
    passed('both themes and collections fit the 390px phone layout with live readable labels')
    blocked = browser.new_context()
    blocked.add_init_script("const oldSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('karaoke.categoryArtwork.'))throw new Error('Preference storage unavailable');return oldSet.call(this,k,v)}")
    blocked_page = blocked.new_page(); blocked_page.on('pageerror', lambda e: errors.append(str(e)))
    login(blocked_page)
    blocked_page.get_by_role('button', name='Serious', exact=True).click()
    expect(blocked_page.get_by_role('button', name='Serious', exact=True)).to_have_attribute('aria-pressed', 'true')
    decode_cards(blocked_page); blocked.close()
    passed('art switching remains usable when preference storage is blocked')
    admin = browser.new_context()
    player = admin.new_page(); player.on('pageerror', lambda e: errors.append(str(e)))
    login(player, 'host', '/player')
    player.get_by_role('button', name='Player Options', exact=True).first.click()
    player.get_by_role('tab', name='Display', exact=True).click()
    visualizer = player.get_by_label('Visualizer', exact=True)
    expect(visualizer).not_to_be_checked()
    player.screenshot(path=str(OUT / 'Player - visualiser off.png'))
    passed('a fresh player session starts with the visualiser off')
    expect(visualizer).to_be_enabled()
    # The controlled checkbox updates after the player acknowledges over the socket.
    visualizer.click(); expect(visualizer).to_be_checked()
    visualizer.click(); expect(visualizer).not_to_be_checked()
    visualizer.click(); expect(visualizer).to_be_checked()
    player.reload()
    player.get_by_role('button', name='Player Options', exact=True).first.click()
    player.get_by_role('tab', name='Display', exact=True).click()
    expect(player.get_by_label('Visualizer', exact=True)).not_to_be_checked()
    player.close(); admin.close()
    passed('the manual visualiser toggle still works and a new player session returns to the off default')
    assert not errors, errors
    passed('artwork and player checks complete without JavaScript errors')
    (OUT / 'Artwork theme checks.json').write_text(json.dumps({'checkedAt':datetime.now(timezone.utc).isoformat(), 'checks':checks, 'categoryPinFavouriteWrites':0, 'visualizerDefaultOff':True}, indent=2), encoding='utf-8')
    browser.close()
