// feat 571 — the plan editor was glitchy: the exercise search in the step picker typed backwards (each keystroke
// redrew the field with the caret at the start), any redraw of the page (a sync, a save) threw you back to the plan
// list and dropped what you were typing, and a sync could replace a newer draft with the cloud's older copy.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openPlanFull === 'function' && typeof planNewer === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  await page.evaluate(() => {
    state.plans = (state.plans || []).filter(p => p.id !== 'pe1');
    state.plans.push({ id: 'pe1', name: 'Edit me', desc: '', createdAt: '2026-01-01T00:00:00.000Z', steps: [{ id: 's1', sets: 3, options: [] }] });
    saveState(); openPlanFull('pe1');
  });
  await page.waitForSelector('#plan-name-input');
});

test('feat 571 — the exercise search in the step picker types forwards', async ({ page }) => {
  await page.click('[data-add-opt="0"]');
  await page.waitForSelector('#optpick-search');
  await page.locator('#optpick-search').pressSequentially('bench', { delay: 30 });
  expect(await page.inputValue('#optpick-search')).toBe('bench');
  expect(await page.locator('#optpick-list .optpick-fam').count()).toBeGreaterThan(0);
});

test('feat 571 — a redraw (as after a sync) keeps you in the editor, in the same field, with what you typed', async ({ page }) => {
  await page.click('#plan-name-input');
  await page.locator('#plan-name-input').pressSequentially(' v2', { delay: 20 });
  await page.evaluate(() => render());                         // what a cloud pull or a save does
  const r = await page.evaluate(() => ({
    editor: !!document.getElementById('plan-name-input'), value: document.getElementById('plan-name-input') && document.getElementById('plan-name-input').value,
    focused: document.activeElement && document.activeElement.id, caret: document.activeElement && document.activeElement.selectionStart,
    model: getPlan('pe1').name, stamped: !!getPlan('pe1').draftAt,
  }));
  expect(r.editor).toBe(true);                                 // not thrown back to the list
  expect(r.value).toBe('Edit me v2');
  expect(r.focused).toBe('plan-name-input');
  expect(r.caret).toBe('Edit me v2'.length);
  expect(r.model).toBe('Edit me v2');                          // saved as typed, not only on leaving the field
  expect(r.stamped).toBe(true);
  await page.locator('#plan-name-input').pressSequentially('!', { delay: 20 });
  expect(await page.inputValue('#plan-name-input')).toBe('Edit me v2!');
});

test('feat 571 — navigating to Plans still opens the list; the step note survives a redraw too', async ({ page }) => {
  await page.click('[data-step-desc="0"]');
  await page.locator('[data-step-desc="0"]').pressSequentially('slow', { delay: 20 });
  await page.evaluate(() => render());
  expect(await page.inputValue('[data-step-desc="0"]')).toBe('slow');
  expect(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-step-desc'))).toBe('0');
  await page.evaluate(() => { navTo('home'); navTo('plan-creator'); });
  expect(await page.evaluate(() => !!document.getElementById('plan-name-input'))).toBe(false);   // a real entry → the list
});

test('feat 571 — sync keeps the newer draft at the same revision', async ({ page }) => {
  const r = await page.evaluate(() => {
    const base = { id: 'x', rev: 2, revisions: [{ rev: 2, at: '2026-05-01T10:00:00.000Z' }] };
    const mine = { ...base, name: 'mine', draftAt: '2026-05-02T09:00:00.000Z' };
    const cloud = { ...base, name: 'cloud' };
    const cloudNewer = { ...base, name: 'cloud2', draftAt: '2026-05-03T09:00:00.000Z' };
    return { cloudOverMine: planNewer(cloud, mine), newerCloudOverMine: planNewer(cloudNewer, mine), higherRev: planNewer({ ...cloud, rev: 3 }, mine), same: planNewer(cloud, { ...cloud }) };
  });
  expect(r.cloudOverMine).toBe(false);       // my newer draft is kept
  expect(r.newerCloudOverMine).toBe(true);
  expect(r.higherRev).toBe(true);            // a committed revision still wins
  expect(r.same).toBe(true);
});
