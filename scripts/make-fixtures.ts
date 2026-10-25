// REQ-DEMO-05: synthetic, watermarked proofs for the demo and the recognition tests. Generic layouts only: these are
// never copies of a real bank or UPI app. Run `npm run fixtures` (needs Playwright's Chromium); output is committed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const out = join(import.meta.dirname, '../fixtures');
mkdirSync(out, { recursive: true });

// Plain fixture styling on purpose (these are test images, not app UI, so brand tokens do not apply).
const page = (body: string) => `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:540px;height:960px;position:relative;font-family:Arial,Helvetica,sans-serif;background:#fff;color:#111;overflow:hidden}
  .wm{position:absolute;left:0;right:0;top:380px;text-align:center;font-size:130px;font-weight:700;color:#000;opacity:.06;transform:rotate(-24deg);letter-spacing:6px}
  .foot{position:absolute;bottom:18px;left:0;right:0;text-align:center;font-size:20px;color:#555}
</style>${body}<div class="wm">SAMPLE</div><div class="foot">SAMPLE · synthetic fixture · not a real payment</div>`;

const fixtures: Record<string, string> = {
  'upi-success.png': page(`<div style="text-align:center;padding-top:90px">
    <div style="width:96px;height:96px;border-radius:48px;background:#1b8a4b;color:#fff;font-size:64px;line-height:96px;margin:0 auto">✓</div>
    <div style="font-size:34px;margin-top:28px">Payment successful</div>
    <div style="font-size:72px;font-weight:700;margin-top:34px">₹1,200</div>
    <div style="font-size:24px;color:#555;margin-top:44px">Paid to</div>
    <div style="font-size:36px;font-weight:700;margin-top:6px">RAMESH STORES</div>
    <div style="font-size:26px;margin-top:40px">12 Nov 2026, 10:42 am</div>
    <div style="font-size:22px;color:#555;margin-top:44px">UPI transaction ID</div>
    <div style="font-size:30px;margin-top:6px">123456789012</div></div>`),
  'card-alert-sms.png': page(`<div style="padding:70px 34px"><div style="font-size:22px;color:#555;margin-bottom:14px">SAMPLEBK</div>
    <div style="background:#e8eef5;border-radius:22px;padding:26px;font-size:30px;line-height:1.4">INR 2,450.00 spent on card XX1234 at HOTEL SAMPLE on 12-Nov-26. Avl Lmt INR 85,000.00</div>
    <div style="font-size:20px;color:#555;margin-top:12px">12 Nov, 6:15 pm</div></div>`),
  'foreign-invoice.png': page(`<div style="padding:70px 40px"><div style="font-size:44px;font-weight:700">INVOICE</div>
    <div style="font-size:30px;margin-top:30px">Lisbon Computing Society</div>
    <div style="font-size:26px;color:#444;margin-top:8px">Conference registration</div>
    <div style="font-size:26px;margin-top:40px">Invoice date: 12 Nov 2026</div>
    <div style="font-size:26px;margin-top:10px">Invoice no: SAMPLE-0042</div>
    <div style="font-size:40px;font-weight:700;margin-top:60px">Total: EUR 180.00</div></div>`),
};

const browser = await chromium.launch();
try {
  for (const [file, html] of Object.entries(fixtures)) {
    const p = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
    await p.setContent(html);
    await p.screenshot({ path: join(out, file) });
    await p.close();
    console.log(`wrote fixtures/${file}`);
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'card-alert-sms.txt'), 'INR 2,450.00 spent on card XX1234 at HOTEL SAMPLE on 12-Nov-26. Avl Lmt INR 85,000.00\n');
console.log('wrote fixtures/card-alert-sms.txt');
