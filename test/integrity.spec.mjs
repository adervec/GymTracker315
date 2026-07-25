// feat 451 — permanent catalogue-integrity guards, born from a bug sweep that caught two duplicate
// variation ids (grip-training/thick-bar-hold, neck-training/neck-lateral — built-in vs EXTRA copies)
// and two dead FAMILY_MOTION keys ('neck'/'band-work' — reference ids, not trackable family ids).
// These invariants now hold for every future content feat: unique ids per family, well-formed compact
// rows, live FAMILY_MOTION keys, no double-injection into the reference, and a complete VAR_INDEX.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof exercises !== 'undefined' && typeof MOBSYS_ROWS !== 'undefined', null, { timeout: 15000 });
});

test('audit: no duplicate variation ids within any family (FAMILIES + reference)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const dups = [];
    const scan = (list, label) => list.forEach(f => {
      const seen = new Set();
      (f.variations || []).forEach(v => { if (seen.has(v.id)) dups.push(label + ':' + f.id + '/' + v.id); seen.add(v.id); });
    });
    scan(FAMILIES, 'fam'); scan(exercises, 'ref');
    return dups;
  });
  expect(r).toEqual([]);
});

test('audit: compact rows are well-formed (9 fields, clean programming pairs, non-empty parts)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bad = [];
    [['mace', MACE_CLUB_ROWS], ['kb', KB_ROWS], ['ybell', YBELL_ROWS], ['trx', TRX_ROWS],
     ['swiss', SWISSBALL_ROWS], ['mob', MOBSYS_ROWS]].forEach(([name, rows]) => rows.forEach(row => {
      if (row.length !== 9) { bad.push(name + '/' + row[0] + ': ' + row.length + ' fields'); return; }
      [4, 5, 6].forEach(i => { if (row[i].split('|').some(p => !p.trim())) bad.push(name + '/' + row[0] + ': empty part in field ' + i); });
      row[7].split(';').forEach(p => {
        const parts = p.split(':');
        if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) bad.push(name + '/' + row[0] + ': bad programming pair "' + p + '"');
      });
      if (typeof row[8] !== 'string' || !row[8].trim()) bad.push(name + '/' + row[0] + ': empty tip');
    }));
    return bad;
  });
  expect(r).toEqual([]);
});

test('audit: FAMILY_MOTION has no dead keys; every family id it names exists', async ({ page }) => {
  const r = await page.evaluate(() => {
    const famIds = new Set(FAMILIES.map(f => f.id));
    return Object.keys(FAMILY_MOTION).filter(k => !famIds.has(k));
  });
  expect(r).toEqual([]);
});

test('audit: no variation appears twice in the reference dataset (adopt/inject double-add)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const seen = new Map(), dups = [];
    exercises.forEach(e => (e.variations || []).forEach(v => {
      if (!v.uuid) return;
      if (seen.has(v.uuid)) dups.push(e.id + '/' + v.id + ' also in ' + seen.get(v.uuid));
      seen.set(v.uuid, e.id);
    }));
    return dups;
  });
  expect(r).toEqual([]);
});

test('audit: analytics survive malformed set data — no NaN in volume/trends/recovery output', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const u = FAMILIES.find(f => f.id === 'squat').variations[0].uuid;
    const iso = new Date().toISOString();
    // a session shaped like real-world bad data: empty weight, null reps, non-numeric strings, cardio-only exercise
    state.sessions = [{ id: 'bad1', date: iso, updatedAt: iso, endedAt: iso, exercises: [
      { varUuid: u, subUuid: null, sets: [{ w: '', r: '' }, { w: 'abc', r: null }, { w: 135, r: 5 }] },
      { varUuid: u, subUuid: null, sets: [], cardio: { elapsedMin: 20, distance: null, calories: null, effort: null } },
    ] }];
    const out = {};
    const main = document.getElementById('trk-main');
    ['volume', 'trends', 'history'].forEach(p => { try { navTo(p); out[p] = main.innerHTML.includes('NaN'); } catch (e) { out[p] = 'threw: ' + e.message; } });
    let rec; try { rec = recoveryReadiness(); out.recovery = JSON.stringify(rec).includes('null') === false && JSON.stringify(rec).includes('NaN'); } catch (e) { out.recovery = 'threw: ' + e.message; }
    try { out.readiness = JSON.stringify(trainingReadiness() || {}).includes('NaN'); } catch (e) { out.readiness = 'threw: ' + e.message; }
    state.sessions = [];
    return out;
  });
  expect(r.volume).toBe(false);
  expect(r.trends).toBe(false);
  expect(r.history).toBe(false);
  expect(r.recovery).toBe(false);
  expect(r.readiness).toBe(false);
});

test('audit: every logged-set-eligible variation has a uuid and resolves in VAR_INDEX', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bad = [];
    FAMILIES.forEach(f => (f.variations || []).forEach(v => {
      if (!v.uuid) { bad.push(f.id + '/' + v.id + ': no uuid'); return; }
      const idx = VAR_INDEX.get(v.uuid);
      if (!idx) bad.push(f.id + '/' + v.id + ': not in VAR_INDEX');
      else if (idx.family.id !== f.id) bad.push(f.id + '/' + v.id + ': indexed under ' + idx.family.id);
    }));
    return bad;
  });
  expect(r).toEqual([]);
});
