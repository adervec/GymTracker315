// tools/make-icons.mjs — generate the PWA PNG icons from a branded SVG, rasterized with the
// Playwright Chromium we already depend on (no new dependency). Re-run if the design changes.
//   node tools/make-icons.mjs
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ACCENT = '#b48aff';
const BG = '#0a0a0a';

// A simple dumbbell glyph centered in a 512 box, spanning x 130..382 / y 181..331 — small enough
// to sit inside the maskable safe zone (central 80%).
function glyph() {
  const plate = (x, w, h) => `<rect x="${x}" y="${256 - h / 2}" width="${w}" height="${h}" rx="6" fill="${ACCENT}"/>`;
  return [
    plate(130, 26, 150),  // left outer plate
    plate(156, 22, 110),  // left inner plate
    `<rect x="178" y="241" width="156" height="30" rx="8" fill="${ACCENT}"/>`, // bar
    plate(334, 22, 110),  // right inner plate
    plate(356, 26, 150),  // right outer plate
  ].join('');
}

function svg({ maskable }) {
  const rx = maskable ? 0 : 96; // full-bleed bg for maskable, rounded for normal
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" rx="${rx}" fill="${BG}"/>
    ${glyph()}
  </svg>`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

const browser = await chromium.launch();
try {
  for (const t of TARGETS) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    const markup = svg({ maskable: t.maskable });
    await page.setContent(
      `<!DOCTYPE html><meta charset="utf-8"><style>html,body{margin:0;padding:0}svg{display:block;width:${t.size}px;height:${t.size}px}</style>${markup}`,
      { waitUntil: 'load' },
    );
    const png = await page.locator('svg').screenshot({ omitBackground: t.maskable ? false : false });
    writeFileSync(join(root, t.file), png);
    await page.close();
    console.log(`wrote ${t.file} (${t.size}x${t.size}${t.maskable ? ', maskable' : ''})`);
  }
} finally {
  await browser.close();
}
