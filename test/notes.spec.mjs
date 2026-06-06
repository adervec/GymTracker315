// feat 122 — session notes: the Location field suggests your saved gyms (datalist), and the Injuries
// field autocompletes common lifting niggles as you type (multi-value, comma-separated).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.openNotesModal === 'function' && typeof window.renderInjurySuggest === 'function', null, { timeout: 15000 });
});

test('Location suggests saved gyms via a datalist', async ({ page }) => {
  const opts = await page.evaluate(() => {
    state.readonly = false;
    state.gyms = [{ id: 'g1', name: 'GoodLife Yonge' }, { id: 'g2', name: 'Home Gym' }];
    const date = new Date().toISOString();
    state.sessions = [{ id: 's', date, exercises: [] }];
    openNotesModal(date);
    return [...document.querySelectorAll('#trk-gym-datalist option')].map(o => o.value);
  });
  expect(opts).toContain('GoodLife Yonge');
  expect(opts).toContain('Home Gym');
});

test('Injuries autocompletes common niggles and appends on click (keeping prior entries)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false; state.gyms = [];
    const date = new Date().toISOString();
    state.sessions = [{ id: 's', date, exercises: [] }];
    openNotesModal(date);
    const inj = document.getElementById('trk-notes-injuries');
    const box = document.getElementById('trk-notes-injury-suggest');

    inj.value = 'shoulder'; renderInjurySuggest();
    const chips1 = [...box.querySelectorAll('.injury-chip')].map(c => c.textContent);
    const first = box.querySelector('.injury-chip'); const firstText = first.textContent; first.click();
    const afterClick = inj.value;

    inj.value = 'knee pain, shoul'; renderInjurySuggest();
    const chips2 = [...box.querySelectorAll('.injury-chip')].map(c => c.textContent);
    return { chips1, firstText, afterClick, chips2 };
  });
  expect(r.chips1.length).toBeGreaterThan(0);
  expect(r.chips1.join(' ').toLowerCase()).toContain('shoulder');
  expect(r.afterClick).toBe(r.firstText + ', ');              // appended + comma, ready for the next
  expect(r.chips2.join(' ').toLowerCase()).toContain('shoulder'); // suggests for the new token, keeping "knee pain, "
});

test('no suggestions for an empty token', async ({ page }) => {
  const n = await page.evaluate(() => {
    state.readonly = false; state.gyms = [];
    const date = new Date().toISOString();
    state.sessions = [{ id: 's', date, exercises: [] }];
    openNotesModal(date);
    const inj = document.getElementById('trk-notes-injuries');
    inj.value = 'knee pain, '; renderInjurySuggest(); // token after comma is empty
    return document.querySelectorAll('#trk-notes-injury-suggest .injury-chip').length;
  });
  expect(n).toBe(0);
});
