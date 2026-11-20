// feat 577 — what the coach says, in one place: every spoken line is a named event that goes through coachSay(),
// with its own switch and frequency, a talk budget, a mute, and no repeats. Lines you already had keep the setting
// they had; every new line (records, targets, plan milestones) is off until you turn it on.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coachSay === 'function' && typeof coachAllow === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  await page.evaluate(() => {
    window._said = []; window.annunce = (txt) => { window._said.push(String(txt)); };   // hear what would be spoken
    state.coachTalk = { ev: {}, minGap: 0, perMin: 0 }; state.annunciation = { start: false, end: false, startLimit: 0, endLimit: 0, duck: true };
    state.ttsTips = false; state.sound = { audio: true, haptics: true, volume: 1 };
    coachMute('off'); _coachSaid = []; _coachLastText = ''; _coachLastAt = 0;
  });
});

test('feat 577 — nothing gets chattier by default: old lines keep their switch, new lines start off', async ({ page }) => {
  const r = await page.evaluate(() => {
    const on = id => coachEventCfg(id).on;
    const before = { start: on('set.start'), end: on('set.end'), record: on('record.new'), progress: on('record.progress'), target: on('target.open'), half: on('plan.half'), last: on('plan.last'), next: on('plan.next'), trend: on('set.trend') };
    state.annunciation.start = true;                       // the old switch IS the event's switch
    const viaOld = on('set.start');
    setCoachEvent('set.end', { on: true });                // and the new switch writes the old setting
    return { before, viaOld, viaNew: state.annunciation.end, ids: COACH_EVENTS.map(e => e.id).length, uniq: new Set(COACH_EVENTS.map(e => e.id)).size, budget: [coachTalk().minGap, coachTalk().perMin] };
  });
  expect(r.before).toEqual({ start: false, end: false, record: false, progress: false, target: false, half: false, last: false, next: true, trend: true });
  expect(r.viaOld).toBe(true);
  expect(r.viaNew).toBe(true);
  expect(r.ids).toBe(r.uniq);
  expect(r.budget).toEqual([0, 0]);                        // no limits until you set one
});

test('feat 577 — the router: switch, mute, talk budget, no repeats; timing cues always get through', async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    out.off = coachSay('record.new', 'A');                                   // off → silent
    setCoachEvent('record.new', { on: true }); setCoachEvent('set.end', { on: true });
    out.on = coachSay('record.new', 'A');
    out.repeat = coachSay('record.new', 'A');                                // the same line again → dropped
    out.other = coachSay('record.new', 'B');
    setCoachBudget({ minGap: 30 });
    out.gap = coachSay('set.end', 'C');                                      // inside the gap → dropped, not queued
    state.restCues = { ...restCueCfg(), voice: true };
    out.timing = coachSay('rest.count', '3');                                // a countdown ignores the budget
    setCoachBudget({ minGap: 0, perMin: 2 }); _coachSaid = [Date.now(), Date.now()];
    out.cap = coachSay('set.end', 'D');
    out.capTiming = coachSay('rest.count', '2');
    setCoachBudget({ perMin: 0 });
    coachMute(10);
    out.muted = [coachSay('set.end', 'E'), coachSay('rest.count', '1'), coachMuted(), coachMuteLabel()];
    out.user = coachSay('set.end', 'Sample', { user: true });                // you pressed "hear it": always plays
    coachMute('off');
    out.unmuted = coachSay('set.end', 'F');
    out.said = window._said.slice();
    return out;
  });
  expect(r.off).toBe(false);
  expect(r.on).toBe(true);
  expect(r.repeat).toBe(false);
  expect(r.other).toBe(true);
  expect(r.gap).toBe(false);
  expect(r.timing).toBe(true);
  expect(r.cap).toBe(false);
  expect(r.capTiming).toBe(true);
  expect(r.muted.slice(0, 3)).toEqual([false, false, true]);
  expect(r.muted[3]).toMatch(/muted for \d+ more min/);
  expect(r.user).toBe(true);
  expect(r.unmuted).toBe(true);
  expect(r.said).toEqual(['A', 'B', '3', '2', 'Sample', 'F']);
});

test('feat 577 — a finished set is ONE utterance: the record first, then the progress line', async ({ page }) => {
  const r = await page.evaluate(() => {
    let v; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { v = u; break; } }
    pending = { varUuid: v, subUuid: null, sets: [{ w: 205, r: 8 }] };
    const say = (lvl) => { window._said = []; _coachLastText = ''; _coachLastAt = 0; annunceSetEnd(lvl, { w: 205, r: 8 }); return window._said.slice(); };
    const out = {};
    out.allOff = say('pr');
    setCoachEvent('record.new', { on: true });
    out.recordOnly = say('pr');
    out.notARecord = say('baseline');
    setCoachEvent('set.end', { on: true });
    out.both = say('pr');
    setCoachEvent('record.progress', { on: true });
    out.progress = say('progress');
    out.spoken = [coachSetSpoken(v, 205, 8), coachSetSpoken(v, 0, 12)];
    return out;
  });
  expect(r.allOff).toEqual([]);
  expect(r.recordOnly).toEqual(['New record — 205 for 8']);
  expect(r.notARecord).toEqual([]);
  expect(r.both).toHaveLength(1);                                             // one utterance, so neither cuts the other off
  expect(r.both[0]).toMatch(/^New record — 205 for 8\. One down/);
  expect(r.progress[0]).toMatch(/^Better than last time\. /);
  expect(r.spoken).toEqual(['205 for 8', '12 reps']);
});

test('feat 577 — picking an exercise can say what there is to beat, from the last session that had it', async ({ page }) => {
  const r = await page.evaluate(() => {
    let v; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { v = u; break; } }
    const day = (d, sets) => ({ id: 's' + d, date: new Date(Date.now() - d * 864e5).toISOString(), endedAt: new Date(Date.now() - d * 864e5 + 3e6).toISOString(), exercises: [{ varUuid: v, subUuid: null, sets }] });
    state.sessions = [day(9, [{ w: 250, r: 2 }]), day(3, [{ w: 200, r: 9 }, { w: 180, r: 8 }])];
    const off = coachSayTarget(v, null);
    setCoachEvent('target.open', { on: true });
    const on = coachSayTarget(v, null);
    state.sessions = [];
    _coachLastText = ''; const none = coachSayTarget(v, null);
    return { off, on, none, said: window._said.slice(), best: 'ok' };
  });
  expect(r.off).toBe(false);
  expect(r.on).toBe(true);
  expect(r.none).toBe(false);                                                 // no history: nothing to say
  expect(r.said).toEqual(['Last time: 200 for 9. Beat it.']);                 // the LAST session's best, not the all-time one
});

test('feat 577 — presets set the switches and the budget; timing cues are left to their own features', async ({ page }) => {
  const r = await page.evaluate(() => {
    const snap = () => ({ on: COACH_EVENTS.filter(e => e.pri > 0 && coachEventCfg(e.id).on).map(e => e.id), gap: coachTalk().minGap, perMin: coachTalk().perMin, hold: coachEventCfg('hold.count').on });
    applyCoachPreset('quiet'); const quiet = snap();
    applyCoachPreset('chatty'); const chatty = snap();
    applyCoachPreset('normal'); const normal = snap();
    return { quiet, chatty, normal, all: COACH_EVENTS.filter(e => e.pri > 0).length };
  });
  expect(r.quiet).toEqual({ on: ['set.end', 'record.new'], gap: 20, perMin: 3, hold: false });
  expect(r.chatty.on).toHaveLength(r.all);
  expect(r.chatty.gap).toBe(0);
  expect(r.normal.on).toEqual(['set.start', 'set.end', 'plan.next', 'record.new']);
});

test('feat 577 — the settings card: a row per line with a switch, how often, and a button to hear it', async ({ page }) => {
  await page.evaluate(() => { openSettingsDrawer(); });
  await page.waitForSelector('.ct-card');
  const r = await page.evaluate(() => {
    const card = document.querySelector('.ct-card');
    const out = { rows: card.querySelectorAll('.ct-row').length, events: COACH_EVENTS.length, groups: card.querySelectorAll('.ct-group').length,
      presets: card.querySelectorAll('[data-ct-preset]').length, freqOnTiming: !!card.querySelector('[data-ct-freq="rest.count"]') };
    card.querySelector('[data-ct-ev="record.new"][data-ct-on="1"]').click();
    out.switched = coachEventCfg('record.new').on;
    const card2 = document.querySelector('.ct-card');
    const fq = card2.querySelector('[data-ct-freq="record.new"]'); fq.value = 'quarter'; fq.dispatchEvent(new Event('change', { bubbles: true }));
    out.freq = coachEventCfg('record.new').freq;
    card2.querySelector('[data-ct-mute="10"]').click();
    out.muted = coachMuted();
    document.querySelector('.ct-card [data-ct-test="plan.half"]').click();      // off, and muted — the test button still plays it
    out.heard = window._said.slice();
    const gap = document.querySelector('#ct-gap'); gap.value = '20'; gap.dispatchEvent(new Event('change', { bubbles: true }));
    out.gap = coachTalk().minGap;
    document.querySelector('.ct-card [data-ct-mute="off"]').click();
    out.unmuted = !coachMuted();
    closeSettingsDrawer();
    return out;
  });
  expect(r.rows).toBe(r.events);
  expect(r.groups).toBe(6);
  expect(r.presets).toBe(3);
  expect(r.freqOnTiming).toBe(false);          // a countdown is not "sometimes"
  expect(r.switched).toBe(true);
  expect(r.freq).toBe('quarter');
  expect(r.muted).toBe(true);
  expect(r.heard).toEqual(['Halfway through the plan']);
  expect(r.gap).toBe(20);
  expect(r.unmuted).toBe(true);
});

test('feat 577 — the sound button mutes the coach from anywhere', async ({ page }) => {
  const r = await page.evaluate(() => {
    openSoundMenu();
    const menu = document.getElementById('sound-menu');
    const before = [...menu.querySelectorAll('[data-snd-cmute]')].map(b => b.dataset.sndCmute);
    menu.querySelector('[data-snd-cmute="10"]').click();
    const muted = coachMuted(), after = [...document.getElementById('sound-menu').querySelectorAll('[data-snd-cmute]')].map(b => b.dataset.sndCmute);
    document.getElementById('sound-menu').querySelector('[data-snd-cmute="off"]').click();
    const un = !coachMuted();
    closeSoundMenu();
    return { before, muted, after, un };
  });
  expect(r.before).toEqual(['10', 'workout']);
  expect(r.muted).toBe(true);
  expect(r.after).toEqual(['off']);
  expect(r.un).toBe(true);
});
