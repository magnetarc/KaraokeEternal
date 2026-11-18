"""Full real-catalogue UI checks on the isolated preview; no external lookups."""
from pathlib import Path
import json
from time import perf_counter
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:8091'
OUT=Path(__file__).resolve().parents[1]/'qa-artifacts'
OUT.mkdir(exist_ok=True)
checks=[]; timings={}
def passed(name):
    checks.append(name); print('PASS:',name,flush=True)
def login(page,user='host'):
    page.goto(BASE+'/songbook?roomId=1')
    page.get_by_placeholder('Username or email').fill(user)
    page.get_by_placeholder('Password',exact=True).fill('preview-'+user+'-2026')
    page.get_by_role('button',name='Sign In',exact=True).click()
    expect(page).to_have_url(BASE+'/songbook')
    expect(page.get_by_role('heading',name='Explore the songbook')).to_be_visible()
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    host=browser.new_context(viewport={'width':1440,'height':1100})
    page=host.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    anonymous=browser.new_context()
    assert anonymous.request.get(BASE+'/api/songbook/').status==403
    login(page)
    start=perf_counter(); initial=host.request.get(BASE+'/api/songbook/').json(); timings['defaultSeconds']=round(perf_counter()-start,3)
    assert initial['stats']['total']==56652 and initial['stats']['available']==0
    assert len(initial['entries'])==40 and initial['total']==56652
    assert not any(e['available'] for e in initial['entries'])
    expect(page.locator('[aria-busy=false] article').first).to_be_visible()
    page.screenshot(path=str(OUT/'songbook-desktop.png'))
    passed('all 56,652 entries are indexed and unscanned media cannot be queued')
    search=page.get_by_role('searchbox',name='Search full songbook')
    search.fill('perfect')
    expect(page.get_by_role('heading',name='Your matches')).to_be_visible()
    expect(page.locator('[aria-busy=false] article').first).to_be_visible()
    start=perf_counter(); response=host.request.get(BASE+'/api/songbook/?q=perfect').json(); timings['perfectSeconds']=round(perf_counter()-start,3)
    ed=next(e for e in response['entries'] if e['artist'].casefold()=='ed sheeran' and e['title'].casefold()=='perfect')
    original_featured=ed['featured']
    try:
        assert host.request.post(BASE+f"/api/songbook/{ed['entryId']}/feature",data={'featured':True}).ok
        ranked=host.request.get(BASE+'/api/songbook/?q=perfect').json()['entries']
        assert ranked[0]['entryId']==ed['entryId']
    finally:
        host.request.post(BASE+f"/api/songbook/{ed['entryId']}/feature",data={'featured':original_featured})
    assert all(e['title'].casefold()=='perfect' for e in ranked[:sum(e['title'].casefold()=='perfect' for e in ranked)])
    passed('Perfect returns exact titles first and the host can put Ed Sheeran first')
    search.fill('ed sheeran perfect')
    article=page.get_by_role('article',name='Perfect by Ed Sheeran',exact=True)
    expect(article).to_be_visible()
    expect(article.get_by_role('button',name='Media not scanned',exact=True)).to_be_disabled()
    assert host.request.post(BASE+f"/api/songbook/{ed['entryId']}/star",data={'starred':False}).ok
    page.reload(); page.get_by_role('searchbox',name='Search full songbook').fill('ed sheeran perfect')
    expect(article.get_by_role('button',name='Favourite Perfect',exact=True)).to_be_visible()
    article.get_by_role('button',name='Favourite Perfect',exact=True).click()
    expect(article.get_by_role('button',name='Unfavourite Perfect',exact=True)).to_be_visible()
    assert host.request.get(BASE+'/api/songbook/?favourites=1').json()['entries'][0]['entryId']==ed['entryId']
    singer=browser.new_context(viewport={'width':390,'height':844})
    mobile=singer.new_page(); mobile.on('pageerror',lambda e:errors.append(str(e)))
    login(mobile,'singer')
    assert singer.request.get(BASE+'/api/songbook/?favourites=1').json()['total']==0
    assert singer.request.post(BASE+f"/api/songbook/{ed['entryId']}/feature",data={'featured':True}).status==403
    assert singer.request.get(BASE+'/api/catalogue/').status==403
    passed('favourites persist privately and singers cannot change host metadata or promotions')
    options=host.request.get(BASE+'/api/songbook/options').json()
    assert options['genre']
    assert options['language']==[] and options['decade']==[] and options['performance']==[]
    mobile.get_by_role('button',name='Browse categories').click()
    mobile.get_by_label('Style',exact=True).select_option('Rock')
    expect(mobile.locator('[aria-busy=false] article').first).to_be_visible()
    for e in singer.request.get(BASE+'/api/songbook/?genre=Rock').json()['entries']:
        assert 'Rock' in [e['categories']['genre']]+e['categories'].get('genres',[])
    mobile.screenshot(path=str(OUT/'songbook-phone-categories.png'))
    assert mobile.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
    mobile.get_by_role('button',name='All songs',exact=False).click()
    mobile.get_by_role('searchbox',name='Search full songbook').fill('perfect')
    expect(mobile.locator('[aria-busy=false] article').first).to_be_visible()
    mobile.screenshot(path=str(OUT/'songbook-phone-search.png'))
    assert mobile.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
    passed('390px phone search and categories fit, with model-only factual fields withheld')
    mobile.get_by_role('button',name='Ready to sing',exact=False).click()
    expect(mobile.get_by_role('heading',name='No songs found')).to_be_visible()
    mobile.get_by_role('button',name='Clear filters',exact=True).last.click()
    expect(mobile.locator('[aria-busy=false] article')).to_have_count(40)
    mobile.get_by_role('button',name='Next →',exact=True).click()
    expect(mobile.get_by_text('Page 2 of 1,417',exact=True)).to_be_visible()
    expect(mobile.locator('[aria-busy=false] article')).to_have_count(40)
    passed('availability filter and server pagination cover the full songbook')
    host.request.post(BASE+'/api/catalogue/import',data=[{'artist':'QA synthetic artist','title':'QA manual songbook details','source':'Synthetic UI test only'}])
    fixture=host.request.get(BASE+'/api/catalogue/?q=QA%20manual%20songbook').json()['entries'][0]['entryId']
    assert singer.request.post(BASE+f'/api/songbook/{fixture}/categories',data={'confirmed':True,'categories':{}}).status==403
    assert host.request.post(BASE+f'/api/songbook/{fixture}/categories',data={'confirmed':False,'categories':{}}).status==400
    page.get_by_role('searchbox',name='Search full songbook').fill('QA manual songbook details')
    page.get_by_role('article',name='QA manual songbook details by QA synthetic artist',exact=True).get_by_role('button',name='Edit song details',exact=True).click()
    dialog=page.get_by_role('dialog')
    expect(dialog.get_by_role('button',name='Save categories',exact=True)).to_be_disabled()
    dialog.get_by_label('Styles (separate with commas)',exact=True).fill('Jazz/Swing')
    dialog.get_by_label('Lyric language',exact=True).fill('English')
    dialog.get_by_label('First release decade (e.g. 1980s)',exact=True).fill('2000s')
    dialog.get_by_label('Voices',exact=True).select_option('Duet')
    dialog.get_by_role('checkbox').check()
    page.set_viewport_size({'width':390,'height':844})
    assert dialog.evaluate('(e)=>e.scrollWidth<=e.clientWidth+2')
    page.screenshot(path=str(OUT/'songbook-phone-host-editor.png'))
    dialog.get_by_role('button',name='Save categories',exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(page.get_by_role('article')).to_contain_text('Host categories')
    reviewed=host.request.get(BASE+'/api/songbook/?q=QA%20manual%20songbook').json()['entries'][0]
    assert reviewed['categorySource']=='reviewed' and reviewed['categories']['decade']=='2000s'
    assert reviewed['categories']['performance']=='Duet'
    passed('host categories require confirmation, persist, and have a usable phone editor')
    host.request.post(BASE+f"/api/songbook/{ed['entryId']}/star",data={'starred':False})
    assert not errors,errors
    passed('desktop and phone complete without JavaScript errors')
    (OUT/'songbook-checks.json').write_text(json.dumps({'checks':checks,'timings':timings},indent=2),encoding='utf-8')
    browser.close()
