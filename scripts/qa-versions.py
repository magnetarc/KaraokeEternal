"""Only the marked synthetic loopback version fixture. No real accounts or NAS writes."""
from pathlib import Path
from datetime import datetime, timezone
import json, re, sqlite3
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'qa-artifacts/versions'
fixture=json.loads((OUT/'fixture.json').read_text(encoding='utf-8'))
BASE=fixture['url']
assert BASE=='http://127.0.0.1:18071'
song=fixture['songs'][0]; song_id=song['songId']; selected_id=song['mediaIds'][1]
checks=[]; errors=[]
def passed(text): checks.append(text); print('PASS:',text,flush=True)
def login(page,user):
    page.goto(BASE+'/library?roomId=1')
    page.get_by_placeholder('Username or email').fill(user)
    page.get_by_placeholder('Password',exact=True).fill('preview-'+user+'-2026')
    page.get_by_role('button',name='Sign In',exact=True).click()
    expect(page.get_by_role('heading',name=re.compile('Find your next'))).to_be_visible()
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True,args=['--autoplay-policy=no-user-gesture-required'])
    host=browser.new_context(viewport={'width':1440,'height':1000})
    assert host.request.get(BASE+'/api/instance').json()=={'isTest':True}
    assert Path(fixture['database']).resolve().is_relative_to((ROOT/'.test-instance').resolve())
    with sqlite3.connect(fixture['database']) as db:
        assert db.execute("SELECT data FROM prefs WHERE key='modernTestInstance'").fetchone()[0]=='true'
        db.execute('DELETE FROM queue')
    page=host.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
    login(page,'host')
    expect(page.get_by_role('article')).to_have_count(3)
    expect(page.get_by_role('button',name='Choose version of After the Applause',exact=True)).to_have_count(1)
    expect(page.get_by_role('button',name='Choose version of After the Applause',exact=True)).to_have_text('Versions (3)')
    expect(page.locator('header').filter(has=page.get_by_role('heading',name=re.compile('Find your next')))).to_contain_text('5 versions')
    passed('one result per artist/title, qualifier and other artist remain separate; song/version totals are distinct')
    page.get_by_role('button',name='Choose version of After the Applause',exact=True).click()
    dialog=page.get_by_role('dialog')
    expect(dialog.get_by_role('radio')).to_have_count(3)
    expect(dialog.get_by_text('Host choice',exact=True)).to_have_count(1)
    expect(dialog.get_by_role('radio').first).to_be_checked()
    assert dialog.locator('label').first.evaluate('(e)=>getComputedStyle(e).display')=='flex'
    dialog.get_by_role('radio').first.press('ArrowDown')
    expect(dialog.get_by_role('radio').nth(1)).to_be_checked()
    page.screenshot(path=str(OUT/'desktop-versions.png'))
    page.keyboard.press('Escape')
    expect(dialog).not_to_be_visible()
    expect(page.get_by_role('button',name='Choose version of After the Applause',exact=True)).to_be_focused()
    passed('desktop radio keyboard navigation, preferred badge, Escape and focus return')
    api=host.request.get(BASE+f'/api/song/{song_id}/versions')
    versions=api.json()['versions']; assert len(versions)==3
    assert all('path' not in v and 'relPath' not in v for v in versions)
    assert host.request.get(BASE+'/api/song/nope/versions').status==400
    assert host.request.get(BASE+'/api/song/99999/versions').status==404
    anon=browser.new_context(); assert anon.request.get(BASE+f'/api/song/{song_id}/versions').status==403; anon.close()
    passed('versions API returns sanitized playable metadata, validates IDs and rejects anonymous access')
    phone=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    singer=phone.new_page();singer.on('pageerror',lambda e:errors.append(str(e)))
    login(singer,'singer')
    assert phone.request.get(BASE+f'/api/song/{song_id}/versions').ok
    assert phone.request.get(BASE+f'/api/song/{song_id}').status==401
    singer.get_by_role('button',name='Choose version of After the Applause',exact=True).click()
    picker=singer.get_by_role('dialog')
    expect(picker.get_by_role('radio')).to_have_count(3)
    picker.get_by_role('radio').nth(1).check()
    assert picker.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    singer.screenshot(path=str(OUT/'phone-versions.png'))
    picker.get_by_role('button',name='Add selected version',exact=True).click()
    expect(picker).not_to_be_visible()
    row=singer.get_by_role('article',name='After the Applause by The Neon Hours',exact=True)
    expect(row.get_by_role('button',name='Add After the Applause to queue',exact=True)).to_be_disabled()
    expect(page.get_by_role('complementary',name='Queue preview')).to_contain_text('Demo studio B')
    singer.reload();expect(row.get_by_role('button',name='Add After the Applause to queue',exact=True)).to_be_disabled()
    with sqlite3.connect('file:'+str(fixture['database']).replace('\\','/')+'?mode=ro',uri=True) as db:
        assert db.execute('SELECT selectedMediaId FROM queue ORDER BY queueId DESC LIMIT 1').fetchone()[0]==selected_id
    passed('phone singer can choose/queue a specific version; selection persists in SQLite and across reload')
    singer.get_by_role('link',name='Queue',exact=True).click()
    expect(singer.get_by_text('Version: Demo studio B - After the Applause',exact=True)).to_be_visible()
    singer.screenshot(path=str(OUT/'phone-queue-version.png'))
    passed('chosen backing track is visible on the phone queue')
    player=host.new_page();player.on('pageerror',lambda e:errors.append(str(e)))
    player.goto(BASE+'/player')
    player.get_by_role('button',name='Play',exact=True).first.click()
    player.wait_for_function('document.querySelector("video")?.currentTime>1')
    src=player.locator('video').evaluate('(v)=>v.currentSrc')
    assert f'/media/{selected_id}?' in src,src
    player.get_by_role('button',name='Pause',exact=True).click()
    assert player.locator('video').evaluate('(v)=>v.paused')
    passed('the original player streams the explicitly selected media ID and still pauses correctly')
    player.close()
    # Verify the same picker is available from the staged full-songbook route.
    page.goto(BASE+'/songbook')
    expect(page.get_by_role('button',name='Choose version of After the Applause',exact=True)).to_be_visible()
    page.get_by_role('button',name='Choose version of After the Applause',exact=True).click()
    expect(page.get_by_role('dialog').get_by_role('radio')).to_have_count(3)
    expect(page.get_by_role('dialog').get_by_role('button',name='Add selected version',exact=True)).to_be_disabled()
    page.keyboard.press('Escape')
    passed('full songbook shares the picker and prevents adding an already queued song')
    assert not errors,errors
    passed('all interactions finish without browser JavaScript errors')
    browser.close()
(OUT/'checks.json').write_text(json.dumps({'checks':checks,'checkedAt':datetime.now(timezone.utc).isoformat(),'errors':errors},indent=2),encoding='utf-8')
