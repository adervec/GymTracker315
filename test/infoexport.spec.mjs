// feat 216 — info pack export: a branded, dated, build-stamped, fully-disclaimed HTML document of the
// app's information sections (Help / About / Quick reference / Coaching guides / Glossary), all or a
// subset, downloadable as a self-contained file or printed to PDF via the feat-133 print-root path.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildInfoExportHtml === 'function' && typeof exportInfoPack === 'function', null, { timeout: 15000 });
});

test('the full document is branded, dated, build-stamped and fully disclaimed', async ({ page }) => {
  const r = await page.evaluate(() => {
    const html = buildInfoExportHtml();
    return {
      len: html.length,
      doctype: html.startsWith('<!DOCTYPE html>'),
      brand: html.includes('Gym<b>Tracker</b><sup>315</sup>'),
      build: html.includes(APP_BUILD.replace(/&/g, '&amp;')),
      dated: /Information pack · generated /.test(html),
      sections: ['❓ Help', 'ℹ️ About', '📋 Quick reference', '🧭 Coaching guides', '📖 Glossary'].every(h => html.includes(h)),
      disclaimed: html.includes('Not professional advice') && html.includes('No warranty') && html.includes('Trademarks'),
      footer: html.includes('this document is informational only'),
    };
  });
  expect(r.doctype).toBe(true);
  expect(r.brand).toBe(true);
  expect(r.build).toBe(true);
  expect(r.dated).toBe(true);
  expect(r.sections).toBe(true);
  expect(r.disclaimed).toBe(true);  // fully disclaimed…
  expect(r.footer).toBe(true);      // …top and bottom
  expect(r.len).toBeGreaterThan(40000); // a real document, glossary and all
});

test('a subset export keeps ONLY the picked sections — but always the disclaimers', async ({ page }) => {
  const r = await page.evaluate(() => {
    const html = buildInfoExportHtml(['glossary']);
    return {
      gloss: html.includes('📖 Glossary'),
      help: html.includes('<h2>❓ Help</h2>'),
      coach: html.includes('<h2>🧭 Coaching guides</h2>'),
      disclaimed: html.includes('Not professional advice'),
      term: html.includes('1RM'),
    };
  });
  expect(r.gloss).toBe(true);
  expect(r.help).toBe(false);
  expect(r.coach).toBe(false);
  expect(r.disclaimed).toBe(true);  // the legal section is not optional
  expect(r.term).toBe(true);        // real glossary content rode along
});

test('each section carries its real content (help text, family cues, coaching cards)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const html = buildInfoExportHtml(['help', 'quickref', 'coaching']);
    const fam = exercises[0];
    return {
      help: html.includes('beat last session') || html.includes('Logging a set'),
      fam: html.includes(fam.title),
      coach: html.includes(COACHING[0].title),
      counts: new RegExp(exercises.length + ' movements').test(html),
    };
  });
  expect(r.help).toBe(true);
  expect(r.fam).toBe(true);
  expect(r.coach).toBe(true);
  expect(r.counts).toBe(true); // the as-of count/timestamp metadata
});

test('the Data page UI: all picks checked by default; export downloads with the dated filename', async ({ page }) => {
  const r = await page.evaluate(() => {
    window._dl = null;
    window.downloadText = (text, fn, mime) => { window._dl = { len: text.length, fn, mime }; };
    renderSettingsDrawer();
    const boxes = [...document.querySelectorAll('#info-export-picks [data-info-sec]')];
    const allChecked = boxes.length === INFO_EXPORT_SECTIONS.length && boxes.every(b => b.checked); // default: ALL
    boxes.find(b => b.dataset.infoSec === 'help').checked = false;
    boxes.find(b => b.dataset.infoSec === 'glossary').checked = false;
    document.querySelector('#settings-drawer-body #info-export-html-btn').click();
    return { count: boxes.length, allChecked, picks: _infoExportPicks(), dl: window._dl };
  });
  expect(r.count).toBe(7);            // help · about · quickref · reference · briefs · coaching · glossary
  expect(r.allChecked).toBe(true);    // default is all-on
  expect(r.picks).toEqual(['about', 'quickref', 'reference', 'briefs', 'coaching']);
  expect(r.dl.fn).toMatch(/^gymtracker315-info-\d{4}-\d{2}-\d{2}\.html$/);
  expect(r.dl.mime).toContain('text/html');
  expect(r.dl.len).toBeGreaterThan(5000);
});

test('feat 366 — the full exercise reference + coach brief transcripts are selectable sections (default all)', async ({ page }) => {
  const r = await page.evaluate(() => {
    // a variation with rich docs + a buildable brief
    const fam = exercises.find(e => e.id === 'chest-fly');
    const v = fam.variations.find(x => x.id === 'freemotion-chest-fly');
    const full = buildInfoExportHtml();                              // default = everything
    const refOnly = buildInfoExportHtml(['reference']);
    const briefsOnly = buildInfoExportHtml(['briefs']);
    const built = (typeof variationPodcast === 'function') ? variationPodcast(v.uuid) : null;
    // the brief transcript is HTML-escaped in the doc, so compare against the app's own escapeHtml output
    const briefChunk = built ? escapeHtml(built.segs[0].text).slice(0, 40) : null;
    return {
      hasRefHead: full.includes('📚 Full exercise reference'),
      hasBriefHead: full.includes('🎧 Coach brief transcripts'),
      // the full reference carries the rich docs (a setup/movement bullet), not just the title
      refHasDetail: refOnly.includes(v.title) && /Setup|Movement/.test(refOnly),
      // the briefs section carries the spoken transcript text + the variation title + the coach label
      briefHasTranscript: !!built && briefsOnly.includes(briefChunk) && briefsOnly.includes(escapeHtml(built.title)) && briefsOnly.includes('coach</span>'),
      refExcludesBriefs: refOnly.includes('📚 Full exercise reference') && !refOnly.includes('🎧 Coach brief transcripts'),
    };
  });
  expect(r.hasRefHead).toBe(true);
  expect(r.hasBriefHead).toBe(true);
  expect(r.refHasDetail).toBe(true);
  expect(r.briefHasTranscript).toBe(true);
  expect(r.refExcludesBriefs).toBe(true);
});

test('the print path stages the document in #print-root and calls print()', async ({ page }) => {
  const r = await page.evaluate(() => {
    window._printed = false;
    window.print = () => { window._printed = true; };
    printInfoPack(['about']);
    const pr = document.getElementById('print-root');
    const staged = pr && pr.innerHTML.includes('Gym<b>Tracker</b>') && pr.innerHTML.includes('Not professional advice');
    const printingOn = document.body.classList.contains('printing');
    window.dispatchEvent(new Event('afterprint'));
    return { printed: window._printed, staged, printingOn, cleaned: !document.body.classList.contains('printing') };
  });
  expect(r.printed).toBe(true);
  expect(r.staged).toBe(true);
  expect(r.printingOn).toBe(true);
  expect(r.cleaned).toBe(true);
});
