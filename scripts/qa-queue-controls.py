"""Only the fictional, loopback party fixture. No NAS or Shield connections."""
from pathlib import Path
from datetime import datetime, timezone
import json, re, sqlite3
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((ROOT/'qa-artifacts/party/fixture.json').read_text(encoding='utf-8'))
BASE = FIXTURE['url']
OUT = ROOT/'qa-artifacts/queue-controls'
OUT.mkdir(parents=True, exist_ok=True)
assert BASE == 'http://127.0.0.1:18072'
assert Path(FIXTURE['database']).resolve().is_relative_to((ROOT/'.test-instance').resolve())
checks, errors = [], []

def passed(message):
    checks.append(message)
    print('PASS:', message, flush=True)

def sql(statement, args=()):
    with sqlite3.connect(FIXTURE['database']) as db:
        db.execute('PRAGMA foreign_keys=ON')
        return db.execute(statement, args).fetchall()

def login(page, user='host'):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE+'/library?roomId=1')
    page.get_by_placeholder('Username or email').fill(user)
    page.get_by_placeholder('Password', exact=True).fill('preview-'+user+'-2026')
    page.get_by_role('button', name='Sign In', exact=True).click()
    expect(page.get_by_role('heading', name='Categories', exact=True)).to_be_visible()

def find(page, title, book=False):
    page.goto(BASE+('/songbook' if book else '/library')+'?roomId=1')
    page.get_by_role('searchbox').fill(title)
    row=page.get_by_role('article').filter(has=page.get_by_role('heading', name=title, exact=True))
    expect(row).to_have_count(1)
    return row

def add(page, title):
    row=find(page,title)
    previous=sql('SELECT COALESCE(MAX(queueId),0) FROM queue')[0][0]
    row.get_by_role('button', name='Add '+title+' to queue', exact=True).click()
    for _ in range(50):
        result=sql('SELECT queueId FROM queue JOIN songs USING(songId) WHERE title=? AND queueId>?', (title,previous))
        if result:return result[0][0]
        page.wait_for_timeout(100)
    raise AssertionError('No queue acknowledgement for '+title)

def upcoming(page):
    return page.locator('section[aria-label="Up next"]')

def item(page,title):
    return upcoming(page).get_by_role('article').filter(has=page.get_by_role('heading', name=title, exact=True))

def order(page,titles):
    expect(upcoming(page).locator('article h3')).to_have_text(titles)

def menu(row,title):
    row.get_by_label('Details for '+title, exact=True).click()

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    desktop=browser.new_context(viewport={'width':1366,'height':900})
    assert desktop.request.get(BASE+'/api/instance').json()=={'isTest':True}
    assert sql("SELECT data FROM prefs WHERE key='modernTestInstance'")[0][0]=='true'
    sql('DELETE FROM queue')
    host=desktop.new_page();login(host)
    phone=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile=phone.new_page();login(mobile)
    for page,kind in [(host,'desktop'),(mobile,'phone')]:
        page.get_by_role('button',name='Browse Pop',exact=True).click()
        sort=page.get_by_role('combobox',name='Sort by',exact=True).bounding_box()
        filters=page.get_by_role('button',name='Filters',exact=True).bounding_box()
        assert abs(sort['y']+sort['height']-filters['y']-filters['height'])<1,(sort,filters)
        pagination=page.get_by_role('navigation',name='Song pages top')
        previous=pagination.get_by_role('button',name='Previous',exact=True).bounding_box()
        next_button=pagination.get_by_role('button',name='Next',exact=True).bounding_box()
        assert abs(previous['y']-next_button['y'])<1 and abs(previous['height']-next_button['height'])<1
        label=pagination.locator('span').bounding_box();nav=pagination.bounding_box()
        assert abs(label['x']+label['width']/2-nav['x']-nav['width']/2)<1
        row=page.get_by_role('article').first
        buttons=[row.get_by_role('button',name='Favourite Zebra Encore',exact=True).bounding_box(),row.get_by_role('button',name='Add Zebra Encore to queue',exact=True).bounding_box(),row.get_by_label('Details for Zebra Encore',exact=True).bounding_box()]
        assert max(b['y']+b['height']/2 for b in buttons)-min(b['y']+b['height']/2 for b in buttons)<1
        page.screenshot(path=str(OUT/(kind+'-alignment.png')))
        row.get_by_role('button',name='Choose version of Zebra Encore',exact=True).click()
        dialog=page.get_by_role('dialog');expect(dialog.get_by_role('radio')).to_have_count(2)
        dialog.get_by_role('radio').nth(1).check()
        dialog.get_by_role('heading',name='Zebra Encore',exact=True).click()
        expect(dialog).to_be_visible()
        bounds=dialog.bounding_box()
        assert bounds['x']>=0 and bounds['x']+bounds['width']<=page.viewport_size['width']+1
        if kind=='desktop':
            page.mouse.click(bounds['x']+5,bounds['y']+5)
            expect(dialog).to_be_visible()
            page.mouse.move(bounds['x']+20,bounds['y']+20);page.mouse.down();page.mouse.move(2,2);page.mouse.up()
            expect(dialog).to_be_visible()
        page.screenshot(path=str(OUT/(kind+'-versions.png')))
        if kind=='phone':page.touchscreen.tap(2,2)
        else:page.mouse.click(2,2)
        expect(dialog).not_to_be_visible()
        expect(row.get_by_role('button',name='Choose version of Zebra Encore',exact=True)).to_be_focused()
        row.get_by_role('button',name='Choose version of Zebra Encore',exact=True).click()
        page.keyboard.press('Escape');expect(dialog).not_to_be_visible()
    passed('desktop/phone controls align, pagination centres and version popup closes outside or on Escape without closing on inside clicks/drags')

    guest=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    singer=guest.new_page();login(singer,'singer')
    a,b,c,d='Alpha Song 001','Alpha Song 002','Alpha Song 003','Alpha Song 004'
    add(host,a);add(host,b);add(singer,c);add(singer,d)
    host.goto(BASE+'/queue');singer.goto(BASE+'/queue')
    order(host,[a,c,b,d])
    expect(item(singer,a).get_by_role('button')).to_have_count(0)
    item(singer,c).get_by_role('button',name='Move down',exact=True).click()
    order(host,[a,d,b,c])
    item(singer,c).get_by_role('button',name='Move up',exact=True).click()
    order(host,[a,c,b,d])
    singer_row=find(singer,'Zebra Encore');menu(singer_row,'Zebra Encore')
    expect(singer_row.get_by_role('button',name='Play next',exact=True)).to_have_count(0)
    passed('default singer rotation remains; singers can move their own turns but do not receive host priority/other-singer controls')

    item(host,d).get_by_role('button',name='Move up',exact=True).click();order(host,[a,c,d,b])
    item(host,d).get_by_role('button',name='Move up',exact=True).press('Enter');order(host,[a,d,c,b])
    item(host,d).get_by_role('button',name='Move down',exact=True).click();order(host,[a,c,d,b])
    item(host,b).get_by_label('More options for '+b,exact=True).click()
    item(host,b).get_by_role('button',name='Move to top',exact=True).click();order(host,[b,a,c,d])
    expect(item(host,b).get_by_role('button',name='Move up',exact=True)).to_be_disabled()
    expect(item(host,d).get_by_role('button',name='Move down',exact=True)).to_be_disabled()
    host.reload();order(host,[b,a,c,d])
    assert sql('SELECT COUNT(*) FROM queueOrderMoves')[0][0]>=4
    passed('host up/down arrows move one visible place across singers; Move to top and chronological moves persist after reload')

    player=desktop.new_page();player.on('pageerror',lambda error:errors.append(str(error)));player.goto(BASE+'/player')
    player.get_by_role('button',name='Play',exact=True).first.click()
    player.wait_for_function('document.querySelector("video")?.currentTime>.3')
    expect(host.locator('section[aria-label="Now playing"] h3')).to_have_text(b)
    original=player.locator('video').evaluate('(v)=>({src:v.currentSrc,time:v.currentTime})')
    row=find(mobile,'Zebra Encore');menu(row,'Zebra Encore');row.get_by_role('button',name='Play next',exact=True).click()
    picker=mobile.get_by_role('dialog');expect(picker.get_by_role('radio')).to_have_count(2)
    picker.get_by_role('radio').nth(1).check()
    picker.get_by_role('button',name='Play selected next',exact=True).click()
    host.goto(BASE+'/queue');expect(upcoming(host).locator('article h3').first).to_have_text('Zebra Encore')
    assert sql('SELECT selectedMediaId FROM queue WHERE songId=1')[0][0]==2
    current=player.locator('video').evaluate('(v)=>({src:v.currentSrc,time:v.currentTime,paused:v.paused})')
    assert current['src']==original['src'] and current['time']>=original['time'] and not current['paused']
    passed('library Play next selects the exact version and makes it next without interrupting the current song')

    fifth='Alpha Song 005'
    book_row=find(mobile,fifth,book=True);menu(book_row,fifth)
    book_row.get_by_role('button',name='Play next',exact=True).click()
    expect(upcoming(host).locator('article h3').first).to_have_text(fifth)
    queued=find(mobile,'Zebra Encore');menu(queued,'Zebra Encore')
    queued.get_by_role('button',name='Move to top',exact=True).click()
    expect(upcoming(host).locator('article h3').first).to_have_text('Zebra Encore')
    expect(host.locator('section[aria-label="Now playing"] h3')).to_have_text(b)
    passed('full songbook supports Play next; a queued library song can move to top without creating another copy')

    player.locator('video').evaluate('(v)=>v.currentTime=v.duration-.15')
    player.wait_for_function('document.querySelector("video")?.currentSrc.includes("/media/2?") && document.querySelector("video")?.currentTime>.2')
    player.get_by_role('button',name='Pause',exact=True).first.click()
    expect(host.locator('section[aria-label="Now playing"] h3')).to_have_text('Zebra Encore')
    before=upcoming(host).locator('article h3').all_text_contents()
    host.reload();order(host,before)
    mobile.goto(BASE+'/queue');order(mobile,before)
    singer.goto(BASE+'/queue');order(singer,before)
    assert sql('SELECT COUNT(*) FROM queue WHERE songId=1')[0][0]==1
    assert sql('SELECT COUNT(*) FROM queue WHERE playedAt IS NOT NULL')[0][0]==1
    assert mobile.locator('main').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    host.screenshot(path=str(OUT/'desktop-queue.png'));mobile.screenshot(path=str(OUT/'phone-queue.png'))
    passed('player advances to the chosen next backing track; queue order agrees across host/phone/singer and does not rewind history')
    assert not errors,errors
    passed('all flows finish without JavaScript errors')
    browser.close()

(OUT/'checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'checkedAt':datetime.now(timezone.utc).isoformat()},indent=2),encoding='utf-8')
