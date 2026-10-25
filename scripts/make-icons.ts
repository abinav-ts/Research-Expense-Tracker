// Generates the PWA icons from the brand mark (REQ-BRAND-05): the mark on an ink rounded square.
// Run `npm run icons` after changing brand/. Needs Playwright's Chromium (`npx playwright install chromium`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { brandTokens } from '../build/brand.ts';

const root = join(import.meta.dirname, '..');
const ink = brandTokens()['ex-ink'];
const mark = `data:image/svg+xml;base64,${readFileSync(join(root, 'brand/logo-mark-dark.svg')).toString('base64')}`;

// radius: share of the side; markWidth: share of the side (maskable icons keep the mark inside the safe zone).
const icons = [
  { file: 'icon-192.png', size: 192, radius: 0.22, markWidth: 0.68 },
  { file: 'icon-512.png', size: 512, radius: 0.22, markWidth: 0.68 },
  { file: 'icon-maskable-512.png', size: 512, radius: 0, markWidth: 0.56 },
  { file: 'apple-touch-icon.png', size: 180, radius: 0, markWidth: 0.68 },
];

const browser = await chromium.launch();
try {
  for (const { file, size, radius, markWidth } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;background:${ink};` +
        `border-radius:${radius * 100}%;display:flex;align-items:center;justify-content:center">` +
        `<img src="${mark}" style="width:${markWidth * 100}%"></div></body>`,
    );
    await page.screenshot({ path: join(root, 'public/icons', file), omitBackground: true });
    await page.close();
    console.log(`wrote public/icons/${file}`);
  }
} finally {
  await browser.close();
}
