// feats 527-531 — five features borrowed from other open-source trackers: a year heatmap on the calendar, a
// share-recap toast at workout end, a bodyweight goal line, a program that follows what you actually did, and
// supersets that grow into trisets / giant sets.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof yearHeatmapHtml === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
    null, { timeout: 15000 });
});

const at = d => new Date(Date.now() - d * 864e5).toISOString();

test('feat 527 — year heatmap: one square per day, shaded by sets, a square opens that day', async ({ page }) => {
  const r = await page.evaluate((dates) => {
    const v = [...VAR_INDEX.keys()][0];
    state.sessions = dates.map(([d, n], i) => ({ id: 'y' + i, date: d, exercises: [{ varUuid: v, sets: Array.from({ length: n }, () => ({ w: 100, r: 5 })) }] }));
    _logView = 'calendar'; _calYM = null; _calSelDay = null;
    const main = document.getElementById('trk-main'); renderLogCalendar(main);
    const cells = main.querySelectorAll('.yh-grid .yh-c');
    const lv4 = main.querySelectorAll('.yh-grid .yh-4').length, lv1 = main.querySelectorAll('.yh-grid .yh-1').length;
    const head = main.querySelector('.yh-head').textContent;
    const old = main.querySelector('[data-yh-day]'); const k = old.dataset.yhDay; old.click();
    return { n: cells.length, lv4, lv1, head, opened: _calSelDay === k, ym: _calYM && (_calYM.y + '-' + _calYM.m) === k.split('-').slice(0, 2).join('-') };
  }, [[at(200), 35], [at(3), 4]]);
  expect(r.n).toBeGreaterThanOrEqual(365);
  expect(r.n).toBeLessThanOrEqual(371);
  expect(r.lv4).toBe(1);
  expect(r.lv1).toBe(1);
  expect(r.head).toContain('2 training days');
  expect(r.opened).toBe(true);
  expect(r.ym).toBe(true);
});

test('feat 528 — the workout-ended toast shares the recap when tapped', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const v = [...VAR_INDEX.keys()][0];
    const s = newSession(); s.exercises.push({ varUuid: v, sets: [{ w: 100, r: 5, ts: new Date().toISOString() }] }); state.sessions.push(s);
    let shared = null; navigator.share = async (o) => { shared = o.text; };
    finalizeEndWorkout(s, true);
    const t = document.getElementById('trk-toast').textContent;
    document.getElementById('trk-toast').click();
    await new Promise(res => setTimeout(res, 50));
    return { t, shared };
  });
  expect(r.t).toContain('tap to share recap');
  expect(r.shared).toMatch(/100/);
});

test('feat 529 — bodyweight goal: dashed line on the weight chart, distance left and an ETA', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.bodyCompUnit = 'kg';
    state.bodyComp = [0, 1, 2, 3].map(i => ({ date: at(21 - i * 7), weightKg: 90 - i }));
    function at(d) { return new Date(Date.now() - d * 864e5).toISOString().slice(0, 10); }
    state.profile.goalWeightKg = 82;
    const main = document.getElementById('trk-main'); renderBody(main);
    const html = main.innerHTML;
    state.profile.goalWeightKg = null; renderBody(main);
    return { line: html.includes('bc-goal-line'), txt: (html.match(/🎯 Goal[^<]*/) || [''])[0], unset: main.querySelector('#bc-goal-btn').textContent, noLine: !main.innerHTML.includes('bc-goal-line') };
  });
  expect(r.line).toBe(true);
  expect(r.txt).toContain('5kg to lose');   // 87 now → 82
  expect(r.txt).toContain('at this pace');  // losing 1 kg/week
  expect(r.unset).toContain('Set a goal');
  expect(r.noLine).toBe(true);
});

test('feat 530 — "by what I did": the next session follows the last one finished, not the date', async ({ page }) => {
  const r = await page.evaluate(() => {
    const at = d => new Date(Date.now() - d * 864e5).toISOString();
    const ids = state.plans.slice(0, 3).map(p => p.id);
    state.program = { name: 't', sessions: 3, minutes: 60, pool: ids, week: [null, ids[0], null, ids[1], null, ids[2], null] };
    const run = (id, d) => ({ id: 'r' + d, date: at(d), endedAt: at(d), planId: id, exercises: [] });
    state.sessions = [run(ids[0], 9), run(ids[1], 5)];          // A, then B — C is next whatever the weekday
    state.program.follow = true;
    const next = programToday().planId, up = programNextUp().planId;
    state.sessions.push(run(ids[2], 2));                       // C done → wraps to A
    const wrap = programToday().planId;
    state.sessions.push({ id: 'today', date: new Date().toISOString(), endedAt: new Date().toISOString(), planId: ids[0], exercises: [] });
    const today = programToday();
    return { ok: next === ids[2] && up === ids[2], wrap: wrap === ids[0], todayDone: today.done && today.planId === ids[0] };
  });
  expect(r).toEqual({ ok: true, wrap: true, todayDone: true });
});

test('feat 531 — a superset grows into a triset; all three save under one group', async ({ page }) => {
  const r = await page.evaluate(() => {
    const vs = [...VAR_INDEX.entries()].filter(([, i]) => !isCardioVar(i.variation.uuid) && exMode(i.variation.uuid).mode === 'standard').slice(0, 3).map(([u]) => u);
    state.sessions = [];
    openLogModal(); modalState.showPicker = true; renderModal();
    document.getElementById('trk-ss2-start').click();
    pending.superset.list.push({ varUuid: vs[0], subUuid: null }, { varUuid: vs[1], subUuid: null }); modalState.supersetPick = 'done'; renderModal();
    document.getElementById('trk-ss2-more').click();
    const banner = document.querySelector('.ss2-banner').textContent;
    pending.superset.list.push({ varUuid: vs[2], subUuid: null }); modalState.supersetPick = 'done'; renderModal();
    const name = document.querySelector('.selected-ex-name').textContent, adds = document.querySelectorAll('[data-ss-add]').length;
    pending.superset.sets = [0, 1, 2].map(i => ({ which: i, w: '50', r: '10' }));
    saveSuperset();
    const ex = state.sessions[0].exercises;
    return { banner, name, adds, n: ex.length, oneGroup: new Set(ex.map(e => e.supersetId)).size === 1 && !!ex[0].supersetId };
  });
  expect(r.banner).toContain('Triset');
  expect(r.banner).toContain('C');
  expect(r.name).toContain('Triset');
  expect(r.adds).toBe(3);
  expect(r.n).toBe(3);
  expect(r.oneGroup).toBe(true);
});

test('feat 531 — an old two-exercise pending ({a, b}) still opens and saves', async ({ page }) => {
  const r = await page.evaluate(() => {
    const vs = [...VAR_INDEX.entries()].filter(([, i]) => !isCardioVar(i.variation.uuid) && exMode(i.variation.uuid).mode === 'standard').slice(0, 2).map(([u]) => u);
    state.sessions = [];
    pending.superset = { a: { varUuid: vs[0] }, b: { varUuid: vs[1] }, sets: [{ which: 'a', w: '50', r: '8' }, { which: 'b', w: '40', r: '8' }] };
    openLogModal(); modalState.supersetMode = true; modalState.supersetPick = 'done'; renderModal();
    const name = document.querySelector('.selected-ex-name').textContent;
    saveSuperset();
    return { name, n: state.sessions[0].exercises.length };
  });
  expect(r.name).toContain('Superset');
  expect(r.n).toBe(2);
});

test('feat 532 — sub-variations pick from in-app chips that say which you have trained', async ({ page }) => {
  const r = await page.evaluate(() => {
    let v = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'cable-curl') { v = u; break; }
    const opts = subOptions(VAR_INDEX.get(v).variation);
    state.sessions = [{ id: 'c1', date: new Date(Date.now() - 3 * 864e5).toISOString(), exercises: [{ varUuid: v, subUuid: opts[1].uuid, sets: [{ w: 40, r: 10 }] }] }];
    pending = { varUuid: v, subUuid: opts[0].uuid, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    const noSelect = !document.querySelector('select#trk-sub-select');
    const chips = [...document.querySelectorAll('#trk-sub-select [data-sub-pick]')];
    const trained = chips.filter(c => c.classList.contains('trained')).map(c => c.dataset.subPick);
    const meta = chips[1].querySelector('.sub-chip-meta').textContent;
    chips[1].click();
    return { noSelect, n: chips.length, nOpts: opts.length, trained, want: opts[1].uuid, meta, picked: pending.subUuid === opts[1].uuid,
      active: document.querySelector('#trk-sub-select .sub-chip.active').dataset.subPick === opts[1].uuid };
  });
  expect(r.noSelect).toBe(true);
  expect(r.n).toBe(r.nOpts);
  expect(r.trained).toEqual([r.want]);
  expect(r.meta).toContain('1×');
  expect(r.meta).toContain('3d ago');
  expect(r.picked).toBe(true);
  expect(r.active).toBe(true);
});
