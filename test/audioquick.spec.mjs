// feat 505 — the quick 🔊 menu covers the rest of the audio switches, the spoken timers first. It used to
// stop at four sources (metronome / rest cues / spoken tips / button taps), so tuning anything else
// mid-workout meant leaving the screen for the Settings drawer.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof soundSources === 'function' && typeof renderSoundMenu === 'function'
    && typeof openSoundMenu === 'function' && typeof annunciationCfg === 'function', null, { timeout: 15000 });
});

test('feat 505 — the spoken timers and callouts are all in the quick menu', async ({ page }) => {
  const labels = await page.evaluate(() => soundSources().map(s => s.label));
  // the originals stay
  ['Metronome', 'Rest cues', 'Spoken tips', 'Button taps'].forEach(l => expect(labels).toContain(l));
  // …and the rest of the switches join them
  ['Hold timer voice', 'Set start call', 'Set end call', 'Exercise voice', 'Set quality tone', 'Rest timer']
    .forEach(l => expect(labels).toContain(l));
});

test('feat 505 — every new row round-trips its real setting', async ({ page }) => {
  const r = await page.evaluate(() => {
    const wc = state.workoutControls || (state.workoutControls = {});
    const find = (label) => soundSources().find(s => s.label === label).chips[0];
    const out = {};
    const probe = (label, read) => {
      const c = find(label);
      c.set(true); const on = { chip: c.get(), real: read() };
      c.set(false); const off = { chip: c.get(), real: read() };
      out[label] = { on, off };
    };
    probe('Hold timer voice', () => !!wc.holdVoiceStop);
    probe('Set start call', () => !!annunciationCfg().start);
    probe('Set end call', () => !!annunciationCfg().end);
    probe('Exercise voice', () => !!wc.exVoice);
    probe('Set quality tone', () => !!wc.setQualityTone);
    probe('Rest timer', () => state.workoutControls.restTimer !== false);
    return out;
  });
  Object.entries(r).forEach(([label, x]) => {
    expect(x.on.chip, label + ' reads back on').toBe(true);
    expect(x.on.real, label + ' writes the real setting').toBe(true);
    expect(x.off.chip, label + ' reads back off').toBe(false);
    expect(x.off.real, label + ' clears the real setting').toBe(false);
  });
});

test('feat 505 — setting the start call here does not disturb the callout caps', async ({ page }) => {
  // the numeric fields stay in the drawer; toggling from the popover must not flatten them
  const r = await page.evaluate(() => {
    state.annunciation = { start: false, end: false, startLimit: 3, endLimit: 7, duck: false };
    soundSources().find(s => s.label === 'Set start call').chips[0].set(true);
    const a = annunciationCfg();
    return { start: a.start, startLimit: a.startLimit, endLimit: a.endLimit, duck: a.duck };
  });
  expect(r.start).toBe(true);
  expect(r.startLimit, 'the cap survives').toBe(3);
  expect(r.endLimit).toBe(7);
  expect(r.duck, 'and so does ducking').toBe(false);
});

test('feat 505 — the menu renders every row as a chip and still fits a phone', async ({ page }) => {
  const r = await page.evaluate(() => {
    openSoundMenu();
    const menu = document.getElementById('sound-menu');
    const rows = [...menu.querySelectorAll('.snd-src')].map(el => el.querySelector('.snd-src-label').textContent);
    const chips = menu.querySelectorAll('.snd-src .snd-chip').length;
    const cs = getComputedStyle(menu);
    const r = menu.getBoundingClientRect();
    return { rows, chips, overflowY: cs.overflowY,
      fitsWidth: r.width <= window.innerWidth, hasMore: !!menu.querySelector('#snd-more-btn') };
  });
  expect(r.rows.length, 'ten source rows now').toBe(10);
  expect(r.chips).toBeGreaterThanOrEqual(13);   // 4 originals (7 chips) + 6 audio-only rows
  expect(r.overflowY, 'a taller menu must scroll rather than overflow').toBe('auto');
  expect(r.fitsWidth).toBe(true);
  expect(r.hasMore, 'the drawer link stays for the numeric settings').toBe(true);
});

test('feat 505 — the drawer link lands on the sound settings', async ({ page }) => {
  const r = await page.evaluate(() => {
    openSoundMenu();
    document.getElementById('snd-more-btn').click();
    const inp = document.getElementById('settings-search');
    return { menuOpen: document.getElementById('sound-menu').classList.contains('open'),
      drawerOpen: document.getElementById('settings-backdrop').classList.contains('open'),
      search: inp ? inp.value : null };
  });
  expect(r.menuOpen, 'the popover closes behind you').toBe(false);
  expect(r.drawerOpen).toBe(true);
  expect(r.search, 'filtered to the audio settings, not the top of a long drawer').toBe('sound');
});
