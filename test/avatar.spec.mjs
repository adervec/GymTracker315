// feat 220 — profile-shaped wireframe avatar + optional circumference biometrics. 'classic' keeps the
// original outline byte-for-byte; 'profile' derives the figure from gender, BMI and tape measurements;
// playful hats & hairstyles overlay in either style and carry into every wireframe consumer.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof anatomyOutline === 'function' && typeof avatarProportions === 'function', null, { timeout: 15000 });
});

test('defaults stay classic: original outline, no headgear, avatar travels with settings', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const out = anatomyOutline(50);
    return {
      av: state.avatar,
      inKeys: SETTINGS_KEYS.includes('avatar'),
      classicPath: out.includes('M 38 30 Q 50 24 62 30'),
      legacyLegs: out.includes('L 60 95 L 63 182'),
      hasGear: /av-hat|av-hair/.test(out),
      reshaped: out.includes('av-body'),
    };
  });
  expect(r.av).toEqual({ style: 'classic', hat: 'none', hair: 'none' });
  expect(r.inKeys).toBe(true);
  expect(r.classicPath).toBe(true);   // byte-for-byte the pre-feat-220 torso
  expect(r.legacyLegs).toBe(true);
  expect(r.hasGear).toBe(false);
  expect(r.reshaped).toBe(false);
});

test('girths save from the Body form (inch → cm), show on the page, and round-trip on edit', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.bodyCompUnit = 'lb'; state.bodyComp = [];
    navTo('body');
    document.getElementById('bc-add-btn').click();
    document.getElementById('bc-weight').value = '180';
    document.getElementById('bc-g-waist').value = '34';
    document.getElementById('bc-g-chest').value = '42';
    document.getElementById('bc-save-btn').click();
    const e = state.bodyComp[0];
    const latestLine = document.querySelector('#trk-main').textContent;
    document.querySelector('[data-bc-edit]').click();   // reopen for edit — girth fields prefill in inches
    return {
      waistCm: e.waistCm, chestCm: e.chestCm, neckCm: e.neckCm,
      shows: latestLine.includes('waist 34') && latestLine.includes('chest 42'),
      editWaist: document.getElementById('bc-g-waist').value,
      csvHeader: csvBodyComp()[0].join(','),
      csvRow: csvBodyComp()[1].join(','),
    };
  });
  expect(r.waistCm).toBeCloseTo(86.4, 1);   // 34 in × 2.54
  expect(r.chestCm).toBeCloseTo(106.7, 1);
  expect(r.neckCm).toBeNull();              // untouched fields stay empty
  expect(r.shows).toBe(true);
  expect(r.editWaist).toBe('34');
  expect(r.csvHeader).toContain('waistCm');
  expect(r.csvRow).toContain('86.4');
});

test('profile proportions follow gender, the tape, and BMI; classic yields null', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.avatar.style = 'profile'; state.profile.heightCm = 180; state.bodyComp = [];
    state.profile.gender = 'male';   const male = avatarProportions();
    state.profile.gender = 'female'; const female = avatarProportions();
    state.profile.gender = 'male';
    state.bodyComp = [{ date: '2026-01-01T12:00:00.000Z', weightKg: 80, waistCm: 110, bicepsCm: 45 }];
    const taped = avatarProportions();
    state.bodyComp = [{ date: '2026-01-01T12:00:00.000Z', weightKg: 120 }];   // BMI 37 → broader everywhere
    const heavy = avatarProportions();
    state.avatar.style = 'classic';  const classic = avatarProportions();
    return { male, female, taped, heavy, classic };
  });
  expect(r.male.shoulder).toBeGreaterThan(r.female.shoulder);
  expect(r.female.hip).toBeGreaterThan(r.male.hip);
  expect(r.taped.waist).toBeGreaterThan(r.male.waist);      // 110 cm waist > the base
  expect(r.taped.armW).toBeGreaterThan(r.male.armW);        // 45 cm biceps thickens the arms
  expect(r.heavy.waist).toBeGreaterThan(r.male.waist);      // BMI fallback when no tape
  expect(r.heavy.thigh).toBeGreaterThan(r.male.thigh);
  expect(r.classic).toBeNull();
});

test('profile style + headgear reshape every wireframe, classic restores it', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const classic = anatomyOutline(50);
    state.avatar = { style: 'profile', hat: 'cap', hair: 'mohawk' };
    state.profile.gender = 'female';
    const out = anatomyOutline(50);
    const heat = anatomyHeatmapSvg(heatRegionValues('group', 0));
    state.avatar = { style: 'classic', hat: 'none', hair: 'none' };
    const back = anatomyOutline(50);
    return {
      changed: out !== classic,
      reshaped: out.includes('av-body'),
      hat: out.includes('av-hat'), hair: out.includes('av-hair'),
      heatHasGear: heat.includes('av-hat') && heat.includes('av-body'),
      restored: back === classic,
    };
  });
  expect(r.changed).toBe(true);
  expect(r.reshaped).toBe(true);
  expect(r.hat).toBe(true);
  expect(r.hair).toBe(true);
  expect(r.heatHasGear).toBe(true);   // the heatmap renderer rides the same outline
  expect(r.restored).toBe(true);
});

test('the Body-page avatar card switches style and headgear with a live preview', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    navTo('body');
    document.querySelector('[data-av-style="profile"]').click();
    const styleAfter = state.avatar.style;
    const hat = document.getElementById('av-hat');
    hat.value = 'crown';
    hat.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      styleAfter,
      hatAfter: state.avatar.hat,
      pillActive: document.querySelector('[data-av-style="profile"]').classList.contains('active'),
      previewHasHat: document.getElementById('av-preview').innerHTML.includes('av-hat'),
      previewReshaped: document.getElementById('av-preview').innerHTML.includes('av-body'),
    };
  });
  expect(r.styleAfter).toBe('profile');
  expect(r.hatAfter).toBe('crown');
  expect(r.pillActive).toBe(true);
  expect(r.previewHasHat).toBe(true);
  expect(r.previewReshaped).toBe(true);
});
