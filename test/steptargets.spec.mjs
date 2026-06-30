// feat 387 — a plan step's option can now target a muscle GROUP / muscle / head (with an optional secondary-target
// allowance) or a regex over the movement/variation English name, on top of the existing movement & variation options.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof stepQualifyingVarSet === 'function' && typeof optionMatchesVar === 'function'
    && typeof _muscleOpt === 'function' && typeof _regexOpt === 'function' && typeof renderOptionPicker === 'function', null, { timeout: 15000 });
});

const uuids = (page) => page.evaluate(() => ({
  bench: FAMILIES.find(f => f.id === 'flat-bench-press').variations.find(v => v.uuid).uuid,
  curl: FAMILIES.find(f => f.id === 'bicep-curl').variations.find(v => v.uuid).uuid,
  squat: FAMILIES.find(f => f.id === 'squat').variations.find(v => v.uuid).uuid,
}));

test('feat 387 — a muscle-group step resolves to variations whose PRIMARY target is that group', async ({ page }) => {
  const u = await uuids(page);
  const r = await page.evaluate((u) => {
    const set = (o) => stepQualifyingVarSet({ options: [o] });
    const chest = set(_muscleOpt('chest', 'group', false));
    const triPrimary = set(_muscleOpt('triceps', 'group', false));
    const triSecondary = set(_muscleOpt('triceps', 'group', true));
    return {
      chestHasBench: chest.has(u.bench), chestHasCurl: chest.has(u.curl), chestHasSquat: chest.has(u.squat),
      triPrimaryBench: triPrimary.has(u.bench), triSecondaryBench: triSecondary.has(u.bench),
    };
  }, u);
  expect(r.chestHasBench).toBe(true);   // bench is a primary chest movement
  expect(r.chestHasCurl).toBe(false);
  expect(r.chestHasSquat).toBe(false);
  expect(r.triPrimaryBench).toBe(false);   // bench only hits triceps as a SECONDARY → excluded by default…
  expect(r.triSecondaryBench).toBe(true);  // …included once secondary targets are allowed
});

test('feat 387 — muscle and head targets resolve, and optionMatchesVar agrees', async ({ page }) => {
  const u = await uuids(page);
  const r = await page.evaluate((u) => {
    const setHas = (o, id) => stepQualifyingVarSet({ options: [o] }).has(id);
    return {
      bicepsMuscle: setHas(_muscleOpt('biceps', 'muscle', false), u.curl),
      bicepsHead: setHas(_muscleOpt('biceps-long', 'head', false), u.curl),
      matchMuscle: optionMatchesVar(_muscleOpt('chest', 'group', false), u.bench),
      matchMuscleNo: optionMatchesVar(_muscleOpt('chest', 'group', false), u.squat),
    };
  }, u);
  expect(r.bicepsMuscle).toBe(true);
  expect(r.bicepsHead).toBe(true);   // the long head splits from the biceps contribution
  expect(r.matchMuscle).toBe(true);
  expect(r.matchMuscleNo).toBe(false);
});

test('feat 387 — a name-regex step matches by title, and labels render', async ({ page }) => {
  const u = await uuids(page);
  const r = await page.evaluate((u) => {
    const set = stepQualifyingVarSet({ options: [_regexOpt('curl', 'i')] });
    return {
      curlIn: set.has(u.curl), squatIn: set.has(u.squat),
      matchCurl: optionMatchesVar(_regexOpt('curl', 'i'), u.curl),
      muscleLabel: optionLabel(_muscleOpt('chest', 'group', true)),
      headLabel: optionLabel(_muscleOpt('biceps-long', 'head', false)),
      regexLabel: optionLabel(_regexOpt('curl', 'i')),
      badRegexSafe: stepQualifyingVarSet({ options: [_regexOpt('(', 'i')] }).size, // invalid regex → empty, no throw
    };
  }, u);
  expect(r.curlIn).toBe(true);
  expect(r.squatIn).toBe(false);
  expect(r.matchCurl).toBe(true);
  expect(r.muscleLabel).toMatch(/Chest.*\(group\).*\+2°/);
  expect(r.headLabel).toMatch(/\(head\)/);
  expect(r.regexLabel).toBe('🔤 /curl/i');
  expect(r.badRegexSafe).toBe(0);
});

test('feat 387 — the option picker has the three sub-modes and adds muscle / regex options to the step', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's', sets: 3, options: [], desc: '', load: 'moderate' }] }];
    _plansEditId = 'P'; _plansAddOptStep = 0; _plansOptMode = 'muscle';
    const body = document.createElement('div'); document.body.appendChild(body);
    renderOptionPicker(body, getPlan('P'));
    const tabs = [...body.querySelectorAll('[data-opt-mode]')].map(b => b.dataset.optMode);
    const hasMuscleSelect = !!body.querySelector('#optpick-muscle') && !!body.querySelector('#optpick-muscle-sec');
    // add a muscle-group option
    const sel = body.querySelector('#optpick-muscle'); sel.value = 'grp:back'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    body.querySelector('#optpick-muscle-sec').checked = true;
    body.querySelector('#optpick-muscle-add').click();
    const opt = state.plans[0].steps[0].options[0];
    // now a regex option on a fresh step
    state.plans[0].steps.push({ id: 's2', sets: 3, options: [], desc: '', load: 'moderate' });
    _plansEditId = 'P'; _plansAddOptStep = 1; _plansOptMode = 'regex';
    const body2 = document.createElement('div'); document.body.appendChild(body2);
    renderOptionPicker(body2, getPlan('P'));
    const rin = body2.querySelector('#optpick-regex'); rin.value = 'press|push'; rin.dispatchEvent(new Event('input', { bubbles: true }));
    body2.querySelector('#optpick-regex-add').click();
    const opt2 = state.plans[0].steps[1].options[0];
    return { tabs, hasMuscleSelect, opt, opt2 };
  });
  expect(r.tabs).toEqual(['mv', 'muscle', 'regex']);
  expect(r.hasMuscleSelect).toBe(true);
  expect(r.opt).toEqual({ type: 'muscle', muscleId: 'back', level: 'group', sec: true });
  expect(r.opt2).toEqual({ type: 'regex', pattern: 'press|push', flags: 'i' });
});
