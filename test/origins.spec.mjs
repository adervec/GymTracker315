// feat 614 — every exercise says where it comes from (its own origin when it has a known history, else its
// movement's), and the tips and reference carry links to search the web for it.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exerciseOrigin === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 614 — every exercise has an origin; named lifts get their own', async ({ page }) => {
  const r = await page.evaluate(() => {
    const none = []; let n = 0;
    FAMILIES.forEach(f => f.variations.forEach(v => { n++; const o = exerciseOrigin(v, f); if (!o || !o.sys) none.push(f.id + '/' + v.title); }));
    const of = title => { for (const f of FAMILIES) for (const v of f.variations) if (v.title === title) return exerciseOrigin(v, f); return null; };
    return { n, none, arnold: of('Seated Arnold Press'), rdl: of('Romanian Deadlift (RDL)'), pallof: of('Pallof Press'), zott: of('Zottman Curl'),
      curl: of('Barbell Curl'), ski: of('Cross-Country Skiing'), smithJm: of('Smith Machine JM Press'), fold: of('Seated Forward Fold'),
      families: FAMILIES.filter(f => !EX_ORIGIN_FAMILY[f.id]).map(f => f.id) };
  });
  expect(r.n).toBeGreaterThan(1900);
  expect(r.none).toEqual([]);
  expect(r.families).toEqual([]);                                   // every movement family has a fallback
  expect(r.arnold).toMatchObject({ level: 'exercise', by: 'Arnold Schwarzenegger' });
  expect(r.rdl.by).toContain('Nicu Vlad');
  expect(r.pallof.by).toContain('John Pallof');
  expect(r.zott.when).toBe('c. 1880s');
  expect(r.curl.level).toBe('movement');                            // no inventor to name: its movement's origin
  expect(r.ski.level).toBe('movement');                             // "Nordic" skiing is not a Nordic curl
  expect(r.smithJm.by).toBe('JM Blakley');                          // the lift wins over the machine
  expect(r.fold.sys).toBe('Hatha yoga');                            // read from its "Yoga •" line
});

test('feat 614 — the Full tab leads with the origin; the Tips tab and the reference offer a web and a video search', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = [...VAR_INDEX.entries()].find(([, i]) => i.variation.title === 'Zottman Curl')[0];
    pending = { varUuid: u, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.open = true; state.tipsExpanded = true; renderModal();
    const full = document.querySelector('[data-excar-slide="full"]'), tips = document.querySelector('[data-excar-slide="tips"]');
    const links = [...tips.querySelectorAll('.ex-search a')].map(a => ({ href: a.href, target: a.target, rel: a.rel }));
    const html = exerciseOriginHtml({ title: '<img src=x onerror=1>', best: '' }, { id: 'bicep-curl' });
    return { origin: (full.querySelector('.ex-origin') || {}).textContent || '', first: full.firstElementChild && full.firstElementChild.classList.contains('ex-origin'), links, safe: !/<img/.test(html) };
  });
  expect(r.origin).toContain('George Zottman');
  expect(r.origin).toContain('this exercise');
  expect(r.first).toBe(true);
  expect(r.links.length).toBe(2);
  expect(r.links[0].href).toContain('google.com/search?q=Zottman%20Curl%20exercise');
  expect(r.links[1].href).toContain('youtube.com/results?search_query=Zottman%20Curl%20exercise');
  expect(r.links.every(l => l.target === '_blank' && /noopener/.test(l.rel) && /noreferrer/.test(l.rel))).toBe(true);
  expect(r.safe).toBe(true);
});
