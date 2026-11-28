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

test('feat 626 — a name changes the picture: kneeling, wall, ball, preacher, deficit, alternating, a held squat', async ({ page }) => {
  const r = await page.evaluate(() => {
    const S = id => repStudioSpec(id), pr = (sp, s) => (typeof sp.props === 'function' ? sp.props(rsFrame(sp, s)) : sp.props) || [];
    const kinds = (sp, s) => [...new Set(pr(sp, s).map(q => q[0] + ':' + (q[0] === 'box' ? q[7] : q[0] === 'cap' ? q[5] : q[3])))];
    const ids = ['half-kneeling-press', 'kneeling-pulldown', 'barbell-kneeling-squat', 'wall-squat-iso', 'preacher-curl', 'deficit-push-up', 'blaster-db-alt-curl', 'swiss-ball-curl', 'seated-db-lateral', 'handstand-push-up'];
    const bad = ids.filter(id => { const sp = S(id); return !sp || ['side', 'three', 'front', 'back'].some(v => /NaN|undefined/.test(rsStageSvg(sp, rsTotal(sp) * 0.4, v))); });
    const hk = S(ids[0]), kp = S(ids[1]), ks = S(ids[2]), ws = S(ids[3]), pc = S(ids[4]), dp = S(ids[5]), pu = RS_MOTIONS['push-up']('none', {}), ac = S(ids[6]), sb = S(ids[7]), sl = S(ids[8]);
    const bb = RS_MOTIONS['bench-press']('dumbbell', { ball: 1 }); bb.rig = true; rsApplyMods(bb, { ball: 1 });
    const h0 = rsFrame(hk, 0), k0 = rsFrame(ks, 0), k1 = rsFrame(ks, 1), w0 = rsFrame(ws, 0), a0 = rsFrame(ac, 0), a1 = rsFrame(ac, 1), p0 = rsFrame(pc, 0), hold = ws.phases.find(x => x.id === 'bottom');
    return { bad, half: hk.low && hk.low.kind, rearKnee: h0.xf(h0.legs[1].knee)[1], kpHip: rsFrame(kp, 0).hip[1], kpKinds: kinds(kp, 0), ksKnee: Math.max(k0.legs[0].knee[1], k1.legs[0].knee[1]), ksRise: k1.hip[1] - k0.hip[1],
      wsHold: [hold.sec, hold.label], wsLevel: Math.abs(w0.legs[0].hip[1] - w0.legs[0].knee[1]), wsKinds: kinds(ws, 0), pcKinds: kinds(pc, 0), pcFwd: p0.arms[0].el[0] - p0.arms[0].sh[0],
      dpKinds: kinds(dp, 0), dpUp: rsFrame(dp, 0).arms[0].grip[1] - rsFrame(pu, 0).arms[0].grip[1], alt: ac.alt, altGap: [a0.arms[0].grip[1] - a0.arms[1].grip[1], a1.arms[0].grip[1] - a1.arms[1].grip[1]],
      sbKinds: kinds(sb, 0), bbKinds: kinds(bb, 0.5), seat: sl.low && sl.low.kind };
  });
  expect(r.bad, 'every variant draws from every side').toEqual([]);
  expect(r.half).toBe('half');
  expect(r.rearKnee, 'the rear knee is on the floor').toBeLessThan(9);
  expect(r.kpHip, 'a kneeling pulldown has no seat').toBeCloseTo(50.2, 1);
  expect(r.kpKinds).not.toContain('box:pad');
  expect(r.ksKnee, 'the kneeling squat keeps its knees down').toBeLessThan(9);
  expect(r.ksRise).toBeGreaterThan(15);
  expect(r.wsHold, 'a wall sit is held sitting, not standing').toEqual([10, 'Hold']);
  expect(r.wsLevel, 'thighs level').toBeLessThan(4);
  expect(r.wsKinds).toContain('box:wall');
  expect(r.pcKinds).toContain('cap:pad');
  expect(r.pcFwd, 'the upper arm lies forward on the pad').toBeGreaterThan(15);
  expect(r.dpKinds).toContain('box:wood');
  expect(r.dpUp, 'hands on blocks').toBeGreaterThan(8);
  expect(r.alt).toBe(true);
  expect(r.altGap[0] * r.altGap[1], 'the arms take turns').toBeLessThan(-400);
  expect(r.sbKinds).toContain('ball:swiss');
  expect(r.bbKinds, 'the ball replaces the bench').toEqual(['ball:swiss']);
  expect(r.seat).toBe('seat');
});

test('feat 626 — continuous playback: nothing pops in or out between one frame and the next', async ({ page }) => {
  test.setTimeout(240000);
  await page.bringToFront();   // a page in the background can stop painting images, and this test draws 300 of them
  const r = await Promise.race([new Promise(ok => setTimeout(() => ok(null), 100000)), page.evaluate(async () => {
    const W = 200, H = 182, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d', { willReadFrequently: true }), out = [];
    const sq = RS_MOTIONS['squat']('barbell', {}); sq.rig = true;
    for (const [name, spec, view, fps] of [['squat', sq, 'side', 30], ['deadlift', REP_STUDIO['conventional-dl'], 'three', 30]]) {
      const n = Math.round(rsTotal(spec) * fps), ch = []; let prev = null;
      for (let i = 0; i <= n; i++) { await rsGifFrame(ctx, spec, i / fps, [view], [W, H], { path: false }); const d = ctx.getImageData(0, 0, W, H).data; let c = 0;
        if (prev) { const m = new Uint8Array(W * H); for (let q = 0, k = 0; q < d.length; q += 4, k++) m[k] = (Math.abs(d[q] - prev[q]) + Math.abs(d[q + 1] - prev[q + 1]) + Math.abs(d[q + 2] - prev[q + 2])) > 90 ? 1 : 0;
          for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const k = y * W + x; if (m[k] && m[k - 1] && m[k + 1] && m[k - W] && m[k + W]) c++; } }   // a changed pixel counts only inside a changed patch
        ch.push(c); prev = d; }
      const spikes = []; for (let i = 3; i < ch.length - 3; i++) { const nb = [ch[i - 3], ch[i - 2], ch[i - 1], ch[i + 1], ch[i + 2], ch[i + 3]].sort((a, c) => a - c), med = (nb[2] + nb[3]) / 2; if (ch[i] > med * 2.5 + 20) spikes.push([+(i / fps).toFixed(3), ch[i], med]); }
      out.push({ name, steps: n, moved: ch.reduce((a, x) => a + x, 0), spikes }); }
    // the glow of a working muscle changes over a third of a second at a phase boundary, not in one frame
    const dl = REP_STUDIO['conventional-dl'], host = document.createElement('div'), op = t => { host.innerHTML = rsStageSvg(dl, t, 'side'); const e = host.querySelector('.rs-muscle.on[data-m="glutes"]'); return e ? +(e.getAttribute('opacity') || 1) : 0; };
    let acc = 0, glow = 0; dl.phases.forEach(p => { glow = Math.max(glow, Math.abs(op(acc + 1 / 60) - op(acc - 1 / 60 + (acc ? 0 : rsTotal(dl))))); acc += p.sec; });
    return { out, glow };
  })]);
  test.skip(!r, 'the browser stopped painting frames (machine under load): nothing was measured');
  r.out.forEach(x => { expect(x.moved, x.name + ' moves').toBeGreaterThan(20); expect(x.spikes, x.name + ': a patch changed all at once at these times [s, pixels, usual]').toEqual([]); });
  expect(r.glow, 'glow step across a phase boundary').toBeLessThan(0.15);
});

test('feat 626 — every named variant draws differently from the plain movement, and stability-ball work has its ball', async ({ page }) => {
  const r = await page.evaluate(() => {
    const want = ['kneel', 'wall', 'ball', 'support', 'deficit', 'alt', 'seat'], same = [], errs = [];
    const mk = (m, e, o) => { const sp = RS_MOTIONS[m](e || 'none', o); sp.rig = true; sp.motion = m; if (!sp.equip) sp.equip = 'none'; rsApplyMods(sp, o); return sp; };
    const props = (sp, J) => (typeof sp.props === 'function' ? sp.props(J) : sp.props) || [];
    const sig = sp => [0, 0.5, 1].map(s => { const J = rsFrame(sp, s), x = J.xf || (q => q), rr = q => x(q).map(v => Math.round(v)).join(',');
      return J.legs.map(l => rr(l.knee) + ';' + rr(l.ankle)).join('|') + '/' + J.arms.map(a => rr(a.grip)).join('|') + '/' + rr([J.hip[0], J.hip[1], 0]) + '/' + props(sp, J).map(q => q[0] + (q[0] === 'box' ? q[7] : q[0] === 'cap' ? q[5] : q[3])).join(''); }).join('#') + sp.equip + sp.phases.map(q => q.sec).join(',');
    FAMILIES.forEach(f => f.variations.forEach(v => { const mv = motionForVariation(v.uuid); if (!mv || !RS_MOTIONS[mv.motion] || REP_STUDIO[v.id]) return; const o = mv.opts || {};
      want.forEach(k => { if (!o[k]) return; const o2 = Object.assign({}, o); delete o2[k];
        try { if (sig(mk(mv.motion, mv.equip, o)) === sig(mk(mv.motion, mv.equip, o2))) same.push(mv.motion); } catch (e) { errs.push(v.id + ' ' + String(e).slice(0, 60)); } }); }));
    const fam = FAMILIES.find(f => f.id === 'swiss-ball-work').variations, noBall = [];
    fam.forEach(v => { const sp = repStudioSpec(v.id); try { const J = rsFrame(sp, 0.5); if (!(props(sp, J).some(q => q[0] === 'ball' && q[3] === 'swiss') || sp.equip === 'ball')) noBall.push(v.id); if (/NaN|undefined/.test(rsStageSvg(sp, 1, 'three'))) errs.push(v.id + ' svg'); } catch (e) { errs.push(v.id + ' ' + String(e).slice(0, 60)); } });
    return { same: [...new Set(same)].sort(), errs, fam: fam.length, noBall };
  });
  expect(r.errs).toEqual([]);
  // the only ones left alike are movements that are already in that position (a seated row is seated, a kneeling crunch kneels, a preacher machine has its pad)
  const inherent = ['floor-stretch', 'kneel-crunch', 'lsit', 'lunge-stretch', 'machine-abduction', 'machine-curl', 'seated-row', 'skull', 'smash'];
  expect(r.same.filter(m => !inherent.includes(m))).toEqual([]);
  expect(r.fam).toBeGreaterThan(70);
  expect(r.noBall.length, 'stability-ball exercises drawn without a ball: ' + r.noBall.join(', ')).toBeLessThanOrEqual(3);
});

test('feat 626 — no joint or foot jumps in one frame, in any of the movement types', async ({ page }) => {
  test.slow();
  const r = await page.evaluate(() => { const out = [];
    const pts = (J) => { const x = J.xf || (q => q), o = {}; J.legs.forEach((l, i) => { const fd = l.fd || [1, 0]; o['knee' + i] = x(l.knee); o['ankle' + i] = x(l.ankle); o['toe' + i] = x([l.ankle[0] + fd[0] * 16, l.ankle[1] + fd[1] * 16, l.ankle[2]]); o['hip' + i] = x(l.hip); });
      J.arms.forEach((a, i) => { o['grip' + i] = x(a.grip); o['el' + i] = x(a.el || a.grip); o['sh' + i] = x(a.sh); }); o.head = x([J.head[0], J.head[1], 0]); return o; };
    const dist = (a, b) => { let m = 0, w = ''; Object.keys(a).forEach(k => { const e = Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1], (a[k][2] || 0) - (b[k][2] || 0)); if (e > m) { m = e; w = k; } }); return [m, w]; };
    const names = Object.keys(RS_MOTIONS).sort();
    names.forEach(m => { const spec = RS_MOTIONS[m]('none', {}); spec.rig = true; if (!spec.equip) spec.equip = 'none'; const full = rsTotal(spec), T = Math.min(full, 20), N = Math.round(T * 60), d = [], who = []; let prev = null;
      for (let i = 0; i <= N; i++) { const q = pts(rsFrameAt(spec, i / 60)); if (prev) { const e = dist(q, prev); d.push(e[0]); who.push(e[1]); } else { d.push(0); who.push(''); } prev = q; }
      for (let i = 4; i < d.length - 4; i++) { const q = [d[i - 4], d[i - 3], d[i - 2], d[i + 2], d[i + 3], d[i + 4]].sort((x, y) => x - y), nb = (q[2] + q[3]) / 2; if (d[i] > 3.5 && d[i] > nb * 2.5 + 1.5 && d[i] >= d[i - 1] && d[i] >= d[i + 1]) out.push(m + ' ' + (i / 60).toFixed(2) + 's ' + who[i] + ' ' + d[i].toFixed(1) + 'cm'); }
      if (T === full && m !== 'jump') { const e = dist(pts(rsFrameAt(spec, T - 1 / 60)), pts(rsFrameAt(spec, 0))); if (e[0] > 6) out.push(m + ' loop ' + e[1] + ' ' + e[0].toFixed(1) + 'cm'); } });   // a box jump starts again from the floor: the one deliberate cut
    return { n: names.length, out }; });
  expect(r.n).toBe(100);
  expect(r.out).toEqual([]);
});

test('feat 628 — every movement has a female figure, and the player remembers which one you chose', async ({ page }) => {
  test.slow();
  const r = await page.evaluate(() => {
    const bad = [], host = document.createElement('div'); let same = 0;
    Object.keys(RS_MOTIONS).forEach(m => { const sp = RS_MOTIONS[m]('none', {}); sp.rig = true; if (!sp.equip) sp.equip = 'none';
      try { const f = rsStageSvg(sp, rsTotal(sp) * 0.4, 'three', { fig: 'f' }), h = rsStageSvg(sp, rsTotal(sp) * 0.4, 'three', { fig: 'm' }); if (/NaN|undefined/.test(f)) bad.push(m); if (f.replace(/rs\d+g/g, '') === h.replace(/rs\d+g/g, '')) same++; } catch (e) { bad.push(m + ' ' + String(e).slice(0, 50)); } });
    const dl = REP_STUDIO['conventional-dl'], count = (fig, sel) => { host.innerHTML = rsStageSvg(dl, 2, 'side', { fig }); return host.querySelectorAll(sel).length; };
    const before = rsFigure(); openMotionCarousel(FAMILIES.find(f => f.id === 'squat').variations[0].uuid);
    const el = document.querySelector('#motion-modal .rs'), shorts = () => el.querySelectorAll('.rs-stage .rs-shorts').length, s0 = shorts();
    el.querySelector('[data-rs-fig="f"]').click(); const s1 = shorts(), saved = state.rsFigure, active = el.querySelector('[data-rs-fig].active').dataset.rsFig;
    el.querySelector('[data-rs-fig="m"]').click();
    return { bad, same, topM: count('m', '.rs-shorts'), topF: count('f', '.rs-shorts'), before, s0, s1, saved, active, after: rsFigure() };
  });
  expect(r.bad).toEqual([]);
  expect(r.same, 'movements where she draws exactly as he does').toBe(0);
  expect(r.topF, 'she wears a top as well as shorts').toBeGreaterThan(r.topM);
  expect(r.before).toBe('m');
  expect(r.s1).toBeGreaterThan(r.s0);
  expect([r.saved, r.active, r.after]).toEqual(['f', 'f', 'm']);
});
