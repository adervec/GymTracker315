// feat 562 — the standardized setup (feet, knees, hips, core … grip, breathing, then equipment) read aloud, like
// the brief: from the Brief tab and from the Body Position table, through the same player and coach voice.
// Exercises with no table of their own fall back to their movement pattern's setup.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const uuidOf = (page, id) => page.evaluate(id => { for (const [u, i] of VAR_INDEX) if (i.variation.id === id) return u; }, id);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {   // a speech engine that records what it was asked to say
    window.__said = [];
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    // speechSynthesis is a read-only getter on window, so plain assignment would be silently ignored
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { window.__said.push(u.text); setTimeout(() => u.onend && u.onend(), 5); }, cancel() {}, pause() {}, resume() {}, getVoices: () => [], speaking: false, paused: false, addEventListener() {} } });
  });
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof startPositionPodcast === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 562 — the setup reads the table part by part, ground up, in plain speech', async ({ page }) => {
  const u = await uuidOf(page, 'bb-flat-bench');
  const r = await page.evaluate(u => positionPodcast(u), u);
  const labels = r.segs.map(s => s.label);
  expect(labels.slice(0, 4)).toEqual(['Setup', 'Feet', 'Knees', 'Hips']);
  expect(labels).toContain('Breathing');
  expect(labels[labels.length - 1]).toBe('Equipment');
  const all = r.segs.map(s => s.text).join(' ');
  expect(all).toMatch(/Knees\. Bent about 90 degrees/);   // "~90°" spoken as words
  expect(all).not.toMatch(/[~°&]|,\./);
});

test('feat 562 — exercises without a table get their movement pattern setup, and say so', async ({ page }) => {
  const r = await page.evaluate(() => {
    let n = 0, tot = 0, lifts = 0, liftsWith = 0;
    const LIFT = new Set(['hinge', 'squat', 'lunge', 'row', 'vertical-press', 'bench-press', 'push-up', 'pull-up', 'carry', 'biceps-curl', 'oly', 'thruster']);
    for (const [u] of VAR_INDEX) { tot++; const has = !!positionPodcast(u); if (has) n++; const m = motionForVariation(u); if (m && LIFT.has(m.motion)) { lifts++; if (has) liftsWith++; } }
    let swing = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'kb-swing-lunge-high-pull') swing = u;
    return { share: n / tot, liftShare: liftsWith / lifts, swing: positionForVar(swing) };
  });
  expect(r.share).toBeGreaterThan(0.75);
  expect(r.liftShare, 'every main lift has a setup').toBe(1);
  expect(r.swing.fromPattern).toBe(true);
  expect(r.swing.body.hips).toMatch(/hinge/i);
});

test('feat 562 — the Brief tab and the Body Position table both play it', async ({ page }) => {
  const u = await uuidOf(page, 'bb-flat-bench');
  await page.evaluate(u => { state.sound = { ...(state.sound || {}), audio: true, volume: 1 }; state.audioHeadphonesOnly = false; startExerciseFromSuggestion(u); modalState.tipsExpanded = true; modalState.exCarousel = 'brief'; renderModal(); }, u);
  await page.locator('#trk-setup-play').click();
  await expect.poll(() => page.evaluate(() => window.__said.join(' | ')), { timeout: 5000 }).toMatch(/Setting up for Barbell Flat Bench Press/);
  await expect.poll(() => page.evaluate(() => window.__said.join(' | ')), { timeout: 5000 }).toMatch(/Feet\. Flat and planted/);
  await page.evaluate(() => { _podStop(); window.__said = []; });

  // the reference table's own button
  await page.evaluate(() => { state.sound = { ...(state.sound || {}), audio: true, volume: 1 }; });
  const btn = page.locator(`#trk-modal .pos-speak[data-pos-speak="${u}"]`);
  await page.evaluate(() => { modalState.exCarousel = 'full'; renderModal(); document.querySelector('#trk-modal .position-wrap').classList.add('open'); });
  await btn.click();
  await expect.poll(() => page.evaluate(() => window.__said.join(' | ')), { timeout: 5000 }).toMatch(/Setting up for/);
});
