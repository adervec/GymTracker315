// Volume "Split" view — sets per training split (mega category: push / pull / lower / …) for the week,
// with a push:pull / upper:lower balance read.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.getWeeklySplitVolume === 'function' && typeof window.renderVolumeSplit === 'function' && typeof window.renderVolume === 'function', null, { timeout: 15000 });
});

async function seedThisWeek(page) {
  return await page.evaluate(() => {
    let push = null, pull = null;
    for (const [u, info] of VAR_INDEX) {
      if (info.family.mega === 'push' && !push) push = u;
      else if (info.family.mega === 'pull' && !pull) pull = u;
      if (push && pull) break;
    }
    state.sessions = [{ id: 'w', date: new Date().toISOString(), exercises: [
      { varUuid: push, sets: [{ w: 1, r: 1 }, { w: 1, r: 1 }] }, // 2 push sets
      { varUuid: pull, sets: [{ w: 1, r: 1 }] },                  // 1 pull set
    ] }];
    return { push, pull };
  });
}

test('getWeeklySplitVolume counts strength sets per mega for the week', async ({ page }) => {
  await seedThisWeek(page);
  const vol = await page.evaluate(() => getWeeklySplitVolume(0));
  expect(vol.push).toBe(2);
  expect(vol.pull).toBe(1);
});

test('renderVolumeSplit shows the split bars + balance read', async ({ page }) => {
  await seedThisWeek(page);
  const html = await page.evaluate(() => { volWeekOffset = 0; return renderVolumeSplit(new Date(startOfWeek(new Date()))); });
  expect(html).toContain('Sets per split');
  expect(html).toContain('Push');
  expect(html).toContain('Pull');
  expect(html).toContain('Push : Pull'); // balance insight
});

test('the Volume tab exposes a Split sub-tab that renders the split view', async ({ page }) => {
  await seedThisWeek(page);
  const r = await page.evaluate(() => {
    volLevel = 'split'; volWeekOffset = 0;
    const div = document.createElement('div'); document.body.appendChild(div);
    renderVolume(div);
    const tab = div.querySelector('[data-vollevel="split"]');
    return { hasTab: !!tab, active: tab.classList.contains('active'), rendered: div.innerHTML.includes('Sets per split') };
  });
  expect(r.hasTab).toBe(true);
  expect(r.active).toBe(true);
  expect(r.rendered).toBe(true);
});
