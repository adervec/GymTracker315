// feat 174 — human-readable, Claude-fillable media reference sheet that round-trips back through import.
// buildMediaSheet() emits a markdown list of every exercise with a stable {id:<uuid>} tag and a `media:`
// slot; parseMediaSheet()/importMediaData() read the same text back (by id tag, else by title), so you can
// have Claude fill in form-reference links and re-import the same document.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildMediaSheet === 'function' && typeof parseMediaSheet === 'function'
    && typeof importMediaData === 'function' && typeof applyMediaEntries === 'function'
    && typeof getExerciseMedia === 'function', null, { timeout: 15000 });
});

test('the sheet lists exercises with an {id} tag, a media: slot, and fill-in instructions', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.exerciseMedia = {};
    let u = null, info = null; for (const [k, i] of VAR_INDEX) { if (!isSuppressedVar(k)) { u = k; info = i; break; } }
    const sheet = buildMediaSheet('all');
    return {
      hasHeader: sheet.includes('# GymTracker — Media Reference Sheet'),
      hasHelp: /Keep the .?\{id/.test(sheet) && /media:/.test(sheet),
      hasIdTag: sheet.includes('{id: ' + u + '}'),
      hasTitle: sheet.includes(info.variation.title),
      hasMovementHeader: /\n## /.test(sheet),
    };
  });
  expect(r.hasHeader).toBe(true);
  expect(r.hasHelp).toBe(true);
  expect(r.hasIdTag).toBe(true);
  expect(r.hasTitle).toBe(true);
  expect(r.hasMovementHeader).toBe(true);
});

test('export → wipe → import round-trips a link by its {id} tag', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null; for (const [k] of VAR_INDEX) { if (!isSuppressedVar(k)) { u = k; break; } }
    state.exerciseMedia = {};
    addExerciseMedia(u, 'https://youtu.be/abc123DEFGH');
    const sheet = buildMediaSheet('all');
    const inSheet = sheet.includes('abc123DEFGH');
    state.exerciseMedia = {};                 // simulate Claude returning the same sheet to a fresh map
    importMediaData(sheet);
    const after = getExerciseMedia(u);
    return { inSheet, count: after.length, vid: after[0] && after[0].vid };
  });
  expect(r.inSheet).toBe(true);
  expect(r.count).toBe(1);
  expect(r.vid).toBe('abc123DEFGH'); // re-parsed to the same video, attached to the same exercise
});

test('parseMediaSheet is tolerant: comma lists, bare-URL continuation lines, and title fallback', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null, title = null; for (const [k, i] of VAR_INDEX) { if (!isSuppressedVar(k)) { u = k; title = i.variation.title; break; } }
    state.exerciseMedia = {};
    // 1) two links comma-separated on the media: line, keyed by {id}
    const sheetA = `## X · Y\n- ${title}  {id: ${u}}\n  media: https://youtu.be/aaaaaaaaaaa, https://youtu.be/bbbbbbbbbbb\n`;
    const eA = parseMediaSheet(sheetA);
    // 2) a bare URL on its own continuation line still attaches to the exercise above it
    const sheetB = `- ${title}  {id: ${u}}\n  media:\n  https://youtu.be/ccccccccccc\n`;
    const eB = parseMediaSheet(sheetB);
    // 3) NO id tag → falls back to matching by the exercise title
    const sheetC = `- ${title}\n  media: https://youtu.be/ddddddddddd\n`;
    importMediaData(sheetC);
    const byTitle = getExerciseMedia(u);
    return {
      aCount: eA.length, aFirstUuid: eA[0] && eA[0].uuid,
      bCount: eB.length, bUrl: eB[0] && eB[0].url,
      titleFallback: byTitle.some(m => m.vid === 'ddddddddddd'),
    };
  });
  expect(r.aCount).toBe(2);
  expect(r.aFirstUuid).toBeTruthy();
  expect(r.bCount).toBe(1);
  expect(r.bUrl).toContain('ccccccccccc');
  expect(r.titleFallback).toBe(true); // matched by title when the {id} tag was dropped
});

test('importMediaData accepts BOTH the JSON map and the markdown sheet', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null; for (const [k] of VAR_INDEX) { if (!isSuppressedVar(k)) { u = k; break; } }
    state.exerciseMedia = {};
    importMediaData(JSON.stringify({ media: [{ uuid: u, url: 'https://youtu.be/json1111111' }] })); // JSON path
    const afterJson = getExerciseMedia(u).map(m => m.vid);
    importMediaData(`- whatever {id: ${u}}\n  media: https://youtu.be/sheet2222222\n`);                // sheet path
    const afterSheet = getExerciseMedia(u).map(m => m.vid);
    return { afterJson, afterSheet };
  });
  expect(r.afterJson).toContain('json1111111');
  expect(r.afterSheet).toContain('json1111111'); // merges, doesn't clobber
  expect(r.afterSheet).toContain('sheet2222222');
});

test('the "missing links only" scope omits exercises that already have media', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null, info = null; for (const [k, i] of VAR_INDEX) { if (!isSuppressedVar(k)) { u = k; info = i; break; } }
    state.exerciseMedia = {};
    addExerciseMedia(u, 'https://youtu.be/has11111111');
    const all = buildMediaSheet('all');
    const missing = buildMediaSheet('missing');
    return {
      idInAll: all.includes('{id: ' + u + '}'),
      idInMissing: missing.includes('{id: ' + u + '}'),
      // a sibling with NO media should still appear in the missing sheet
      stampMissing: /scope: missing links only/.test(missing),
    };
  });
  expect(r.idInAll).toBe(true);
  expect(r.idInMissing).toBe(false); // it has a link, so it's excluded from the to-do sheet
  expect(r.stampMissing).toBe(true);
});

test('unknown exercise titles are reported, not thrown', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.exerciseMedia = {};
    const res = applyMediaEntries([
      { match: 'A Totally Made Up Exercise That Does Not Exist', url: 'https://youtu.be/zzzzzzzzzzz' },
      { uuid: 'not-a-real-uuid', url: 'https://youtu.be/yyyyyyyyyyy' },
    ]);
    return res;
  });
  expect(r.added).toBe(0);
  expect(r.unmatched).toBe(2); // both unresolved, gracefully counted
  expect(r.bad).toBe(0);
});
