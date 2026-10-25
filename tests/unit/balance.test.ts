import { describe, expect, it } from 'vitest';
import { balanceLabel, balanceState, computeBalance, pendingText, remainingText } from '../../src/shared/balance.ts';

const grant = { totalMinor: 10_000_000, utilisedBeforeMinor: 2_000_000 }; // ₹1,00,000 with ₹20,000 utilised before
const exp = (inrMinor: number, extra: Partial<{ inrStatus: 'pending' | 'confirmed'; excluded: boolean }> = {}) => ({
  inrMinor, inrStatus: 'pending' as const, excluded: false, ...extra,
});

describe('REQ-BAL-01: balance calculation and live update', () => {
  it('REQ-BAL-01: ₹1,00,000 − ₹20,000 − ₹15,000 − ₹5,000 leaves ₹60,000', () => {
    expect(computeBalance(grant, [exp(1_500_000), exp(500_000)]).remainingMinor).toBe(6_000_000);
  });

  it('REQ-BAL-01: excluding the ₹5,000 expense gives ₹65,000; deleting an expense is just recomputing without it', () => {
    expect(computeBalance(grant, [exp(1_500_000), exp(500_000, { excluded: true })]).remainingMinor).toBe(6_500_000);
    expect(computeBalance(grant, [exp(500_000)]).remainingMinor).toBe(7_500_000);
  });

  it('REQ-BAL-01: editing ₹15,000 to ₹16,500 gives ₹58,500', () => {
    expect(computeBalance(grant, [exp(1_650_000), exp(500_000)]).remainingMinor).toBe(5_850_000);
  });

  it('REQ-BAL-01: expenses from several trips all count', () => {
    expect(computeBalance(grant, [exp(1_500_000), exp(500_000), exp(1_000_000)]).remainingMinor).toBe(5_000_000);
  });

  it('REQ-BAL-01: ₹0.10 + ₹0.20 is exactly 30 paise', () => {
    const b = computeBalance({ totalMinor: 100, utilisedBeforeMinor: 0 }, [exp(10), exp(20)]);
    expect(b.pendingMinor).toBe(30);
    expect(b.remainingMinor).toBe(70);
  });

  it('REQ-BAL-01: the function is pure: the same inputs give equal outputs and inputs are not changed', () => {
    const list = [exp(1_500_000)];
    const copy = structuredClone(list);
    expect(computeBalance(grant, list)).toEqual(computeBalance(grant, list));
    expect(list).toEqual(copy);
  });
});

describe('REQ-BAL-02: indicator states', () => {
  const total = 10_000_000;
  it('REQ-BAL-02: exactly 20% is Healthy, ₹19,999.99 is Low, ₹0.00 is Low, −₹0.01 is Overspent', () => {
    expect(balanceState(2_000_000, total)).toBe('healthy');
    expect(balanceState(1_999_999, total)).toBe('low');
    expect(balanceState(0, total)).toBe('low');
    expect(balanceState(-1, total)).toBe('over');
  });

  it('REQ-BAL-02: shows "Overspent by ₹0.01" for −1 paise and "₹x left" otherwise', () => {
    expect(remainingText(computeBalance({ totalMinor: 100, utilisedBeforeMinor: 0 }, [exp(101)]))).toBe('Overspent by ₹0.01');
    expect(remainingText(computeBalance(grant, [exp(1_500_000), exp(500_000)]))).toBe('₹60,000.00 left');
  });

  it('REQ-BAL-02: percent is rounded down so 19.99% never reads as 20%', () => {
    expect(computeBalance({ totalMinor: total, utilisedBeforeMinor: 0 }, [exp(total - 1_999_999)]).percentRemaining).toBe(19);
    expect(computeBalance({ totalMinor: total, utilisedBeforeMinor: 0 }, [exp(total - 2_000_000)]).percentRemaining).toBe(20);
    expect(computeBalance({ totalMinor: 100, utilisedBeforeMinor: 0 }, [exp(150)]).percentRemaining).toBe(0);
  });

  it('REQ-BAL-02: the accessible label names the amount, percent and state', () => {
    const b = computeBalance(grant, [exp(1_500_000), exp(500_000)]);
    expect(balanceLabel(b)).toBe('Grant balance: ₹60,000.00 remaining, 60 percent, Healthy. ₹20,000.00 of spend is pending verification');
    expect(balanceLabel(computeBalance({ totalMinor: 100, utilisedBeforeMinor: 0 }, [exp(101, { inrStatus: 'confirmed' })]))).toBe('Grant balance: overspent by ₹0.01, Overspent');
  });
});

describe('REQ-BAL-06: confirmed vs pending-verification split', () => {
  it('REQ-BAL-06: matching a ₹8,455.00 estimate to a ₹8,612.34 debit leaves ₹59,842.66 and moves it to confirmed', () => {
    const confirmedOther = exp(1_154_500, { inrStatus: 'confirmed' });
    const before = computeBalance(grant, [confirmedOther, exp(845_500)]);
    expect(before.remainingMinor).toBe(6_000_000); // ₹60,000.00 including the pending estimate
    expect(before.pendingMinor).toBe(845_500);

    const after = computeBalance(grant, [confirmedOther, exp(861_234, { inrStatus: 'confirmed' })]);
    expect(after.remainingMinor).toBe(5_984_266); // ₹59,842.66
    expect(after.pendingMinor).toBe(before.pendingMinor - 845_500);
    expect(after.confirmedMinor).toBe(before.confirmedMinor + 861_234);
  });

  it('REQ-BAL-06: a pending INR expense matched to an equal debit leaves the remaining balance unchanged', () => {
    const a = computeBalance(grant, [exp(120_000)]);
    const b = computeBalance(grant, [exp(120_000, { inrStatus: 'confirmed' })]);
    expect(b.remainingMinor).toBe(a.remainingMinor);
    expect(b.confirmedMinor).toBe(120_000);
  });

  it('REQ-BAL-06: the pending phrase appears only while something is pending', () => {
    expect(pendingText(computeBalance(grant, [exp(620_000)]))).toBe('₹6,200.00 of spend is pending verification');
    expect(pendingText(computeBalance(grant, [exp(620_000, { inrStatus: 'confirmed' })]))).toBeUndefined();
    expect(pendingText(computeBalance(grant, [exp(620_000, { excluded: true })]))).toBeUndefined();
  });
});
