// feat 290 — mandatory top branding now carries the current profile name + (when cloud-synced) the account
// avatar. A synced cloud account force-locks the profile name to the account name; the synced account (name +
// avatar) also shows in the Data sync card. The avatar fetch itself is best-effort OAuth (untested offline);
// here we drive the pure UI/lock logic by injecting state.cloudSync.account.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof effectiveProfileName === 'function' && typeof profileNameLocked === 'function'
    && typeof refreshIdentity === 'function' && typeof cloudActive === 'function' && typeof cloudSyncCardHtml === 'function'
    && typeof navTo === 'function', null, { timeout: 15000 });
});

const setCloudAccount = (page, account) => page.evaluate((account) => {
  state.cloudSync = { provider: 'google', enabled: true, lastSync: null, lastError: null, perProvider: {}, syncOnEnd: true, account };
}, account);

test('feat 290 — without cloud, identity uses the manual profile name and is not locked', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.cloudSync = { provider: null, enabled: false };
    state.profile.name = 'Sam';
    return { name: effectiveProfileName(), locked: profileNameLocked(), pic: cloudAccountPic() };
  });
  expect(r.name).toBe('Sam');
  expect(r.locked).toBe(false);
  expect(r.pic).toBeNull();
});

test('feat 290 — a synced cloud account locks the profile name and provides the avatar', async ({ page }) => {
  await setCloudAccount(page, { name: 'Jane Lifter', email: 'jane@example.com', picture: 'https://example.com/p.png' });
  const r = await page.evaluate(() => {
    state.profile.name = 'Old Name';
    return { active: cloudActive(), name: effectiveProfileName(), locked: profileNameLocked(), pic: cloudAccountPic(), acctName: cloudAccountName() };
  });
  expect(r.active).toBe(true);
  expect(r.name).toBe('Jane Lifter');     // overrides the manual profile name
  expect(r.locked).toBe(true);
  expect(r.pic).toBe('https://example.com/p.png');
  expect(r.acctName).toBe('Jane Lifter');
});

test('feat 290 — refreshIdentity renders the avatar + name + lock into the top bar', async ({ page }) => {
  await setCloudAccount(page, { name: 'Jane Lifter', picture: 'https://example.com/p.png' });
  const r = await page.evaluate(() => {
    refreshIdentity();
    const el = document.getElementById('app-identity');
    return { shown: el.style.display !== 'none', hasImg: !!el.querySelector('img.ti-pfp'), name: el.querySelector('.ti-name')?.textContent, lock: !!el.querySelector('.ti-lock') };
  });
  expect(r.shown).toBe(true);
  expect(r.hasImg).toBe(true);
  expect(r.name).toBe('Jane Lifter');
  expect(r.lock).toBe(true);
});

test('feat 363 — identity, brand and live stats never overlap (even with a long name + live stats)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.cloudSync = { provider: null, enabled: false };
    state.profile.name = 'Maximilian Featherstonehaugh III';   // a deliberately long name
    refreshIdentity();
    // force the right-hand live track to render too (HR + elapsed)
    const live = document.getElementById('topbar-live');
    live.innerHTML = '<span class="tbl-hr">💓<b>148</b></span><span class="tbl-elapsed">⏱<b>1:02:33</b></span>';
    document.body.classList.add('has-topbar-live');
    const rect = id => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width }; };
    const out = { id: rect('app-identity'), brand: rect('app-brand-btn'), live: rect('topbar-live') };
    document.body.classList.remove('has-topbar-live'); live.innerHTML = '';
    return out;
  });
  // left-to-right, no horizontal overlap between the three tracks (a 0.5px fudge for sub-pixel rounding)
  expect(r.id.r).toBeLessThanOrEqual(r.brand.l + 0.5);
  expect(r.brand.r).toBeLessThanOrEqual(r.live.l + 0.5);
  expect(r.brand.w).toBeGreaterThan(0);   // the brand still has width (wasn't squeezed to nothing)
});

test('feat 290 — the Profile page disables the name input and shows a lock note when cloud-synced', async ({ page }) => {
  await setCloudAccount(page, { name: 'Jane Lifter', picture: '' });
  const r = await page.evaluate(() => {
    navTo('set-profile');
    const inp = document.querySelector('#trk-main #prof-name');
    return { disabled: !!(inp && inp.disabled), value: inp ? inp.value : null, hasLockNote: /Locked to your synced/.test(document.getElementById('trk-main').innerHTML) };
  });
  expect(r.disabled).toBe(true);
  expect(r.value).toBe('Jane Lifter');
  expect(r.hasLockNote).toBe(true);
});

test('feat 290 — the Data sync card shows the synced account name, email and avatar', async ({ page }) => {
  await setCloudAccount(page, { name: 'Jane Lifter', email: 'jane@example.com', picture: 'https://example.com/p.png' });
  const html = await page.evaluate(() => cloudSyncCardHtml());
  expect(html).toContain('Jane Lifter');
  expect(html).toContain('jane@example.com');
  expect(html).toContain('https://example.com/p.png');
  expect(html).toContain('locked to this account');
});

test('feat 377 — clicking the synced account name opens the Profile page (the topbar identity already does too)', async ({ page }) => {
  await setCloudAccount(page, { name: 'Jane Lifter', email: 'jane@example.com', picture: 'https://example.com/p.png' });
  const r = await page.evaluate(() => {
    // the Data card account row is a profile link
    const cardLinks = /onclick="navTo\('set-profile'\)"/.test(cloudSyncCardHtml());
    // and the topbar identity navigates there on click
    state.profile = state.profile || {}; state.profile.name = 'Jane Lifter'; refreshIdentity();
    navTo('workout', { replace: true });
    document.getElementById('app-identity').click();
    return { cardLinks, topbarPage: currentPage };
  });
  expect(r.cardLinks).toBe(true);       // the synced username row links to Profile
  expect(r.topbarPage).toBe('set-profile'); // the topbar username also goes to Profile
});
