// feat 135 — per-gym equipment "stables" (DB/KB/ball sizes + pin stack) resolved from the active gym
// with commercial defaults as fallback; the pin main-increment is a slider and the stack steps
// "first then inc" up to a max (default lb: +5 then +10 → 295).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.pinStableFor === 'function' && typeof window.pinStep === 'function' && typeof window.ensureGymStable === 'function', null, { timeout: 15000 });
  await page.evaluate(() => { state.unit = 'lb'; state.gyms = []; state.activeGymId = null; });
});

test('commercial defaults: dumbbells 5,7.5,…,120 and pin first+5 then +10 to 295 (feat 135)', async ({ page }) => {
  const r = await page.evaluate(() => ({ db: defaultDbSizes(), pin: defaultPinStable() }));
  expect(r.db.slice(0, 5)).toEqual([5, 7.5, 10, 12.5, 15]); // fine 2.5-lb steps at the low end
  expect(r.db).toContain(120);
  expect(r.db).toContain(22.5);
  expect(r.pin).toEqual({ first: 5, inc: 10, max: 295 });
});

test('pinStep walks 0→first→+inc up to max, and back down (feat 135)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ps = { first: 5, inc: 10, max: 295 };
    return {
      up0: pinStep(0, 1, ps), up5: pinStep(5, 1, ps), up15: pinStep(15, 1, ps),
      capNear: pinStep(290, 1, ps), capAt: pinStep(295, 1, ps),
      down15: pinStep(15, -1, ps), downFirst: pinStep(5, -1, ps), down0: pinStep(0, -1, ps),
    };
  });
  expect(r.up0).toBe(5);       // first press → the first step
  expect(r.up5).toBe(15);      // then by the main increment
  expect(r.up15).toBe(25);
  expect(r.capNear).toBe(295); // min(295, 290+10)
  expect(r.capAt).toBe(295);   // clamped at max
  expect(r.down15).toBe(5);
  expect(r.downFirst).toBe(0); // from the first step back to empty
  expect(r.down0).toBe(0);
});

test('resolvers use the ACTIVE gym stable, ignore wrong-unit, fall back to defaults (feat 135)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const noGym = { db: dumbbellWeights(), pin: pinStableFor() };
    state.gyms = [{ id: 'G', name: 'Home', equip: {}, show: {}, hide: {}, stable: { unit: 'lb', db: [10, 20, 30], kb: [15, 30], ball: [8, 12], pin: { first: 5, inc: 15, max: 200 } } }];
    state.activeGymId = 'G';
    const withGym = { db: dumbbellWeights(), kb: kettlebellWeights(), ball: medballWeights(), pin: pinStableFor() };
    // a kg stable must be ignored while the app is in lb
    state.gyms[0].stable.unit = 'kg';
    const wrongUnit = dumbbellWeights();
    return { noGymIsDefault: JSON.stringify(noGym.db) === JSON.stringify(defaultDbSizes()), noGymPin: noGym.pin, withGym, wrongUnitIsDefault: JSON.stringify(wrongUnit) === JSON.stringify(defaultDbSizes()) };
  });
  expect(r.noGymIsDefault).toBe(true);
  expect(r.noGymPin).toEqual({ first: 5, inc: 10, max: 295 });
  expect(r.withGym.db).toEqual([10, 20, 30]);     // active gym's custom dumbbells
  expect(r.withGym.kb).toEqual([15, 30]);
  expect(r.withGym.ball).toEqual([8, 12]);
  expect(r.withGym.pin).toEqual({ first: 5, inc: 15, max: 200 });
  expect(r.wrongUnitIsDefault).toBe(true);        // kg stable ignored in lb mode
});

test('default pin setup state carries first/inc/max from the active stable (feat 135)', async ({ page }) => {
  const r = await page.evaluate(() => { modalState.setup = {}; const st = defaultSetupState('pin'); return { inc: st.inc, first: st.first, max: st.max, hasToppers: !!st.toppers }; });
  expect(r.inc).toBe(10);
  expect(r.first).toBe(5);
  expect(r.max).toBe(295);
  expect(r.hasToppers).toBe(true);
});

test('the pin setup tool renders a slider for the main increment (feat 135)', async ({ page }) => {
  const html = await page.evaluate(() => { modalState.setup = {}; return renderSetupBody('pin', 'x'); });
  expect(html).toContain('type="range"');
  expect(html).toContain('data-x-pininc');               // the slider
  expect(html).toMatch(/first \+5, then \+10/);          // stack label reflects the default stable
  expect(html).not.toContain('data-x-pininc="5"');       // not the old pill buttons
});

test('the gym editor renders the equipment-stable config + parseSizeList/ensureGymStable (feat 135)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = { id: 'G', name: 'Home', equip: {}, show: {}, hide: {} };
    const html = renderGymEditor(g);
    const parsed = parseSizeList('10, 20, 5,  30');       // sorts + drops junk
    state.gyms = [g];
    const st = ensureGymStable(g);                         // materialises a writable stable
    return {
      hasStableInputs: /data-gym-stable="G"[^>]*data-stable-key="db"/.test(html) && /data-stable-key="kb"/.test(html) && /data-stable-key="ball"/.test(html),
      hasPinSlider: /type="range"[^>]*data-gym-pininc="G"|data-gym-pininc="G"[^>]*type="range"/.test(html) || html.includes('data-gym-pininc="G"'),
      parsed,
      stableUnit: st.unit, stablePin: st.pin,
    };
  });
  expect(r.hasStableInputs).toBe(true);
  expect(r.hasPinSlider).toBe(true);
  expect(r.parsed).toEqual([5, 10, 20, 30]);
  expect(r.stableUnit).toBe('lb');
  expect(r.stablePin).toEqual({ first: 5, inc: 10, max: 295 });
});
