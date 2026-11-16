import { chromium } from '@playwright/test';
for (const lang of process.argv.slice(2)) {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)); });
  await p.addInitScript((l) => { localStorage.setItem('maker-lang', l); localStorage.setItem('maker-mt-ack:' + l, '1'); }, lang);
  await p.goto('http://127.0.0.1:4321/gym-tracker.html'); await p.waitForFunction(() => typeof navTo === 'function' && VAR_INDEX.size > 0);
  await p.evaluate(() => appFont.ready); await p.waitForTimeout(400);
  for (const id of Object.keys(await p.evaluate(() => PAGES))) { await p.evaluate((id) => { try { navTo(id); } catch (e) { console.error('NAV ' + id + ' ' + e.message); } }, id); await p.waitForTimeout(100); }
  await p.evaluate(() => { try { openLogModal(); } catch (e) { console.error('MODAL ' + e.message); } }); await p.waitForTimeout(300);
  console.log(lang, 'errors:', errs.length ? errs : 'none'); await b.close();
}
