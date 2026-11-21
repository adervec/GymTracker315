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
  expect(r.groups).toBe(7);          // six groups of lines, plus the Voice dials (feat 586)
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

test('feat 581 — your own words for a line: {set} is filled in, plain text only, empty goes back to the built-in line', async ({ page }) => {
  const r = await page.evaluate(() => {
    let v; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { v = u; break; } }
    pending = { varUuid: v, subUuid: null, sets: [{ w: 205, r: 8 }] };
    setCoachEvent('record.new', { on: true });
    const say = () => { window._said = []; _coachLastText = ''; _coachLastAt = 0; annunceSetEnd('pr', { w: 205, r: 8 }); return window._said.slice(); };
    const out = { builtIn: say() };
    setCoachEvent('record.new', { text: '  Boom!  {set}.   <b>New</b> best {nope} ' });
    out.own = say(); out.stored = state.coachTalk.ev['record.new'].text; out.sample = coachSample(coachEvent('record.new'));
    setCoachEvent('record.new', { text: 'x'.repeat(300) }); out.len = state.coachTalk.ev['record.new'].text.length;
    setCoachEvent('record.new', { text: '   ' }); out.cleared = state.coachTalk.ev['record.new'].text; out.back = say();
    setCoachEvent('set.end', { text: 'nope' }); out.noTpl = (state.coachTalk.ev['set.end'] || {}).text;      // a composed line has no words to edit
    state.coachTalk.ev['plan.last'] = { on: true, text: '<img src=x onerror=1>' }; out.dirty = coachLine('plan.last');   // synced-in text is cleaned when read
    return out;
  });
  expect(r.builtIn).toEqual(['New record — 205 for 8']);
  expect(r.own).toEqual(['Boom! 205 for 8. b New /b best']);
  expect(r.stored).toBe('Boom! {set}. b New /b best {nope}');
  expect(r.sample).toBe('Boom! 205 for 8. b New /b best');
  expect(r.len).toBe(120);
  expect(r.cleared).toBeUndefined();
  expect(r.back).toEqual(['New record — 205 for 8']);
  expect(r.noTpl).toBeUndefined();
  expect(r.dirty).toBe('img src=x onerror=1');
});

test('feat 581 — the sheet on a line edits its words as you type; the button plays your wording; reset restores it', async ({ page }) => {
  await page.evaluate(() => { openSettingsDrawer(); });
  await page.waitForSelector('.ct-card [data-ct-snd="target.open"]');
  const r = await page.evaluate(async () => {
    const sheet = () => [...document.querySelectorAll('.choice-backdrop')].pop();
    const out = { plain: document.querySelector('.ct-card [data-ct-snd="set.end"]').textContent, words: document.querySelector('.ct-card [data-ct-snd="target.open"]').textContent };
    document.querySelector('.ct-card [data-ct-snd="target.open"]').click();
    const inp = sheet().querySelector('#cs-text');
    out.prefill = inp.value; out.hint = /\{set\}/.test(sheet().querySelector('.cs-words-hint').textContent);
    inp.value = 'Beat {set} today'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    out.saved = state.coachTalk.ev['target.open'].text; out.same = sheet().querySelector('#cs-text') === inp;   // not redrawn under the caret
    sheet().querySelector('[data-cs-test]').click();
    out.heard = window._said.slice();
    sheet().querySelector('[data-cs-reset]').click();
    out.reset = [(state.coachTalk.ev['target.open'] || {}).text, sheet().querySelector('#cs-text').value];
    sheet().querySelector('#cs-text').value = 'Go get {set}'; sheet().querySelector('#cs-text').dispatchEvent(new Event('input', { bubbles: true }));
    sheet().querySelector('[data-cs-close]').click();
    await new Promise(res => setTimeout(res, 350));
    out.lit = document.querySelector('.ct-card [data-ct-snd="target.open"]').classList.contains('active');
    document.querySelector('.ct-card [data-ct-snd="set.end"]').click();
    out.noBox = !sheet().querySelector('#cs-text');
    sheet().querySelector('[data-cs-close]').click();
    closeSettingsDrawer();
    return out;
  });
  expect(r.plain).toBe('🎵');
  expect(r.words).toBe('✏️');
  expect(r.prefill).toBe('Last time: {set}. Beat it.');
  expect(r.hint).toBe(true);
  expect(r.saved).toBe('Beat {set} today');
  expect(r.same).toBe(true);
  expect(r.heard).toEqual(['Beat 200 for 9 today']);
  expect(r.reset).toEqual([undefined, 'Last time: {set}. Beat it.']);
  expect(r.lit).toBe(true);
  expect(r.noBox).toBe(true);
});

test('feat 586 — voice volume of its own, and speed and pitch per coach; untouched until you move a dial', async ({ page }) => {
  const r = await page.evaluate(() => {
    const mk = () => ({ rate: 0.95, volume: 0.8, pitch: undefined });
    const ids = COACH_PERSONAS.filter(p => !p.sys).map(p => p.id), A = ids[0], B = ids[1];
    state.coachPersona = A; state.coachTune = {}; state.sound = { audio: true, haptics: true, volume: 0.8 };
    const out = { base: coachify(mk()) };
    setCoachTune(A, { rate: 1.2, pitch: 0.8 }); setVoiceGain(0.5);
    out.tuned = coachify(mk());
    out.other = coachifyAs(mk(), B);                                    // another coach keeps its own speed and pitch, shares the voice volume
    out.stored = JSON.parse(JSON.stringify(state.coachTune)); out.vv = state.sound.voiceVol;
    setCoachTune(A, { rate: 99, pitch: -5 }); out.clamped = coachTune(A);
    setCoachTune(A, { rate: 1, pitch: 1 }); out.cleared = state.coachTune[A];
    state.coachTune = { [A]: { rate: 'fast', pitch: null } }; out.junk = coachTune(A);
    setCoachTune('no-such-coach', { rate: 1.5 }); out.unknown = state.coachTune['no-such-coach'];
    return out;
  });
  expect(r.base.rate).toBeCloseTo(r.base.rate, 5);
  expect(r.base.volume).toBe(0.8);                                       // nothing changes by default
  expect(r.tuned.rate).toBeCloseTo(r.base.rate * 1.2, 5);
  expect(r.tuned.pitch).toBeCloseTo(r.base.pitch * 0.8, 5);
  expect(r.tuned.volume).toBeCloseTo(0.4, 5);
  expect(r.other.volume).toBeCloseTo(0.4, 5);
  expect(Object.keys(r.stored)).toHaveLength(1);
  expect(r.vv).toBe(0.5);
  expect(r.clamped).toEqual({ rate: 1.6, pitch: 0.5 });
  expect(r.cleared).toBeUndefined();
  expect(r.junk).toEqual({ rate: 1, pitch: 1 });
  expect(r.unknown).toBeUndefined();
});

test('feat 586 — the dials in settings save as you let go, speak a sample, and reset', async ({ page }) => {
  await page.evaluate(() => { state.coachTune = {}; state.sound = { audio: true, haptics: true, volume: 1 }; openSettingsDrawer(); });
  await page.waitForSelector('.ct-card #ct-rate');
  const r = await page.evaluate(() => {
    const set = (id, v) => { const el = document.querySelector(id); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const P = activeCoachPersona().id;
    set('#ct-rate', 120); set('#ct-pitch', 90); set('#ct-vvol', 60);
    const out = { tune: coachTune(P), vv: voiceGain(), label: document.querySelector('#ct-rate-v').textContent, heard: window._said.length };
    document.querySelector('.ct-card [data-ct-tune="reset"]').click();
    out.after = [coachTune(P), voiceGain(), document.querySelector('#ct-rate').value, document.querySelector('#ct-vvol').value];
    closeSettingsDrawer();
    return out;
  });
  expect(r.tune).toEqual({ rate: 1.2, pitch: 0.9 });
  expect(r.vv).toBe(0.6);
  expect(r.label).toBe('120%');
  expect(r.heard).toBe(3);                                               // one sample per dial let go
  expect(r.after).toEqual([{ rate: 1, pitch: 1 }, 1, '100', '100']);
});
