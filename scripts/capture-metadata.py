"""Capture the clean local catalogue and real, unapproved pilot evidence."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright, expect
BASE = 'http://127.0.0.1:8091'
OUT = Path(__file__).resolve().parents[1] / 'qa-artifacts'

def login(page):
    page.goto(BASE + '/catalogue?roomId=1')
    page.get_by_placeholder('Username or email').fill('host')
    page.get_by_placeholder('Password', exact=True).fill('preview-host-2026')
    page.get_by_role('button', name='Sign In', exact=True).click()
    expect(page).to_have_url(BASE + '/catalogue')

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', headless=True)
    desktop = b.new_context(viewport={'width':1440,'height':1100})
    assert desktop.request.get(BASE + '/api/instance').json() == {'isTest':True}
    listing = desktop.request.get(BASE + '/api/catalogue/').status
    assert listing == 403  # no catalogue access before sign-in
    page = desktop.new_page(); login(page)
    value = desktop.request.get(BASE + '/api/catalogue/').json()
    assert sum(value['counts'].values()) == 56652
    assert value['counts'].get('approved',0) == 0
    expect(page.get_by_text('56,652', exact=True)).to_be_visible()
    page.screenshot(path=str(OUT / 'catalogue-desktop.png'))
    page.get_by_label('Find a song or artist').fill('Bohemian Rhapsody')
    row = page.get_by_role('article').filter(has_text=re.compile(r'Queen'))
    row.get_by_role('button', name='Review categories', exact=True).click()
    dialog = page.get_by_role('dialog')
    expect(dialog.get_by_role('heading', name='Proposed categories', exact=True)).to_have_count(1)
    dialog.get_by_role('heading', name='Proposed categories', exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'catalogue-real-review.png'))
    dialog.get_by_text('Source evidence & retrieval dates', exact=True).click()
    dialog.get_by_text('Source evidence & retrieval dates', exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'catalogue-evidence.png'))
    dialog.get_by_role('button', name='Close review').click()
    phone = b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile = phone.new_page(); login(mobile)
    mobile.get_by_label('Find a song or artist').fill('Bohemian Rhapsody')
    mobile.get_by_label('Find a song or artist').evaluate("e => e.scrollIntoView({block:'center'})")
    mobile.screenshot(path=str(OUT / 'catalogue-phone.png'))
    mobile.get_by_role('article').filter(has_text='Queen').get_by_role('button', name='Review categories', exact=True).click()
    mobile.get_by_role('group', name='Genres', exact=True).evaluate("e => e.scrollIntoView({block:'start'})")
    mobile.screenshot(path=str(OUT / 'catalogue-phone-review.png'))
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert mobile.evaluate('document.querySelector("dialog").scrollWidth <= document.querySelector("dialog").clientWidth + 2')
    b.close()
    print('Captured five clean catalogue views; no categories approved.')
