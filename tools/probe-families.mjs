// Throwaway probe (feat 196) — dump FAMILIES ids/megas/subs + variation ids/uuids so seed plans
// can be authored against REAL identifiers (feat-175 lesson: truncated/guessed uuids silently no-op).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const srv = spawn(process.execPath, ['test/serve.mjs', '4329'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4329/gym-tracker.html', { waitUntil: 'load' });
await page.waitForFunction(() => typeof FAMILIES !== 'undefined' && typeof exMode === 'function', null, { timeout: 15000 });
const data = await page.evaluate(() => ({
  megas: [...new Set(FAMILIES.map(f => f.mega))],
  families: FAMILIES.map(f => ({ id: f.id, name: f.name, mega: f.mega, sub: f.sub || '', n: (f.variations || []).length })),
  detail: FAMILIES.filter(f => ['mobility', 'cardio', 'recovery', 'core', 'other'].includes(f.mega) || ['grip-training', 'neck-training', 'jaw-training', 'climbing', 'iso-poses', 'mobility-warmup', 'static-stretch'].includes(f.id))
    .map(f => ({ id: f.id, mega: f.mega, vars: (f.variations || []).map(v => ({ id: v.id, uuid: v.uuid, title: v.title, mode: (exMode(v.uuid) || {}).mode })) })),
}));
writeFileSync('tools/probe-families.json', JSON.stringify(data, null, 1));
console.log('megas:', data.megas.join(', '));
console.log('families:', data.families.length);
await browser.close();
srv.kill();
process.exit(0);
