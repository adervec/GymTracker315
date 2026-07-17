// feat 424 — 🎯 vulnerable records in the picker: an all-time e1RM record set MORE than 90 days ago that
// your last-90-day best comes within 5% of. Fresh records (set inside the window) and out-of-form
// variations get no badge.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildVulnerableRecordSet === 'function'
    && typeof renderPickerResults === 'function' && typeof openLogModal === 'function', null, { timeout: 15000 });
});

// three standard variations with distinct record shapes
const seed = (page) => page.evaluate(() => {
  const vars = [];
  for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { vars.push(u); if (vars.length === 3) break; } }
  const [vul, fresh, cold] = vars;
  const sess = (daysAgo, varUuid, w, r) => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - daysAgo);
    return { id: 's' + varUuid + daysAgo, date: d.toISOString(), updatedAt: d.toISOString(),
      exercises: [{ varUuid, subUuid: null, sets: [{ w, r }] }] };
  };
  state.unit = 'lb';
  state.sessions = [
    sess(100, vul, 120, 15),   // record e1RM 180, 100 days old…
    sess(10, vul, 120, 14),    // …recent best 176 ≥ 95% of 180 → VULNERABLE
    sess(10, fresh, 120, 15),  // record set 10 days ago → fresh, not vulnerable
    sess(100, cold, 120, 15),  // old record 180…
    sess(10, cold, 120, 8),    // …recent best 152 < 171 → out of reach
  ];
  return { vul, fresh, cold };
});

test('buildVulnerableRecordSet flags only old records within recent reach', async ({ page }) => {
  const ids = await seed(page);
  const r = await page.evaluate(({ vul, fresh, cold }) => {
    const set = buildVulnerableRecordSet();
    return { vul: set.has(vul), fresh: set.has(fresh), cold: set.has(cold) };
  }, ids);
  expect(r.vul).toBe(true);
  expect(r.fresh).toBe(false);   // the record IS recent form — nothing to take
  expect(r.cold).toBe(false);    // recent best too far below the old record
});

test('the picker shows 🎯 on the vulnerable row only', async ({ page }) => {
  const ids = await seed(page);
  const r = await page.evaluate(({ vul, fresh }) => {
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all';
    modalState.pickerSearch = ''; modalState.planStepFilter = null; modalState.pickerFavOnly = false;
    document.getElementById('trk-modal-body').innerHTML = `<div id="trk-picker-results-wrap">${renderPickerResults()}</div>`;
    const badge = (u) => { const row = document.querySelector(`.picker-var[data-varuuid="${u}"]`); return !!(row && row.querySelector('.picker-vul')); };
    return { vulBadged: badge(vul), freshBadged: badge(fresh), title: document.querySelector('.picker-vul')?.title || '' };
  }, ids);
  expect(r.vulBadged).toBe(true);
  expect(r.freshBadged).toBe(false);
  expect(r.title).toContain('Vulnerable record');
});
