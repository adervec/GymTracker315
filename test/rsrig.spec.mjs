// feat 622 — the gold figure; feat 623 — the general rig: every movement type is posed, every exercise routes to one;
// feat 624 — the map's neighbour labels take turns; feat 625 — the GIF export wizard.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof rsRigFrame === 'function' && typeof rsGifBuild === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 623 — every movement type has a rig, and every exercise that is a movement gets an animation', async ({ page }) => {
  const r = await page.evaluate(() => {
    const used = new Set(), none = [], bad = [], seen = new Set(); let n = 0, ok = 0;
    FAMILIES.forEach(f => f.variations.forEach(v => { n++; const mv = motionForVariation(v.uuid); if (mv) used.add(mv.motion);
      const spec = repStudioSpec(v.id); if (!spec) { none.push(f.id); return; } ok++;
      const key = spec.motion ? spec.motion + '|' + spec.equip + '|' + JSON.stringify((mv || {}).opts || {}) : v.id; if (seen.has(key)) return; seen.add(key);
      try { const T = rsTotal(spec); if (!(T > 0) || !spec.phases.every(p => p.label && p.cue && p.sec > 0)) bad.push(key + ' phases');
        for (let i = 0; i <= 8; i++) { const J = rsFrame(spec, i / 8), pts = [].concat(J.legs.flatMap(l => [l.hip, l.knee, l.ankle]), J.arms.flatMap(a => [a.sh, a.grip]), [J.head, J.neck]);
          if (pts.some(q => !q || q.some(x => !Number.isFinite(x)))) { bad.push(key + ' joint'); break; } }
        const svg = rsStageSvg(spec, T * 0.4, 'three'); if (/NaN|undefined/.test(svg)) bad.push(key + ' svg');
        const k = rsKeyTimes(spec); if (!(k[0] < k[1] && k[1] < k[2])) bad.push(key + ' keys');
      } catch (e) { bad.push(key + ' ' + String(e).slice(0, 60)); } }));
    return { n, ok, noneFams: [...new Set(none)], unrigged: [...used].filter(m => !RS_MOTIONS[m]), bad: bad.slice(0, 10), distinct: seen.size };
  });
  expect(r.unrigged, 'every movement type the catalogue routes to is posed').toEqual([]);
  expect(r.bad).toEqual([]);
  expect(r.ok).toBeGreaterThan(1900);
  expect(r.noneFams.every(f => /template|wods/.test(f)), 'only templates and benchmark workouts have no movement: ' + r.noneFams.join(',')).toBe(true);
  expect(r.distinct).toBeGreaterThan(400);
});

test('feat 623 — closed chains hold: planted feet stay planted, hands stay on the bar, and a side plank is a rolled plank', async ({ page }) => {
  const r = await page.evaluate(() => {
    const sq = RS_MOTIONS['squat']('barbell', {}), a0 = rsFrame(sq, 0).legs[0].ankle, a1 = rsFrame(sq, 1).legs[0].ankle, depth = rsFrame(sq, 0), top = rsFrame(sq, 1);
    const bp = RS_MOTIONS['bench-press']('barbell', {}), b = rsFrame(bp, 0.5), onBar = Math.hypot(b.arms[0].grip[0] - b.bar3[0], b.arms[0].grip[1] - b.bar3[1]);
    const armLen = (J) => Math.hypot(...J.arms[0].sh.map((x, i) => x - J.arms[0].el[i])) + Math.hypot(...J.arms[0].el.map((x, i) => x - J.arms[0].grip[i]));
    const sp = RS_MOTIONS['side-plank']('none', {}), J = rsFrame(sp, 1), el = J.xf(J.arms[1].el), topSh = J.xf(J.arms[0].sh), botSh = J.xf(J.arms[1].sh), foot = J.xf(J.legs[1].ankle);
    const pu = RS_MOTIONS['pull-up']('none', {}), p0 = rsFrame(pu, 0), p1 = rsFrame(pu, 1);
    return { planted: Math.hypot(a0[0] - a1[0], a0[1] - a1[1], a0[2] - a1[2]), hipBelowKnee: depth.legs[0].knee[1] - depth.hip[1], stands: top.hip[1], onBar, arm: armLen(b), want: RS.arm,
      elbowY: el[1], stacked: topSh[1] - botSh[1], footY: foot[1], hangs: p0.shd[1] < p0.bar3[1] - 55, chin: p1.head[1] > p1.bar3[1] - 4, rises: p1.hip[1] - p0.hip[1] };
  });
  expect(r.planted).toBeLessThan(0.01);
  expect(r.hipBelowKnee, 'the squat reaches depth').toBeGreaterThan(-6);
  expect(r.stands).toBeGreaterThan(90);
  expect(r.onBar).toBeLessThan(0.5);
  expect(Math.abs(r.arm - r.want), 'bones keep their length').toBeLessThan(0.01);
  expect(r.elbowY, 'the supporting elbow is on the floor').toBeLessThan(8);
  expect(r.stacked, 'shoulders stacked one over the other').toBeGreaterThan(30);
  expect(r.footY).toBeLessThan(16);
  expect(r.hangs).toBe(true);
  expect(r.chin, 'the chin reaches the bar').toBe(true);
  expect(r.rises).toBeGreaterThan(40);
});

test('feat 622 — the figure is gold, built from many shapes, and nothing floats loose of the head', async ({ page }) => {
  const r = await page.evaluate(() => {
    const spec = REP_STUDIO['conventional-dl'], svg = rsStageSvg(spec, 2, 'three'), d = document.createElement('div'); d.innerHTML = svg;
    return { man: d.querySelectorAll('.rs-man').length, hair: d.querySelectorAll('.rs-hair').length, muscles: d.querySelectorAll('.rs-muscle').length, gold: RS_MAT.skin[1], strokes: d.querySelectorAll('.rs-man[stroke]').length };
  });
  expect(r.man).toBeGreaterThan(150);
  expect(r.hair).toBeGreaterThan(25);
  expect(r.muscles).toBeGreaterThan(50);
  expect(r.gold).toBe('#d9a22e');
  expect(r.strokes, 'forms are separated by shading, not outlines').toBe(0);
});

test('feat 623 — a routed movement opens in the player, and reference lists build it only when asked', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const u = FAMILIES.find(f => f.id === 'squat').variations[0].uuid; openMotionCarousel(u);
    const el = document.querySelector('#motion-modal .rs'), panel = motionPanelHtml(u), dl = motionPanelHtml(FAMILIES.find(f => f.id === 'deadlift').variations[0].uuid);
    const host = document.createElement('div'); host.innerHTML = panel; document.body.appendChild(host); host.querySelector('[data-rs-lazy]').click();
    return { player: !!el, stage: !!(el && el.querySelector('.rs-stage svg')), phases: el ? el.querySelectorAll('.rs-ph').length : 0, lazy: /data-rs-lazy/.test(panel) && !/rs-stage/.test(panel), eager: /rs-stage/.test(dl), built: !!host.querySelector('.rs .rs-stage svg') };
  });
  expect(r.player).toBe(true);
  expect(r.stage).toBe(true);
  expect(r.phases).toBe(4);
  expect(r.lazy, 'a list of 1,900 exercises must not build 1,900 players').toBe(true);
  expect(r.eager).toBe(true);
  expect(r.built).toBe(true);
});

test('feat 624 — the map shows five names and the other neighbours take turns', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = FAMILIES.find(f => f.id === 'squat').variations[0].uuid, d = document.createElement('div'); d.innerHTML = constellationPeekHtml(u, 24);
    const tw = [...d.querySelectorAll('text.cpk-tw')], delays = new Set(tw.map(x => x.style.animationDelay));
    return { nodes: d.querySelectorAll('.cpk-node').length, fixed: d.querySelectorAll('text:not(.cpk-tw)').length, tw: tw.length, turns: delays.size };
  });
  expect(r.nodes).toBe(25);
  expect(r.fixed).toBe(5);
  expect(r.tw).toBe(20);
  expect(r.turns, 'five groups, one after the other').toBe(5);
});

test('feat 625 — the GIF encoder writes a file the browser reads back, timed to the rep', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const pal = new Uint8Array(768); [[20, 20, 20], [255, 0, 0], [0, 255, 0], [0, 0, 255]].forEach((c, i) => pal.set(c, i * 3));
    const w = 40, h = 30, mk = (k) => { const a = new Uint8Array(w * h); for (let i = 0; i < a.length; i++) a[i] = ((i % w) + Math.floor(i / w) + k) % 4; return a; };
    const bytes = rsGifEncode(w, h, [{ idx: mk(0), delay: 10 }, { idx: mk(1), delay: 20 }, { idx: mk(2), delay: 30 }], pal), blob = new Blob([bytes], { type: 'image/gif' });
    const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode();
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); const px = cx.getImageData(1, 0, 1, 1).data;
    const spec = RS_MOTIONS['plank']('none', {}), times = rsGifTimes(spec, 15, 1), total = times.reduce((a, x) => a + x[1], 0) / 100, curl = rsGifTimes(RS_MOTIONS['biceps-curl']('dumbbell', {}), 15, 0.5);
    return { head: String.fromCharCode(...bytes.slice(0, 6)), w: img.naturalWidth, h: img.naturalHeight, px: [px[0], px[1], px[2]], total, T: rsTotal(spec), holdFrames: times.length, slow: curl.reduce((a, x) => a + x[1], 0) / 100 };
  });
  expect(r.head).toBe('GIF89a');
  expect([r.w, r.h]).toEqual([40, 30]);
  expect(r.px, 'pixel (1,0) of frame 1 is palette entry 1').toEqual([255, 0, 0]);
  expect(Math.abs(r.total - r.T), 'the loop lasts exactly one rep').toBeLessThan(0.01);
  expect(r.holdFrames, 'a 30 s hold is one long frame, not 450').toBeLessThan(60);
  expect(r.slow).toBeCloseTo(9.2, 1);
});

test('feat 625 — the wizard: views, options, make, preview and download', async ({ page }) => {
  test.slow();
  const r = await page.evaluate(async () => {
    const u = FAMILIES.find(f => f.id === 'bicep-curl').variations[0].uuid; openMotionCarousel(u);
    const el = document.querySelector('#motion-modal .rs'), q = s => el.querySelector(s), click = s => q(s).click();
    click('[data-rs-gif]'); const step1 = q('.rs-wiz').textContent; click('[data-gv="side"]'); const two = el._gif.views.slice();
    click('[data-gl="row"]'); click('[data-gn]'); click('[data-gs="240"]'); click('[data-gf="10"]'); const sum = q('.rs-wsum').textContent;
    let saved = null; const real = window.downloadBlob; window.downloadBlob = (b, n) => { saved = { n, size: b.size }; };
    click('[data-gm]');
    for (let i = 0; i < 600 && !q('.rs-wout img'); i++) await new Promise(res => setTimeout(res, 100));
    const img = q('.rs-wout img'); if (img) await img.decode(); click('[data-gd="0"]'); window.downloadBlob = real;
    return { step1: /Which views/.test(step1), two, sum, img: !!img, w: img && img.naturalWidth, name: saved && saved.n, size: saved && saved.size, playing: el.dataset.playing };
  });
  expect(r.step1).toBe(true);
  expect(r.two).toEqual(['side', 'three']);
  expect(r.sum).toContain('1 file');
  expect(r.img).toBe(true);
  expect(r.w, 'two views side by side at 240 px each').toBe(480);
  expect(r.name).toMatch(/-views-\d{4}-\d{2}-\d{2}\.gif$/);
  expect(r.size).toBeGreaterThan(20000);
  expect(r.playing, 'the player resumes').toBe('1');
});
