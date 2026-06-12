// feat 212 — sets logged BEYOND a plan step's target get their own glowing notches in the step HUD
// bar: glowing fill when complete, checkered fill (feat 211) when in-progress — instead of vanishing
// past the target count.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof refreshPlanStepBar === 'function' && typeof pendingStepOpenSets === 'function', null, { timeout: 15000 });
});

const arm = (page, target, savedSets, pendingSets) => page.evaluate(({ target, savedSets, pendingSets }) => {
  normalizeState();
  const fam = FAMILIES.find(f => f.id === 'bicep-curl');
  const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
  state.plans = [{ id: 'p-x', name: 'X', steps: [{ id: 's1', sets: target, options: [{ type: 'movement', familyId: 'bicep-curl' }] }] }];
  state.sessions = [{ id: 'sess', date: new Date().toISOString(), updatedAt: new Date().toISOString(), planId: 'p-x',
    exercises: savedSets.length ? [{ varUuid: u, subUuid: null, sets: savedSets }] : [] }];
  modalState.isEditing = false; modalState.open = true;
  pending.varUuid = u; pending.subUuid = null;
  pending.sets = pendingSets;
  refreshPlanStepBar();
  const bar = document.getElementById('plan-step-bar');
  return {
    cls: [...bar.querySelectorAll('.stepbar-notch')].map(n => n.className.replace('stepbar-notch', '').trim()),
    label: bar.querySelector('.stepbar-label').textContent,
    barClass: bar.className,
  };
}, { target, savedSets, pendingSets });

test('overflow sets render as extra notches: glowing fill complete, checkered in-prog', async ({ page }) => {
  // target 2 · 2 saved + 1 pending-complete (extra) + 1 open (extra)
  const r = await arm(page, 2, [{ w: 45, r: 10 }, { w: 45, r: 10 }], [{ w: '50', r: '8' }, { w: '55', r: '' }]);
  expect(r.cls).toEqual(['filled', 'filled', 'pending extra', 'inprog extra']);
  expect(r.label).toContain('3/2');     // counted overflow shows in the label (open set still excluded)
  expect(r.barClass).toBe('done');      // the step itself is complete
  await page.evaluate(() => { pending.sets = [{ w: '', r: '' }]; pending.varUuid = null; state.sessions = []; state.plans = []; modalState.open = false; });
});

test('no overflow → no extra class anywhere; under-target keeps empty notches', async ({ page }) => {
  const r = await arm(page, 4, [{ w: 45, r: 10 }], [{ w: '50', r: '' }]);
  expect(r.cls).toEqual(['filled', 'inprog', '', '']);   // 1 saved, 1 open, 2 empty — nothing glows
  expect(r.cls.join(' ')).not.toContain('extra');
  await page.evaluate(() => { pending.sets = [{ w: '', r: '' }]; pending.varUuid = null; state.sessions = []; state.plans = []; modalState.open = false; });
});

test('the extra notch CSS resolves (border + warn fill for complete extras)', async ({ page }) => {
  await arm(page, 1, [{ w: 45, r: 10 }], [{ w: '50', r: '8' }]);   // 1 saved (target) + 1 pending-complete extra
  const r = await page.evaluate(() => {
    const extras = document.querySelectorAll('#plan-step-bar .stepbar-notch.extra');
    const cs = extras.length ? getComputedStyle(extras[0]) : null;
    const out = { n: extras.length, border: cs ? cs.borderTopWidth : null, glow: cs ? cs.boxShadow : null };
    pending.sets = [{ w: '', r: '' }]; pending.varUuid = null; state.sessions = []; state.plans = []; modalState.open = false;
    return out;
  });
  expect(r.n).toBe(1);
  expect(r.border).toBe('1px');               // the glowing border is real
  expect(r.glow).not.toBe('none');            // and so is the glow
});
