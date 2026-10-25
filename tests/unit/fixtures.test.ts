import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseReceiptText, scrubReceiptText } from '../../src/shared/receipt-parser.ts';

const dir = join(import.meta.dirname, '../../fixtures');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('REQ-DEMO-05: demo fixtures', () => {
  it('REQ-DEMO-05: the UPI-style screenshot, card-alert image and foreign invoice image exist as real PNG files', () => {
    for (const name of ['upi-success.png', 'card-alert-sms.png', 'foreign-invoice.png']) {
      const bytes = readFileSync(join(dir, name));
      expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE), name).toBe(true);
      expect(bytes.length, name).toBeGreaterThan(5_000);
      expect(bytes.length, name).toBeLessThan(1_000_000); // under the claim file limit
    }
  });

  it('REQ-DEMO-05: the card-alert SMS text is recognised: ₹2,450.00, 12 Nov 2026, HOTEL SAMPLE, and its card digits and limit are dropped', () => {
    const raw = readFileSync(join(dir, 'card-alert-sms.txt'), 'utf8');
    const scrubbed = scrubReceiptText(raw);
    expect(parseReceiptText(scrubbed)).toEqual({ amountMinor: 245_000, currency: 'INR', date: '2026-11-12', payee: 'HOTEL SAMPLE' });
    expect(scrubbed).not.toMatch(/1234|85,000/);
  });

  it('REQ-DEMO-05: no real bank data: fixtures use only the SAMPLE names and generic layouts', () => {
    const text = readFileSync(join(dir, 'card-alert-sms.txt'), 'utf8');
    expect(text).toMatch(/HOTEL SAMPLE/);
    const generator = readFileSync(join(import.meta.dirname, '../../scripts/make-fixtures.ts'), 'utf8');
    expect(generator).toContain('SAMPLE');
    expect(generator).toMatch(/never copies of a real bank/i);
  });
});
