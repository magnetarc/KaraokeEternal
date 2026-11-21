"""Menu regression checks on the marked fictional loopback fixture only."""
from pathlib import Path
from datetime import datetime, timezone
import json, sqlite3
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
fixture=json.loads((ROOT/'qa-artifacts/party/fixture.json').read_text(encoding='utf-8'))
BASE=fixture['url'];OUT=ROOT/'qa-artifacts/menu-dismissal';OUT.mkdir(parents=True,exist_ok=True)
assert BASE=='http://127.0.0.1:18072'
assert Path(fixture['database']).resolve().is_relative_to((ROOT/'.test-instance').resolve())
checks=[];errors=[]
def passed(text):checks.append(text);print('PASS:',text,flush=True)
def db(sql,args=()):
    with sqlite3.connect(fixture['database']) as connection:
        connection.execute('PRAGMA foreign_keys=ON')
        return connection.execute(sql,args).fetchall()
def login(page):
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(BASE+'/library?roomId=1')
    page.get_by_placeholder('Username or email').fill('host')
    page.get_by_placeholder('Password',exact=True).fill('preview-host-2026')
    page.get_by_role('button',name='Sign In',exact=True).click()
    expect(page.get_by_role('heading',name='Categories',exact=True)).to_be_visible()
def opened(page,count):expect(page.locator('details[data-menu-popup][open]')).to_have_count(count)
def row_menus(page):return page.get_by_role('article').locator('details[data-menu-popup]')
def add(page,title):
    page.goto(BASE+'/library?roomId=1')
    page.get_by_role('searchbox').fill(title)
    row=page.get_by_role('article').filter(has=page.get_by_role('heading',name=title,exact=True))
    row.get_by_role('button',name='Add '+title+' to queue',exact=True).click()
    for _ in range(40):
        if db('SELECT 1 FROM queue JOIN songs USING(songId) WHERE title=?',(title,)):return
        page.wait_for_timeout(100)
    raise AssertionError('No queue acknowledgement')

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    context=browser.new_context(viewport={'width':1366,'height':900})
    assert context.request.get(BASE+'/api/instance').json()=={'isTest':True}
    assert db("SELECT data FROM prefs WHERE key='modernTestInstance'")[0][0]=='true'
    db('DELETE FROM queue')
    page=context.new_page();login(page)
    page.get_by_role('button',name='Browse Pop',exact=True).click()
    menus=row_menus(page)
    menus.nth(0).locator('summary').click();opened(page,1)
    menus.nth(4).locator('summary').click();opened(page,1)
    expect(menus.nth(0)).not_to_have_attribute('open','')
    expect(menus.nth(4)).to_have_attribute('open','')
    page.get_by_role('heading',name='Pop',exact=True).click();opened(page,0)
    menus.nth(0).locator('summary').click();menus.nth(0).locator('summary').click();opened(page,0)
    passed('library menus close outside, toggle normally and never accumulate across rows')

    trigger=menus.nth(0).locator('summary')
    trigger.click();trigger.press('Tab');opened(page,1)
    page.keyboard.press('Escape');opened(page,0);expect(trigger).to_be_focused()
    trigger.click();page.get_by_role('searchbox').focus();opened(page,0)
    page.evaluate('()=>{const m=document.querySelectorAll("article details[data-menu-popup]");m[0].open=true;m[1].open=true}')
    opened(page,1)
    page.keyboard.press('Escape');opened(page,0)
    passed('Escape returns focus, focus leaving dismisses, internal focus stays open and native toggle enforces exclusivity')

    trigger.click();menus.nth(0).get_by_role('button',name='Play next',exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible();opened(page,0)
    page.keyboard.press('Escape');expect(page.get_by_role('dialog')).not_to_be_visible()
    expect(trigger).to_be_focused()
    passed('selecting a menu action still opens its dialog, closes the menu and restores the trigger afterward')

    trigger.click()
    toolbar=page.get_by_role('navigation',name='Browser navigation').locator('details[data-menu-popup]')
    toolbar.locator('summary').click();opened(page,1)
    expect(menus.nth(0)).not_to_have_attribute('open','')
    toolbar.get_by_role('link',name='Full songbook',exact=True).click()
    expect(page.get_by_role('heading',name='Categories',exact=True)).to_be_visible();opened(page,0)
    page.get_by_role('button',name='Browse Pop',exact=True).click()
    book_menus=row_menus(page)
    book_menus.nth(0).locator('summary').click();book_menus.nth(4).locator('summary').click();opened(page,1)
    page.get_by_role('heading',name='Pop',exact=True).click();opened(page,0)
    passed('toolbar and full-songbook menus share the same dismissal and single-open behaviour')

    for title in ['Alpha Song 001','Alpha Song 002','Alpha Song 003']:add(page,title)
    page.goto(BASE+'/queue')
    queue_menus=row_menus(page)
    queue_menus.nth(0).locator('summary').click();opened(page,1)
    expect(queue_menus.nth(0).get_by_role('button',name='Move to top',exact=True)).to_be_disabled()
    queue_menus.nth(1).locator('summary').click();opened(page,1)
    queue_menus.nth(2).locator('summary').click();opened(page,1)
    page.get_by_role('heading',name='Tonight’s queue',exact=True).click();opened(page,0)
    queue_menus.nth(2).locator('summary').click();page.keyboard.press('Escape');opened(page,0)
    expect(queue_menus.nth(2).locator('summary')).to_be_focused()
    history=page.locator('details').filter(has=page.locator('summary').filter(has_text='History'))
    history.locator('summary').click();expect(history).to_have_attribute('open','')
    queue_menus.nth(0).locator('summary').click()
    page.get_by_role('heading',name='Tonight’s queue',exact=True).click()
    opened(page,0);expect(history).to_have_attribute('open','')
    assert db('SELECT COUNT(*) FROM queueOrderMoves')[0][0]==0
    passed('queue menus dismiss outside/on Escape without triggering moves or closing the History panel')

    queue_menus.nth(2).locator('summary').click()
    queue_menus.nth(2).get_by_role('button',name='Move to top',exact=True).press('Enter')
    opened(page,0)
    expect(page.locator('section[aria-label="Up next"] article h3').first).to_have_text('Alpha Song 003')
    assert db('SELECT COUNT(*) FROM queueOrderMoves')[0][0]==1
    passed('keyboard selection closes the queue menu and performs exactly the intended move')

    phone=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile=phone.new_page();login(mobile);mobile.goto(BASE+'/queue')
    mobile_menus=row_menus(mobile)
    mobile_menus.nth(0).locator('summary').tap();opened(mobile,1)
    mobile_menus.nth(1).locator('summary').tap();opened(mobile,1)
    expect(mobile_menus.nth(0)).not_to_have_attribute('open','')
    mobile.screenshot(path=str(OUT/'phone-single-menu.png'))
    mobile.get_by_role('heading',name='Tonight’s queue',exact=True).tap();opened(mobile,0)
    mobile.screenshot(path=str(OUT/'phone-dismissed.png'))
    mobile.goto(BASE+'/library?roomId=1');mobile.get_by_role('button',name='Browse Pop',exact=True).tap()
    row_menus(mobile).nth(0).locator('summary').tap();row_menus(mobile).nth(4).locator('summary').tap();opened(mobile,1)
    mobile.get_by_role('heading',name='Pop',exact=True).tap();opened(mobile,0)
    queue_menus=row_menus(page);queue_menus.nth(1).locator('summary').click();opened(page,1)
    page.screenshot(path=str(OUT/'desktop-single-menu.png'))
    passed('phone taps dismiss and replace queue/library menus with only one box visible')
    assert errors==[],errors
    passed('all menu and dialog interactions finish without JavaScript errors')
    browser.close()
(OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'checkedAt':datetime.now(timezone.utc).isoformat()},indent=2),encoding='utf-8')
