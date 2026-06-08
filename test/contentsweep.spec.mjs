// feat 172 — sweep for content that could be construed as encouraging illicit drug use / illegal activity.
// PED/steroid glossary entries are kept for awareness but neutralized: no glamorizing drug-stacking meme,
// and each carries an explicit health/legal caveat. The app's framing is natural, drug-free training.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test('the steroid/PED glossary is neutralized (no meme, with caveats)', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  const r = await page.evaluate(() => {
    const src = [...document.scripts].map(s => s.textContent).join('\n');
    return {
      noStackMeme: !/tren hard, eat clen/i.test(src),       // the drug-stacking catchphrase is gone
      hasLegalCaveat: /illegal without a prescription/i.test(src),
      hasNotRecommended: /not recommended|not endorsed/i.test(src),
      naturalFraming: /drug-free training|natural, drug-free/i.test(src),
      noLegalPedLabel: !/best:\s*'Legal PED'/.test(src),    // caffeine no longer framed as a "PED"
    };
  });
  expect(r.noStackMeme).toBe(true);
  expect(r.hasLegalCaveat).toBe(true);
  expect(r.hasNotRecommended).toBe(true);
  expect(r.naturalFraming).toBe(true);
  expect(r.noLegalPedLabel).toBe(true);
});
