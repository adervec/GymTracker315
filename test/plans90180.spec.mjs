// feat 175 — fill the length distribution: seed plans that estimate to ~90 minutes and ~3 hours, so the
// picker's length spread isn't bunched at 30–60 min (it previously had nothing at the 90-min or 3-hour marks).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof estimatePlanMinutes === 'function' && typeof cloneSeedPlan === 'function', null, { timeout: 15000 });
});

test('there is now a healthy cluster of plans at the 90-minute and 3-hour marks', async ({ page }) => {
  const r = await page.evaluate(() => {
    const mins = SEED_PLANS.map(p => estimatePlanMinutes(cloneSeedPlan(p)));
    return { at90: mins.filter(m => m === 90).length, at180: mins.filter(m => m === 180).length, max: Math.max(...mins) };
  });
  expect(r.at90).toBeGreaterThanOrEqual(3);  // a real cluster at ~90 min
  expect(r.at180).toBeGreaterThanOrEqual(3); // a real cluster at ~3 hours
  expect(r.max).toBe(180);                   // 3 hours is the new top end
});

test('the new 90m / 3h plans exist, resolve, and fall in the picker length buckets', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = ['seed-fullbody-90', 'seed-upper-90', 'seed-lower-90', 'seed-pushpull-90', 'seed-fullbody-3h', 'seed-legs-3h', 'seed-upper-3h'];
    const out = {};
    ids.forEach(id => {
      const sp = SEED_PLANS.find(p => p.id === id);
      if (!sp) { out[id] = 'MISSING'; return; }
      const p = cloneSeedPlan(sp);
      const badOpt = (p.steps || []).some(st => (st.options || []).some(o => o.type === 'movement' && !FAMILIES.find(f => f.id === o.familyId)));
      out[id] = { min: estimatePlanMinutes(p), bucket: planLengthBucket(p), badOpt, hasDesc: !!sp.desc };
    });
    return out;
  });
  for (const id of ['seed-fullbody-90', 'seed-upper-90', 'seed-lower-90', 'seed-pushpull-90']) {
    expect(r[id], id).not.toBe('MISSING');
    expect(r[id].min, id).toBe(90);
    expect(r[id].badOpt, id).toBe(false);
    expect(r[id].hasDesc, id).toBe(true);
  }
  for (const id of ['seed-fullbody-3h', 'seed-legs-3h', 'seed-upper-3h']) {
    expect(r[id], id).not.toBe('MISSING');
    expect(r[id].min, id).toBe(180);
    expect(r[id].bucket, id).toBe('long'); // long-length bucket in the picker filter
    expect(r[id].badOpt, id).toBe(false);
  }
});
