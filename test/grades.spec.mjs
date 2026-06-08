// feat 158 — the grade scale tops out at S (highest) and floors at D (no F, no A+, for positivity), and
// the Log tab can filter sessions to grade >= a chosen letter.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.gradeFor === 'function' && typeof window.gradeRank === 'function' && typeof window.renderSessionsLog === 'function', null, { timeout: 15000 });
});

test('grade scale: S at the top, D as the floor (no F, no A+)', async ({ page }) => {
  const r = await page.evaluate(() => ({ s: gradeFor(95), s2: gradeFor(100), a: gradeFor(85), b: gradeFor(72), c: gradeFor(61), d: gradeFor(40), zero: gradeFor(0) }));
  expect(r.s).toBe('S');
  expect(r.s2).toBe('S');
  expect(r.a).toBe('A');
  expect(r.b).toBe('B');
  expect(r.c).toBe('C');
  expect(r.d).toBe('D'); // 40 → D (no F)
  expect(r.zero).toBe('D');
});

test('gradeRank orders S>A>B>C>D and floors legacy grades (A+, F)', async ({ page }) => {
  const r = await page.evaluate(() => ({ order: ['D', 'C', 'B', 'A', 'S'].map(gradeRank), plus: gradeRank('A+'), f: gradeRank('F') }));
  expect(r.order).toEqual([0, 1, 2, 3, 4]); // ascending
  expect(r.plus).toBe(3); // legacy A+ ranks as A
  expect(r.f).toBe(0);    // legacy F floors to the D tier
});

test('the Log tab filters sessions to grade >= the chosen letter', async ({ page }) => {
  const r = await page.evaluate(() => {
    const mk = (id, pts) => ({ id, date: new Date(Date.now() - id.length * 60000).toISOString(), exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }], finalScore: { points: pts, grade: gradeFor(pts) } });
    state.sessions = [mk('s', 95), mk('aa', 85), mk('bbb', 72), mk('cccc', 61), mk('ddddd', 40)];
    _logMinGrade = ''; _sessionsLogPage = 0;
    switchToTab('sessions');
    const all = document.getElementById('trk-main').querySelectorAll('.session-item').length;
    document.getElementById('trk-main').querySelector('[data-log-grade="A"]').click(); // >= A
    const geA = document.getElementById('trk-main').querySelectorAll('.session-item').length;
    document.getElementById('trk-main').querySelector('[data-log-grade="S"]').click(); // >= S
    const geS = document.getElementById('trk-main').querySelectorAll('.session-item').length;
    document.getElementById('trk-main').querySelector('[data-log-grade=""]').click();  // Any grade
    const back = document.getElementById('trk-main').querySelectorAll('.session-item').length;
    return { all, geA, geS, back, minGrade: _logMinGrade };
  });
  expect(r.all).toBe(5);
  expect(r.geA).toBe(2);  // S(95) + A(85)
  expect(r.geS).toBe(1);  // S(95) only
  expect(r.back).toBe(5); // cleared
  expect(r.minGrade).toBe('');
});

test('the S grade renders with its own chip class', async ({ page }) => {
  const html = await page.evaluate(() => {
    const sess = { id: 'top', date: new Date().toISOString(), exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }], finalScore: { points: 96, grade: 'S' } };
    return renderSession(sess, false);
  });
  expect(html).toContain('g-S');
  expect(html).toContain('>S<');
});
