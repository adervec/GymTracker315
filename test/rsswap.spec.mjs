// feat 634 — two overlapping shapes that pass each other in depth cross-fade over a fifth of a second instead of
// changing places in one frame.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof rsSmoothOrder === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 634 — a swap leaves a fading copy of the shape that went behind', async ({ page }) => {
  const r = await page.evaluate(() => {
    const A = '<ellipse class="rs-a" cx="50" cy="50" rx="10" ry="10"/>', B = '<path class="rs-b" d="M45 45 L70 45 L70 70 Z"/>', FAR = '<ellipse class="rs-c" cx="200" cy="200" rx="5" ry="5"/>';
    const run = (spec, t, a, b, c) => rsSmoothOrder(spec, t, 'side', 'm', [{ depth: a, svg: A, id: 'rs-a#1' }, { depth: b, svg: B, id: 'rs-b#1' }, { depth: c, svg: FAR, id: 'rs-c#1' }]);
    const s = { phases: [{ sec: 4 }] }, out = {};
    out.first = run(s, 0, 1, 2, 0);                      // A under B, nothing to remember yet
    out.swap = run(s, 0.05, 2, 1, 0);                    // B went under A: at this instant its copy on top is solid
    out.half = run(s, 0.15, 2, 1, 0);
    out.done = run(s, 0.27, 2, 1, 0);
    out.far = run(s, 0.3, 2, 1, 3);                      // C passes both but touches neither
    const j = { phases: [{ sec: 4 }] }; run(j, 0, 1, 2, 0); out.jump = run(j, 2, 2, 1, 0);   // a scrub: no memory
    const k = { phases: [{ sec: 4 }] }; run(k, 3.98, 1, 2, 0); out.loop = run(k, 0.02, 2, 1, 0);   // the loop's seam is continuous
    return out; });
  const A = '<ellipse class="rs-a"', B = '<path class="rs-b"';
  expect(r.first.indexOf(A)).toBeLessThan(r.first.indexOf(B)); expect(r.first).not.toContain('opacity');
  expect(r.swap.startsWith('<ellipse class="rs-c"')).toBe(true);
  expect(r.swap).toMatch(/rs-b.*rs-a.*<clipPath id="[^"]+"><ellipse class="rs-a"[^>]*><\/clipPath><g clip-path="url\(#[^"]+\)" opacity="1\.000"><path class="rs-b"/);
  expect(r.half).toMatch(/opacity="0\.500"><path class="rs-b"/);
  expect(r.done).not.toContain('opacity');
  expect(r.far).not.toContain('opacity');
  expect(r.jump).not.toContain('opacity');
  expect(r.loop).toContain('opacity="1.000"><path class="rs-b"');
});

test('feat 635 — a shape keeps its name when another of its kind appears before it, so its swap still fades', async ({ page }) => {
  const r = await page.evaluate(() => {
    const A = '<ellipse class="rs-a" cx="50" cy="50" rx="10" ry="10"/>', B = '<path class="rs-b" d="M45 45 L70 45 L70 70 Z"/>', NEW = '<ellipse class="rs-a" cx="300" cy="300" rx="5" ry="5"/>';
    const s = { phases: [{ sec: 4 }] };
    rsSmoothOrder(s, 0, 'side', 'm', [{ depth: 1, svg: A, id: 'rs-a#1' }, { depth: 2, svg: B, id: 'rs-b#1' }]);
    // a new rs-a is drawn first, so the old one is now the second of its kind; in the same frame it passes in front of B
    return rsSmoothOrder(s, 0.05, 'side', 'm', [{ depth: 0, svg: NEW, id: 'rs-a#1' }, { depth: 2, svg: A, id: 'rs-a#2' }, { depth: 1, svg: B, id: 'rs-b#1' }]); });
  expect(r).toMatch(/<clipPath id="[^"]+"><ellipse class="rs-a" cx="50"[^>]*><\/clipPath><g clip-path="url\(#[^"]+\)" opacity="1\.000"><path class="rs-b"/);
  expect((r.match(/<g clip-path=/g) || []).length).toBe(1);
});

test('feat 634 — a real animation still draws every frame, and its swaps fade', async ({ page }) => {
  const r = await page.evaluate(() => { const spec = RS_MOTIONS['nordic']('none', {}); spec.rig = true; spec.equip = 'none'; rsApplyMods(spec, {});
    let ghosts = 0, bad = 0; const T = rsTotal(spec); for (let i = 0; i <= T * 30; i++) { const s = rsStageSvg(spec, i / 30, 'three', { path: false }); if (!/^<svg/.test(s) || /NaN|undefined/.test(s)) bad++; ghosts += (s.match(/<g clip-path=/g) || []).length; }
    return { ghosts, bad }; });
  expect(r.bad).toBe(0); expect(r.ghosts).toBeGreaterThan(0);
});
