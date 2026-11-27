// feat 615 — Rep Studio: the rebuilt exercise animation (deadlifts first). The lifter is solved every frame from the
// bar, so these check the mechanics, not just that something draws: at every point of every deadlift the limbs keep
// their length, the bar travels straight, it never passes through a leg, the lifter stays balanced over the feet, and
// the lift ends locked out. Then the player: real seconds, pause, scrub, the cue per phase, start / middle / end.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof rsFrame === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 615 — every deadlift has a studio rep, and each one is mechanically sound from bottom to lockout', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'deadlift'), missing = fam.variations.filter(v => !REP_STUDIO[v.id]).map(v => v.id);
    const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)), bad = [];
    Object.entries(REP_STUDIO).forEach(([id, spec]) => {
      let x0 = 1e9, x1 = -1e9;
      for (let i = 0; i <= 40; i++) { const s = i / 40, J = rsFrame(spec, s), l = J.legs[0], say = m => bad.push(id + ' ' + m + ' @' + s.toFixed(2));
        if ([J.hip, J.shd, J.bar].flat().some(v => !isFinite(v))) say('NaN');
        if (!J.reach) say('unreachable');
        if (!spec.curl && spec.equip !== 'plateback') {
          if (Math.abs(d3(l.hip, l.knee) - RS.thigh) > 0.6 || Math.abs(d3(l.knee, l.ankle) - RS.shank) > 0.6 || Math.abs(Math.hypot(J.shd[0] - J.hip[0], J.shd[1] - J.hip[1]) - RS.trunk) > 0.6) say('a limb changed length');
          if (!spec.swing) J.arms.forEach(a => { if (!a.free && Math.abs(d3(a.sh, a.grip) - RS.arm) > 0.6) say('an arm changed length'); }); }
        x0 = Math.min(x0, J.bar[0]); x1 = Math.max(x1, J.bar[0]);
        const kg = Array.isArray(spec.load) ? 20 + 2 * spec.load.reduce((a, b) => a + b, 0) : (spec.load || 0) * (spec.equip === 'dumbbell' ? 2 : 1);
        const com = rsBalance(J, spec.swing || spec.equip === 'band' || spec.equip === 'cable' ? 0 : kg);
        if (com < RS.heel - 1 || com > RS.toe + 1) say('off balance (' + com.toFixed(1) + ')');
        if (spec.equip === 'barbell' && !spec.swing) { const k = l.knee, an = l.ankle, y = J.bar[1], u = (y - an[1]) / (k[1] - an[1]);
          const legX = y <= k[1] ? an[0] + (k[0] - an[0]) * u + RS.shinFront + (RS.kneeFront - RS.shinFront) * Math.max(0, u) ** 3 : k[0] + (l.hip[0] - k[0]) * Math.min(1, (y - k[1]) / ((l.hip[1] - k[1]) || 1)) + RS.kneeFront;
          if (J.bar[0] - RS.barR < legX - 2.2) say('the bar is inside the leg'); }
        if (l.hip[1] < l.knee[1] - 2 && !spec.curl) say('hips below knees');
        if (i === 40 && spec.fixedS == null) { if (J.flex > 9) say('knees not locked'); if (!spec.curl && (J.torso < 80 || J.torso > 97)) say('not standing tall'); }
      }
      if (!spec.swing && !spec.curl && spec.equip !== 'plateback' && x1 - x0 > 0.5) bad.push(id + ' bar path wanders ' + (x1 - x0).toFixed(1) + ' cm');
    });
    const conv = rsFrame(REP_STUDIO['conventional-dl'], 0), sumo = rsFrame(REP_STUDIO['sumo-dl'], 0), rdl = rsFrame(REP_STUDIO['romanian-dl'], 0), trap = rsFrame(REP_STUDIO['trap-bar-dl'], 0);
    return { n: Object.keys(REP_STUDIO).length, missing, bad: bad.slice(0, 8), conv: { ahead: conv.shd[0] - conv.bar[0], hipOverKnee: conv.hip[1] - conv.legs[0].knee[1], torso: conv.torso },
      sumoMoreUpright: sumo.torso > conv.torso + 5, trapMoreUpright: trap.torso > conv.torso + 10, rdlKnee: rdl.flex, rdlHipsBack: rdl.hip[0] };
  });
  expect(r.missing).toEqual([]);
  expect(r.n).toBeGreaterThanOrEqual(27);
  expect(r.bad).toEqual([]);
  expect(r.conv.ahead).toBeGreaterThan(2);            // shoulders just ahead of the bar at the floor
  expect(r.conv.ahead).toBeLessThan(12);
  expect(r.conv.hipOverKnee).toBeGreaterThan(8);      // hips above the knees
  expect(r.conv.torso).toBeGreaterThan(15); expect(r.conv.torso).toBeLessThan(40);
  expect(r.sumoMoreUpright).toBe(true);
  expect(r.trapMoreUpright).toBe(true);
  expect(r.rdlKnee).toBeGreaterThan(12); expect(r.rdlKnee).toBeLessThan(35);   // soft knees, not a squat
  expect(r.rdlHipsBack).toBeLessThan(-20);            // the hips travel back
});

test('feat 615 — a rep takes real seconds: phases add up, each has a cue, and the three check frames are in order', async ({ page }) => {
  const r = await page.evaluate(() => Object.entries(REP_STUDIO).map(([id, spec]) => { const T = rsTotal(spec), k = rsKeyTimes(spec);
    return { id, T, ok: T >= 1 && T <= 13 && spec.phases.every(p => p.sec > 0 && p.cue && p.cue.length > 12 && p.label) && k[0] < k[1] && k[1] < k[2] && k[2] <= T,
      wraps: rsAt(spec, T + 0.2).i === 0, last: rsAt(spec, T - 0.01).i === spec.phases.length - 1 }; }));
  expect(r.filter(x => !x.ok || !x.wraps || !x.last).map(x => x.id)).toEqual([]);
  const conv = r.find(x => x.id === 'conventional-dl'), speed = r.find(x => x.id === 'speed-deadlift'), paused = r.find(x => x.id === 'paused-dl');
  expect(conv.T).toBeCloseTo(5.5, 5);
  expect(speed.T).toBeLessThan(conv.T);               // a speed pull is quicker…
  expect(paused.T).toBeGreaterThan(conv.T + 1.5);     // …and a paused one waits
});

test('feat 615 — the player: opens from the motion button, shows x of y s, pauses, scrubs, and gives the cue for the phase', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const u = FAMILIES.find(f => f.id === 'deadlift').variations.find(v => v.id === 'conventional-dl').uuid;
    state.unit = 'kg';
    openMotionCarousel(u);
    const el = document.querySelector('#motion-modal .rs'), wait = ms => new Promise(res => setTimeout(res, ms));
    await wait(700);
    const playing = el._rsT > 0.2, time1 = el.querySelector('[data-rs-time]').textContent;
    el.querySelector('[data-rs-play]').click(); const a = el._rsT; await wait(300); const frozen = el._rsT === a;
    el.querySelector('[data-rs-phase="2"]').click();
    const cueHips = el.querySelector('[data-rs-cue]').textContent, tHips = el._rsT;
    el.querySelectorAll('[data-rs-key]')[0].click(); const tKey = el._rsT;
    el.querySelector('[data-rs-view="side"]').click();
    const svg = el.querySelector('.rs-stage svg');
    const out = { playing, time1, frozen, cueHips, tHips, tKey, view: el.dataset.view,
      parts: ['.rs-man', '.rs-bar', '.rs-plate', '.rs-muscle.on', '.rs-path', '.rs-shorts', '.rs-shoe'].map(q => svg.querySelectorAll(q).length),
      keys: el.querySelectorAll('.rs-key svg').length, note: el.querySelector('.rs-note').textContent, legend: el.querySelectorAll('.rs-lg').length, wide: el.scrollWidth <= el.clientWidth + 1 };
    closeMotionCarousel();
    return out;
  });
  expect(r.playing).toBe(true);
  expect(r.time1).toMatch(/^\d\.\d of 5\.5 s$/);
  expect(r.frozen).toBe(true);
  expect(r.cueHips).toContain('Hips through');
  expect(r.tHips).toBeCloseTo(2.201, 2);              // brace 1.0 + break the floor 1.2: the third phase starts at 2.2 s
  expect(r.tKey).toBeCloseTo(1.001, 2);
  expect(r.view).toBe('side');
  r.parts.forEach(n => expect(n).toBeGreaterThan(0));  // the man, the bar, the plates, working muscles and the bar path each draw
  expect(r.keys).toBe(3);
  expect(r.note).toContain('140 kg');
  expect(r.legend).toBeGreaterThanOrEqual(5);
  expect(r.wide).toBe(true);
});
