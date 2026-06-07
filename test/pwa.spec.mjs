// feat 93 — PWA: the app links a manifest + icons, the manifest is installable-shaped, and the
// service worker registers and caches the shell (offline-ready). Runs over http://127.0.0.1,
// which is a secure context, so the SW registers just like it would on https.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test('head wires up the PWA (manifest, theme-color, apple icons)', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBe('manifest.webmanifest');
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#0a0a0a');
  expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBe(1);
  expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')).toBe('yes');
});

test('manifest.webmanifest is valid and installable-shaped', async ({ page }) => {
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const mf = await res.json();
  expect(mf.name).toBeTruthy();
  expect(mf.display).toBe('standalone');
  expect(mf.start_url).toBeTruthy();
  const sizes = mf.icons.map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(mf.icons.some((i) => /maskable/.test(i.purpose || ''))).toBe(true);
});

test('service worker registers and caches the shell (offline-ready)', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  const state = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { ready: false, cached: false };
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(() => r(null), 8000)),
    ]);
    // give install/addAll a beat to populate the cache
    await new Promise((r) => setTimeout(r, 300));
    const keys = await caches.keys();
    return { ready: !!reg && !!reg.active, cached: keys.some((k) => k.startsWith('gt-cache-')) };
  });
  expect(state.ready, 'service worker becomes active').toBe(true);
  expect(state.cached, 'app shell is cached under gt-cache-*').toBe(true);
});
