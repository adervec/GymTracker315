// feat 90 — Coaching & Progression: new trainable muscles (forearms/neck/jaw),
// new trackable families (neck / jaw / climbing), grip-digit additions, and
// bouldering treated as a cardio session. Plus the Coaching tab + crosslinks.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.isCardioVar === 'function' && typeof window.getBP === 'function', null, { timeout: 15000 });
});

test('new trainable muscles are in the taxonomy', async ({ page }) => {
  const r = await page.evaluate(() => ({
    labels: BP_LABELS,
    parts: BODY_PARTS,
    grip: getBP(FAMILIES.find(f => f.id === 'grip-training')),
    wrist: getBP(FAMILIES.find(f => f.id === 'wrist-curl')),
    neck: getBP(FAMILIES.find(f => f.id === 'neck-training')),
    jaw: getBP(FAMILIES.find(f => f.id === 'jaw-training')),
  }));
  expect(r.labels.forearms).toBe('Forearms');
  expect(r.labels.neck).toBe('Neck');
  expect(r.labels.jaw).toBe('Jaw');
  for (const m of ['forearms', 'neck', 'jaw']) expect(r.parts, `${m} in BODY_PARTS`).toContain(m);
  expect(r.grip, 'grip-training -> forearms').toBe('forearms');
  expect(r.wrist, 'wrist-curl -> forearms').toBe('forearms');
  expect(r.neck).toBe('neck');
  expect(r.jaw).toBe('jaw');
});

test('new families are injected into both tracker and reference', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = ['neck-training', 'jaw-training', 'climbing'];
    return {
      inFamilies: ids.filter(id => FAMILIES.some(f => f.id === id)).sort(),
      inReference: ids.filter(id => exercises.some(e => e.id === id)).sort(),
      neckVars: (FAMILIES.find(f => f.id === 'neck-training') || { variations: [] }).variations.length,
      climbVars: (FAMILIES.find(f => f.id === 'climbing') || { variations: [] }).variations.length,
    };
  });
  expect(r.inFamilies).toEqual(['climbing', 'jaw-training', 'neck-training']);
  expect(r.inReference).toEqual(['climbing', 'jaw-training', 'neck-training']);
  expect(r.neckVars).toBeGreaterThanOrEqual(4);
  expect(r.climbVars).toBeGreaterThanOrEqual(2);
});

test('bouldering logs as cardio; grip/neck/jaw use sensible logging modes', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = (id) => FAMILIES.find(f => f.id === id);
    const uuidOf = (famId, varId) => fam(famId).variations.find(x => x.id === varId).uuid;
    const boulder = uuidOf('climbing', 'bouldering-indoor');
    return {
      boulderCardio: isCardioVar(boulder),
      topropeCardio: isCardioVar(uuidOf('climbing', 'climbing-toprope')),
      neckIso: exMode(uuidOf('neck-training', 'neck-iso-hold')).mode,
      neckFlex: exMode(uuidOf('neck-training', 'neck-flex-weighted')).mode,
      pinch: exMode(uuidOf('grip-training', 'plate-pinch-hold')).mode,
      hang: exMode(uuidOf('grip-training', 'support-bar-hang')).mode,
      fingerExt: exMode(uuidOf('grip-training', 'finger-extension-band')).mode,
      jawHold: exMode(uuidOf('jaw-training', 'jaw-mastic-hold')).mode,
      jawReps: exMode(uuidOf('jaw-training', 'jaw-exerciser-reps')).mode,
    };
  });
  expect(r.boulderCardio, 'bouldering is cardio').toBe(true);
  expect(r.topropeCardio).toBe(true);
  expect(r.neckIso).toBe('time');      // "Isometric Hold"
  expect(r.neckFlex).toBe('standard'); // weight x reps
  expect(r.pinch).toBe('time');        // "Pinch Hold"
  expect(r.hang).toBe('time');         // "Dead Hang"
  expect(r.fingerExt).toBe('standard');
  expect(r.jawHold).toBe('time');      // "Mastic Gum Hold"
  expect(r.jawReps).toBe('standard');
});

test('new exercises pass the picker visibility gate (recordable)', async ({ page }) => {
  const visible = await page.evaluate(() => {
    const check = (id) => {
      const fam = FAMILIES.find(f => f.id === id);
      return fam.variations.every(v => varVisibleInPicker(fam, v));
    };
    return { neck: check('neck-training'), jaw: check('jaw-training'), climbing: check('climbing') };
  });
  expect(visible.neck).toBe(true);
  expect(visible.jaw).toBe(true);
  expect(visible.climbing).toBe(true);
});

test('Coaching tab renders three discipline cards linking the bundled guides', async ({ page }) => {
  expect(await page.locator('.nav-tab[data-panel="panel-coaching"]').count()).toBe(1);
  await page.click('.nav-tab[data-panel="panel-coaching"]');
  await expect(page.locator('#panel-coaching')).toHaveClass(/active/);
  await expect(page.locator('#coaching-content .coach-card')).toHaveCount(3);
  const ids = await page.locator('#coaching-content .coach-card').evaluateAll((els) => els.map((e) => e.id));
  expect(ids).toEqual(['coach-endurance', 'coach-bouldering', 'coach-grip']);
  const hrefs = await page.locator('#coaching-content a.coach-chip.guide').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
  expect(hrefs).toEqual([
    'Guides/endurance-reference.html',
    'Guides/bouldering-guide.html',
    'Guides/coc-masterclass.html',
  ]);
});

test('crosslink: a coaching chip opens that activity in the Reference', async ({ page }) => {
  await page.click('.nav-tab[data-panel="panel-coaching"]');
  await page.click('#coach-endurance .coach-chip[data-coach-search="bike"]');
  await expect(page.locator('#panel-reference')).toHaveClass(/active/);
  await expect(page.locator('#ref-search')).toHaveValue('bike');
});

test('reverse crosslink: the Reference banner opens the Coaching tab', async ({ page }) => {
  await page.click('.nav-tab[data-panel="panel-reference"]');
  await page.click('#panel-reference .coach-banner');
  await expect(page.locator('#panel-coaching')).toHaveClass(/active/);
});
