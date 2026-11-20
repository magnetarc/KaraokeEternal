"""Loopback-only fictional party fixture. Never connects to NAS or Shield."""
from pathlib import Path
from datetime import datetime, timezone
import json, re, sqlite3
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'qa-artifacts/party'
fixture=json.loads((OUT/'fixture.json').read_text(encoding='utf-8')); BASE=fixture['url']
assert BASE=='http://127.0.0.1:18072'
assert Path(fixture['database']).resolve().is_relative_to((ROOT/'.test-instance').resolve())
checks=[]; errors=[]
def passed(message): checks.append(message); print('PASS:',message,flush=True)
def login(page,user='host'):
    page.goto(BASE+'/library?roomId=1')
    page.get_by_placeholder('Username or email').fill(user)
    page.get_by_placeholder('Password',exact=True).fill('preview-'+user+'-2026')
    page.get_by_role('button',name='Sign In',exact=True).click()
    expect(page.get_by_role('heading',name='Categories',exact=True)).to_be_visible()
def query(db,sql,args=()):
    with sqlite3.connect(fixture['database']) as connection: return connection.execute(sql,args).fetchall()
def find_and_add(page,title):
    field=page.get_by_role('searchbox',name='Search songs or artists')
    field.fill(title)
    row=page.get_by_role('article').filter(has=page.get_by_role('heading',name=title,exact=True))
    expect(row).to_have_count(1)
    previous=query(None,'SELECT COALESCE(MAX(queueId),0) FROM queue')[0][0]
    row.get_by_role('button',name='Add '+title+' to queue',exact=True).click()
    expect(row.get_by_role('button',name='Add '+title+' to queue',exact=True)).to_be_disabled()
    for _ in range(40):
        added=query(None,'SELECT q.queueId FROM queue q JOIN songs s USING(songId) WHERE title=? AND q.queueId>?',(title,previous))
        if added:return added[-1][0]
        page.wait_for_timeout(100)
    raise AssertionError('Queue add acknowledgement missing')
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True,args=['--autoplay-policy=no-user-gesture-required'])
    desktop=browser.new_context(viewport={'width':1366,'height':900})
    assert desktop.request.get(BASE+'/api/instance').json()=={'isTest':True}
    with sqlite3.connect(fixture['database']) as db:
        assert db.execute("SELECT data FROM prefs WHERE key='modernTestInstance'").fetchone()[0]=='true'
        db.execute('DELETE FROM queue');db.execute('DELETE FROM songPlayCounts')
    host=desktop.new_page();host.on('pageerror',lambda error:errors.append(str(error)));login(host)
    expect(host.get_by_text('BROWSER PREVIEW',exact=True)).to_have_count(0)
    expect(host.get_by_text('Find your next',exact=False)).to_have_count(0)
    expect(host.get_by_role('group',name='Category artwork')).to_have_count(0)
    host.screenshot(path=str(OUT/'desktop-categories.png'))
    phone=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile=phone.new_page();mobile.on('pageerror',lambda error:errors.append(str(error)));login(mobile)
    pop=mobile.get_by_role('button',name='Browse Pop',exact=True)
    assert pop.bounding_box()['y']+pop.bounding_box()['height']<700
    assert mobile.get_by_role('searchbox').bounding_box()['y']<220
    mobile.screenshot(path=str(OUT/'phone-categories.png'))
    passed('phone/desktop lead with search and visible category cards; no promotional hero, preview label or artwork chooser')
    pop.click()
    rows=mobile.get_by_role('article');expect(rows).to_have_count(40)
    expect(rows.first.get_by_role('heading')).to_have_text('Zebra Encore')
    assert rows.first.bounding_box()['y']<470
    assert rows.nth(1).bounding_box()['height']<105
    expect(mobile.get_by_role('navigation',name='Song pages top')).to_be_visible()
    mobile.get_by_role('button',name='Filters',exact=True).click()
    for name in ('Voices','language','decade'): expect(mobile.get_by_role('combobox',name=name,exact=True)).to_have_count(0)
    mobile.get_by_role('button',name='Filters',exact=True).click()
    mobile.screenshot(path=str(OUT/'phone-pop.png'))
    passed('category opens compact songs above fold; editorial recommendations outrank alphabetic ties; empty filters hidden')
    top=mobile.get_by_role('navigation',name='Song pages top');top.get_by_role('button',name='Next',exact=True).click()
    expect(top).to_contain_text('Page 2 of 3')
    target=mobile.get_by_role('article').nth(9)
    add=target.get_by_role('button',name=re.compile('^Add .* to queue$'))
    add.scroll_into_view_if_needed()
    before=mobile.locator('main').evaluate('(e)=>e.scrollTop')
    url=mobile.url;add.click();expect(add).to_be_disabled()
    mobile.wait_for_timeout(300)
    assert mobile.url==url
    after=mobile.locator('main').evaluate('(e)=>e.scrollTop');assert abs(after-before)<5,(before,after)
    assert mobile.get_by_role('button',name='All categories',exact=True).bounding_box()['y']<300
    passed('adding a song on page two preserves URL/page/scroll and keeps the category exit visible')
    top.get_by_role('button',name='Next',exact=True).click();expect(top).to_contain_text('Page 3 of 3')
    mobile.go_back();expect(top).to_contain_text('Page 2 of 3')
    mobile.get_by_role('button',name='All categories',exact=True).click()
    expect(mobile.get_by_role('heading',name='Categories',exact=True)).to_be_visible()
    mobile.get_by_role('link',name='Settings',exact=True).click()
    appearance=mobile.locator('#appearance');appearance.scroll_into_view_if_needed()
    appearance.get_by_label('Serious',exact=True).check()
    mobile.go_back();expect(mobile.locator('[data-artwork-theme=serious]').first).to_be_visible()
    mobile.screenshot(path=str(OUT/'phone-serious.png'))
    passed('browser Back restores browsing state; artwork lives in account Appearance and remains selected')
    mobile.goto(BASE+'/songbook?roomId=1')
    mobile.get_by_role('button',name='Browse Pop',exact=True).click()
    expect(mobile.get_by_role('article').first.get_by_role('heading')).to_have_text('Zebra Encore')
    expect(mobile.get_by_role('navigation',name='Songbook pages top')).to_be_visible()
    assert mobile.get_by_role('article').first.bounding_box()['y']<470
    passed('full songbook shares compact category/results layout, recommendations and top pagination')
    mobile.get_by_role('button',name='Choose version of Zebra Encore',exact=True).click()
    picker=mobile.get_by_role('dialog');expect(picker.get_by_role('radio')).to_have_count(2)
    picker.get_by_role('radio').nth(1).check()
    assert picker.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    picker.get_by_role('button',name='Add selected version',exact=True).click()
    expect(picker).not_to_be_visible()
    for _ in range(40):
        if query(None,'SELECT selectedMediaId FROM queue WHERE songId=1 AND selectedMediaId=2'):break
        mobile.wait_for_timeout(100)
    assert query(None,'SELECT selectedMediaId FROM queue WHERE songId=1 AND selectedMediaId=2')
    mobile.reload()
    expect(mobile.get_by_role('article').first.get_by_role('button',name='Add Zebra Encore to queue',exact=True)).to_be_disabled()
    passed('phone version picker queues the exact selected backing track and retains it after reload')
    # Close any player before resetting only this marked fixture's queue.
    with sqlite3.connect(fixture['database']) as db: db.execute('DELETE FROM queue')
    host.goto(BASE+'/library?roomId=1')
    find_and_add(host,'Synthetic CBR ending');find_and_add(host,'Synthetic VBR ending');find_and_add(host,'Alpha Song 001')
    player=desktop.new_page();player.on('pageerror',lambda error:errors.append(str(error)));player.goto(BASE+'/player')
    player.get_by_role('button',name='Play',exact=True).first.click()
    player.wait_for_function('document.querySelector("audio")?.currentTime>.3')
    cbr=next(s for s in fixture['songs'] if s['title']=='Synthetic CBR ending')['songId']
    vbr=next(s for s in fixture['songs'] if s['title']=='Synthetic VBR ending')['songId']
    for _ in range(50):
        if query(None,'SELECT q.songId FROM queue q WHERE completedAt IS NOT NULL AND songId=?',(cbr,)):break
        player.wait_for_timeout(100)
    assert query(None,'SELECT completedAt FROM queue WHERE songId=?',(cbr,))[0][0]
    player.wait_for_function('document.querySelector("audio")?.currentTime>.25 && document.querySelector("audio")?.currentTime<2')
    player.get_by_role('button',name='Pause',exact=True).first.click()
    player.wait_for_timeout(2600)
    assert query(None,'SELECT completedAt FROM queue WHERE songId=?',(vbr,))[0][0] is None
    player.get_by_role('button',name='Play',exact=True).first.click()
    player.wait_for_function('document.querySelector("video")?.currentTime>.2')
    for _ in range(40):
        if query(None,'SELECT completedAt FROM queue WHERE songId=?',(vbr,))[0][0]:break
        host.wait_for_timeout(100)
    assert query(None,'SELECT completedAt FROM queue WHERE songId=?',(vbr,))[0][0]
    passed('real CBR/VBR MP3+G fixtures advance despite incorrect imported durations; pausing does not advance')
    # Drop the event deliberately; native ended-flag polling must still advance once.
    player.locator('video').evaluate('(v)=>{v.addEventListener("ended",e=>e.stopImmediatePropagation(),{capture:true});v.currentTime=v.duration-.15}')
    player.wait_for_function('!document.querySelector("video")')
    for _ in range(40):
        if query(None,'SELECT COUNT(*) FROM queue WHERE completedAt IS NOT NULL')[0][0]==3:break
        host.wait_for_timeout(100)
    assert query(None,'SELECT COUNT(*) FROM queue WHERE completedAt IS NOT NULL')[0][0]==3
    assert query(None,'SELECT SUM(plays) FROM songPlayCounts')[0][0]==3
    passed('missed ended event recovers once; completed-play counts are deduplicated')
    host.goto(BASE+'/queue')
    history=host.locator('details').filter(has=host.locator('summary').filter(has_text='History'))
    expect(history).to_have_count(1);history.locator('summary').click()
    expect(history.get_by_role('article')).to_have_count(3)
    original_ids=[row[0] for row in query(None,'SELECT queueId FROM queue')]
    video_history=history.get_by_role('article').filter(has=host.get_by_role('heading',name='Alpha Song 001',exact=True))
    video_history.get_by_role('button',name='Add again',exact=True).click()
    player.wait_for_function('document.querySelector("video")?.currentTime>.2')
    assert len(query(None,'SELECT queueId FROM queue'))==4
    assert len(query(None,'SELECT queueId FROM queue WHERE playedAt IS NOT NULL'))==3
    passed('history is separate and Add again creates one fresh turn without rewinding earlier entries')
    find_and_add_page=desktop.new_page();find_and_add_page.goto(BASE+'/library?roomId=1');future=find_and_add(find_and_add_page,'Alpha Song 002')
    host.on('dialog',lambda dialog:dialog.accept())
    video_history.get_by_role('button',name='Play now',exact=True).click()
    for _ in range(40):
        if query(None,'SELECT MAX(queueId) FROM queue')[0][0]>future:break
        host.wait_for_timeout(100)
    new_id=query(None,'SELECT MAX(queueId) FROM queue')[0][0];assert new_id>future
    assert query(None,'SELECT playedAt FROM queue WHERE queueId=?',(future,))[0][0] is None
    expect(host.locator('section[aria-label="Now playing"] article')).to_have_attribute('data-queue-id',str(new_id))
    player.locator('video').evaluate('(v)=>v.currentTime=v.duration-.15')
    for _ in range(40):
        if query(None,'SELECT selectedMediaId FROM queue WHERE queueId=?',(future,))[0][0]:break
        host.wait_for_timeout(100)
    assert query(None,'SELECT selectedMediaId FROM queue WHERE queueId=?',(future,))[0][0]
    assert all(query(None,'SELECT playedAt FROM queue WHERE queueId=?',(id,))[0][0] for id in original_ids)
    passed('Play now creates a fresh exact-version entry, preserves history and continues to unplayed songs')
    guest=browser.new_context(viewport={'width':390,'height':844});singer=guest.new_page();login(singer,'singer');singer.goto(BASE+'/queue')
    singer.locator('details summary').click()
    expect(singer.get_by_role('button',name='Play now',exact=True)).to_have_count(0)
    expect(singer.get_by_role('button',name='Clear history',exact=True)).to_have_count(0)
    passed('phone queue shows distinct current/upcoming/history and keeps host actions unavailable to singers')
    history_count=query(None,'SELECT COUNT(*) FROM queue WHERE playedAt IS NOT NULL')[0][0]
    player.close()
    host.reload()
    history=host.locator('details').filter(has=host.locator('summary').filter(has_text='History'))
    expect(history.locator('summary')).to_contain_text(str(history_count))
    player=desktop.new_page();player.on('pageerror',lambda error:errors.append(str(error)));player.goto(BASE+'/player')
    player.get_by_role('button',name='Play',exact=True).first.click()
    player.wait_for_function('document.querySelector("video")?.currentTime>.2')
    expect(host.locator('section[aria-label="Now playing"] article')).to_have_attribute('data-queue-id',str(future))
    assert query(None,'SELECT COUNT(*) FROM queue WHERE playedAt IS NOT NULL')[0][0]==history_count
    passed('room history survives player disconnect and page reload; a new player resumes unplayed work')
    find_and_add(find_and_add_page,'Alpha Song 003')
    expect(host.locator('section[aria-label="Up next"] article')).to_have_count(1)
    host.locator('main').evaluate('(e)=>e.scrollTop=0')
    host.screenshot(path=str(OUT/'desktop-queue.png'))
    singer.reload();expect(singer.locator('section[aria-label="Up next"] article')).to_have_count(1)
    singer.screenshot(path=str(OUT/'phone-queue.png'))
    mobile.goto(BASE+'/queue')
    expect(mobile.locator('section[aria-label="Now playing"]').get_by_role('button',name='Pause',exact=True)).to_be_visible()
    expect(mobile.locator('section[aria-label="Now playing"]').get_by_role('button',name='Next song',exact=True)).to_be_visible()
    expect(mobile.get_by_role('button',name='Remove',exact=True)).to_be_visible()
    mobile.screenshot(path=str(OUT/'phone-host-queue.png'))
    passed('phone host has visible Pause, Next song and Remove controls without hidden gestures')
    count=query(None,'SELECT SUM(plays) FROM songPlayCounts')[0][0]
    host.get_by_role('button',name='Clear upcoming',exact=True).click()
    expect(host.locator('section[aria-label="Up next"] article')).to_have_count(0)
    expect(host.locator('section[aria-label="Now playing"] article')).to_have_attribute('data-queue-id',str(future))
    history.locator('summary').click()
    host.get_by_role('button',name='Clear history',exact=True).click()
    expect(history.get_by_role('article')).to_have_count(0)
    expect(host.locator('section[aria-label="Now playing"] article')).to_have_attribute('data-queue-id',str(future))
    assert query(None,'SELECT SUM(plays) FROM songPlayCounts')[0][0]==count
    assert len(query(None,'SELECT queueId FROM queue'))==1
    passed('host can clear upcoming/history independently without stopping the current song or losing popularity counts')
    assert errors==[],errors
    passed('all browser flows finish without JavaScript errors')
    browser.close()
OUT.joinpath('checks.json').write_text(json.dumps({'checks':checks,'errors':errors,'checkedAt':datetime.now(timezone.utc).isoformat()},indent=2),encoding='utf-8')
