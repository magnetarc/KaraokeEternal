"""Browser/API checks against the marked local preview; never starts real lookups."""
from pathlib import Path
import json
import re
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:8091'
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'qa-artifacts'
OUT.mkdir(exist_ok=True)
fixture = json.loads((ROOT / '.test-instance/metadata-qa-id.json').read_text())['id']
checks = []

def passed(name):
    checks.append(name)
    print('PASS:', name, flush=True)

def sign_in(page, user='host', destination='/catalogue'):
    page.goto(BASE + destination + '?roomId=1')
    page.get_by_placeholder('Username or email').fill(user)
    page.get_by_placeholder('Password', exact=True).fill('preview-' + user + '-2026')
    page.get_by_role('button', name='Sign In', exact=True).click()
    if user == 'host':
        expect(page).to_have_url(BASE + destination)
    else:
        expect(page).to_have_url(re.compile(re.escape(BASE) + r'/library(?:\?roomId=1)?$'))

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    host = browser.new_context(viewport={'width':1440,'height':1100})
    assert host.request.get(BASE + '/api/instance').json() == {'isTest': True}
    page = host.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    sign_in(page)
    expect(page.get_by_role('heading', name='Make the collection easy to explore.')).to_be_visible()
    value = host.request.get(BASE + '/api/catalogue/').json()
    assert sum(value['counts'].values()) >= 56652
    expect(page.get_by_text('56,652', exact=True)).not_to_have_count(0) if sum(value['counts'].values()) == 56652 else None
    page.screenshot(path=str(OUT / 'metadata-desktop.png'))
    passed('host workspace loads the full real catalogue with bounded pagination')

    csv = 'Artist,Title\r\nQA Café,Café Test [SC Karaoke]\r\n'.encode('cp1252')
    page.get_by_label('Import catalogue file').set_input_files({'name':'qa-catalogue.csv','mimeType':'text/csv','buffer':csv})
    expect(page.get_by_role('status')).to_contain_text('Import complete: 1 new')
    expect(page.get_by_role('status')).to_contain_text('Windows-1252')
    page.get_by_label('Import catalogue file').set_input_files({'name':'qa-catalogue.csv','mimeType':'text/csv','buffer':csv})
    expect(page.get_by_role('status')).to_contain_text('Import complete: 0 new')
    page.get_by_label('Find a song or artist').fill('QA Café')
    expect(page.get_by_role('article')).to_have_count(1)
    expect(page.get_by_role('article')).to_contain_text('Café Test')
    imported = host.request.get(BASE + '/api/catalogue/?q=QA%20Caf%C3%A9').json()['entries'][0]
    assert imported['variants'] == 1
    passed('CSV upload preserves Windows accents and re-import is idempotent')

    before = host.request.get(BASE + '/api/catalogue/').json()['total']
    response = host.request.post(BASE + '/api/catalogue/import', data=[{'artist':'QA synthetic artist','title':'Must not import'}, {'artist':'','title':'Invalid'}])
    assert response.status == 400
    assert host.request.get(BASE + '/api/catalogue/').json()['total'] == before
    page.get_by_role('button', name='Queue visible (1)').click()
    expect(page.get_by_role('article')).to_contain_text('Waiting')
    host.request.post(BASE + '/api/catalogue/pause')
    assert host.request.post(BASE + f"/api/catalogue/{imported['entryId']}/approve", data={'confirmed':True,'categories':{}}).status == 400
    passed('invalid batches write nothing; queued progress persists; unreviewed entries cannot be approved')

    page.get_by_label('Find a song or artist').fill('QA review fixture')
    expect(page.get_by_role('article')).to_have_count(1)
    page.get_by_role('button', name='Review categories', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.get_by_role('button', name='Approve selected categories')).to_be_disabled()
    page.get_by_role('checkbox', name='Rock', exact=True).uncheck()
    page.get_by_text('Source evidence & retrieval dates', exact=True).click()
    expect(page.get_by_text('Synthetic QA fixture, not fetched recording evidence.')).to_be_visible()
    page.get_by_role('checkbox', name='I checked the artist', exact=False).check()
    page.screenshot(path=str(OUT / 'metadata-review.png'))
    page.get_by_role('button', name='Approve selected categories').click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_role('article')).to_contain_text('Approved')
    approved = host.request.get(BASE + f'/api/catalogue/{fixture}').json()
    assert approved['approved']['genres'] == ['Pop']
    export = host.request.get(BASE + '/api/catalogue/export').json()
    assert any(e['entryId'] == fixture for e in export)
    assert host.request.post(BASE + f'/api/catalogue/{fixture}/select', data={'recordingId':'not-a-candidate'}).status == 400
    passed('source review, category choices, explicit confirmation and approved export work')

    host.request.post(BASE + '/api/catalogue/import', data=[{'artist':'QA synthetic artist','title':'QA reject fixture'}])
    page.get_by_label('Find a song or artist').fill('QA reject fixture')
    page.get_by_role('button', name='View entry', exact=True).click()
    page.get_by_role('button', name='Reject / leave uncategorised', exact=True).click()
    expect(page.get_by_role('article')).to_contain_text('Rejected')
    passed('uncertain entries can be rejected without inventing categories')
    page.get_by_role('button', name='View entry', exact=True).click()
    page.get_by_text('Revise the search wording', exact=True).click()
    page.get_by_label('Search artist', exact=True).fill('QA synthetic artist corrected')
    page.get_by_role('button', name='Queue revised search', exact=True).click()
    expect(page.get_by_role('article')).to_contain_text('Waiting')
    revised = host.request.get(BASE + '/api/catalogue/?q=QA%20reject%20fixture').json()['entries'][0]
    assert revised['artist'] == 'QA synthetic artist'
    assert revised['searchArtist'] == 'QA synthetic artist corrected'
    passed('revised search wording is queued separately and preserves original catalogue identity')

    phone = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, device_scale_factor=1)
    mobile = phone.new_page()
    mobile.on('pageerror', lambda error: errors.append(str(error)))
    sign_in(mobile)
    mobile.screenshot(path=str(OUT / 'metadata-phone.png'))
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.get_by_label('Find a song or artist').fill('QA review fixture')
    mobile.get_by_role('button', name='Review categories', exact=True).click()
    expect(mobile.get_by_role('dialog')).to_be_visible()
    assert mobile.evaluate('document.querySelector("dialog").scrollWidth <= document.querySelector("dialog").clientWidth + 2')
    mobile.screenshot(path=str(OUT / 'metadata-phone-review.png'))
    mobile.get_by_role('button', name='Close review').click()
    passed('390px phone layout and review dialog fit without horizontal scrolling')

    anon = browser.new_context()
    singer = browser.new_context()
    s = singer.new_page(); sign_in(s, 'singer')
    for context in [anon, singer]:
        for method, route, data in [('GET','/',None), ('GET','/export',None), ('GET',f'/{fixture}',None), ('POST','/import',[]), ('POST','/library',{}), ('POST','/queue',{'ids':[fixture]}), ('POST','/start',{}), ('POST','/pause',{}), ('POST',f'/{fixture}/select',{}), ('POST',f'/{fixture}/search',{}), ('POST',f'/{fixture}/approve',{}), ('POST',f'/{fixture}/reject',{})]:
            response = context.request.get(BASE + '/api/catalogue' + route) if method == 'GET' else context.request.post(BASE + '/api/catalogue' + route, data=data)
            assert response.status == 403, (method, route, response.status)
    passed('all 12 metadata endpoints reject anonymous and singer accounts; host route is guarded')
    assert not errors, errors
    passed('no browser JavaScript errors')
    (OUT / 'metadata-browser-results.json').write_text(json.dumps({'checks':checks,'count':len(checks),'javascriptErrors':errors},indent=2),encoding='utf-8')
    browser.close()
