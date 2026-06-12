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

test('the Advice page renders all discipline cards; only bundled-guide cards show a 📖 chip (feat 189/194)', async ({ page }) => {
  await page.evaluate(() => navTo('advice')); // feat 189 — coaching is a router page (was the panel-coaching slide-in)
  expect(await page.evaluate(() => currentPage)).toBe('advice');
  await expect(page.locator('#trk-main #coaching-content .coach-card')).toHaveCount(6); // feat 194 — + yoga / pilates / mobility
  const ids = await page.locator('#trk-main #coaching-content .coach-card').evaluateAll((els) => els.map((e) => e.id));
  expect(ids).toEqual(['coach-endurance', 'coach-bouldering', 'coach-grip', 'coach-yoga', 'coach-pilates', 'coach-mobility']);
  const gids = await page.locator('#trk-main #coaching-content button.coach-chip.guide').evaluateAll((b) => b.map((x) => x.getAttribute('data-guide')));
  expect(gids).toEqual(['endurance', 'bouldering', 'coc']); // the new yoga/pilates/mobility cards have no bundled deep-dive guide
});

test('mobility-family moves route to the yoga / mobility coaching cards (feat 194)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const uuidOf = (famId, varId) => { const f = FAMILIES.find((x) => x.id === famId); if (!f) return null; const v = (f.variations || []).find((x) => x.id === varId) || (f.variations || [])[0]; return v ? v.uuid : null; };
    const sun = uuidOf('mobility-warmup', 'sun-salutation');
    const dog = uuidOf('static-stretch', 'downward-dog');
    const iso = uuidOf('iso-poses');
    return {
      sun: sun ? coachingCardForExercise({ varUuid: sun }) : null,
      dog: dog ? coachingCardForExercise({ varUuid: dog }) : null,
      iso: iso ? coachingCardForExercise({ varUuid: iso }) : null,
    };
  });
  expect(r.sun).toBe('coach-yoga');     // "sun salutation" matches the yoga title rule
  expect(r.dog).toBe('coach-yoga');     // "downward dog" matches the yoga title rule
  expect(['coach-mobility', 'coach-yoga']).toContain(r.iso); // a mobility-family pose lands on a mobility card
});

test('guides are embedded in-file and open in the themed in-app reader', async ({ page }) => {
  // all three guides are baked in as inert <template>s — no external /Guides needed
  expect(await page.locator('template[id^="guide-"]').count()).toBe(3);

  await page.evaluate(() => navTo('advice')); // feat 189 — the Advice page
  await page.click('#coach-bouldering button.coach-chip.guide');

  // reader overlay opens with an iframe whose srcdoc carries the guide + a theme override
  await expect(page.locator('#guide-reader')).toHaveClass(/open/);
  const srcdoc = await page.locator('#guide-reader-frame').getAttribute('srcdoc');
  expect(srcdoc.length).toBeGreaterThan(2000);
  expect(srcdoc).not.toContain('Guides/');                 // no external file reference
  expect(srcdoc).toMatch(/font-family:[^!]+!important/);     // app theme/font injected

  // the guide actually renders inside the frame
  const body = page.frameLocator('#guide-reader-frame').locator('body');
  await expect(body).toBeVisible();
  expect((await body.innerText()).length).toBeGreaterThan(50);

  await page.click('#guide-reader-back');
  await expect(page.locator('#guide-reader')).not.toHaveClass(/open/);
});

test('the guide reader can be escaped three ways (close button, Escape, Back)', async ({ page }) => {
  await page.evaluate(() => navTo('advice')); // feat 189 — the Advice page
  const reader = page.locator('#guide-reader');
  const openGrip = () => page.click('#coach-grip button.coach-chip.guide');

  // 1) the close button is clearly labelled
  await openGrip();
  await expect(reader).toHaveClass(/open/);
  await expect(page.locator('#guide-reader-back')).toHaveText(/Close/);
  await page.click('#guide-reader-back');
  await expect(reader).not.toHaveClass(/open/);

  // 2) the Escape key closes it
  await openGrip();
  await expect(reader).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(reader).not.toHaveClass(/open/);

  // 3) the browser / hardware Back button closes it (does not leave the app)
  await openGrip();
  await expect(reader).toHaveClass(/open/);
  await page.goBack();
  await expect(reader).not.toHaveClass(/open/);
  expect(await page.evaluate(() => currentPage)).toBe('advice'); // still on the Advice page (not left the app)
});

test('crosslink: a coaching chip opens that activity in the Reference', async ({ page }) => {
  await page.evaluate(() => navTo('advice')); // feat 189 — the Advice page
  await page.click('#trk-main #coach-endurance .coach-chip[data-coach-search="bike"]');
  await expect(page.locator('#panel-reference')).toHaveClass(/active/);
  await expect(page.locator('#ref-search')).toHaveValue('bike');
});

test('reverse crosslink: the Reference banner opens the Advice page (feat 189)', async ({ page }) => {
  await page.evaluate(() => goPanel('panel-reference')); // feat 182 — panel switcher is hidden; drive via goPanel
  await page.click('#panel-reference .coach-banner');
  expect(await page.evaluate(() => currentPage)).toBe('advice'); // the banner now opens the Advice router page
});

test('mobility content: new dynamic/static moves + the Isometric Holds family are present & indexed (feat 128)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = (id) => FAMILIES.find((f) => f.id === id);
    const iso = fam('iso-poses'), dyn = fam('mobility-warmup'), stat = fam('static-stretch');
    const ids = (f) => (f ? f.variations.map((v) => v.id) : []);
    const allNew = [iso, dyn, stat].filter(Boolean).flatMap((f) => f.variations);
    return {
      isoExists: !!iso, isoMega: iso && iso.mega, isoSub: iso && iso.sub, isoCount: iso ? iso.variations.length : 0,
      hasChair: ids(iso).includes('chair-pose'), hasHorse: ids(iso).includes('horse-stance'), hasZhan: ids(iso).includes('zhan-zhuang'),
      dynSunSal: ids(dyn).includes('sun-salutation'), dynTaiChi: ids(dyn).includes('taichi-cloud-hands'),
      statDog: ids(stat).includes('downward-dog'), statLizard: ids(stat).includes('lizard-pose'),
      indexed: allNew.every((v) => VAR_INDEX.has(v.uuid)),
      wellFormed: allNew.every((v) => v.id && v.uuid && v.title && (v.cue || (v.movement && v.movement.length))),
    };
  });
  expect(r.isoExists).toBe(true);
  expect(r.isoMega).toBe('mobility');
  expect(r.isoCount).toBeGreaterThanOrEqual(9);
  expect(r.hasChair && r.hasHorse && r.hasZhan).toBe(true);   // yoga + tai chi + martial holds
  expect(r.dynSunSal && r.dynTaiChi).toBe(true);              // dynamic flow additions
  expect(r.statDog && r.statLizard).toBe(true);               // static yoga additions
  expect(r.indexed).toBe(true);                                // every new move is searchable / loggable
  expect(r.wellFormed).toBe(true);                             // required fields present
});
