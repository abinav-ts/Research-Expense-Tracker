// REQ-DEMO-02 (partial, M1): a sample grant with a document, a trip and pending expenses, every proof watermarked SAMPLE.
import { fxToInrMinor } from '../../shared/money.ts';
import type { ExpenseFields } from '../../shared/expense-form.ts';
import { repo } from '../db/index.ts';
import { makeSampleImage } from './sampleImage.ts';

const png = (blob: Blob, name: string) => new File([blob], name, { type: 'image/png' });
const inr = (rupees: number, rest: Omit<ExpenseFields, 'originalMinor' | 'originalCurrency' | 'inrMinor' | 'paymentMode'>): ExpenseFields => ({
  originalMinor: rupees * 100, originalCurrency: 'INR', inrMinor: rupees * 100, paymentMode: 'bank', ...rest,
});

export async function loadDemoData(): Promise<void> {
  const grant = await repo.createGrant({
    name: 'DST Sample Grant (SAMPLE)', sponsor: 'Sample Agency', totalMinor: 10_000_000, utilisedBeforeMinor: 2_000_000,
    startDate: '2026-04-01', endDate: '2027-03-31',
  });
  await repo.addGrantDocuments(grant.id, [png(await makeSampleImage('Sanction letter', ['Sample Agency', 'Grant: DST Sample Grant', 'Sanctioned: Rs 1,00,000']), 'sanction-letter-SAMPLE.png')]);

  const trip = await repo.createTrip(grant.id, {
    name: 'SampleConf 2026', city: 'Lisbon', country: 'Portugal', startDate: '2026-11-10', endDate: '2026-11-14',
    fxRatesMicro: { EUR: 95_000_000 },
  });

  const upi = async (payee: string, amount: string, date: string, ref: string) =>
    png(await makeSampleImage('Payment successful', [`Paid to ${payee}`, amount, date, `UPI transaction ID ${ref}`]), `upi-${ref}-SAMPLE.png`);

  await repo.addExpenseWithProofs(trip.id, inr(1850, { date: '2026-11-09', payee: 'IRCTC', categoryId: 'rail_bus', reference: 'SMPL000000001' }),
    [{ file: await upi('IRCTC', 'Rs 1,850', '09 Nov 2026, 06:15 am', 'SMPL000000001'), proofType: 'upi_screenshot' }]);
  await repo.addExpenseWithProofs(trip.id, inr(640, { date: '2026-11-10', payee: 'Uber', categoryId: 'local_transport', reference: 'SMPL000000002' }),
    [{ file: await upi('Uber', 'Rs 640', '10 Nov 2026, 09:40 pm', 'SMPL000000002'), proofType: 'upi_screenshot' }]);
  await repo.addExpenseWithProofs(trip.id, inr(24_500, { date: '2026-11-11', payee: 'HOTEL SAMPLE', categoryId: 'accommodation' }),
    [{ file: new File(['INR 24,500.00 spent on card XXXX at HOTEL SAMPLE on 11-Nov-26. (SAMPLE message)'], 'card-alert-SAMPLE.txt', { type: 'text/plain' }), proofType: 'card_alert' }]);
  await repo.addExpenseWithProofs(trip.id, {
    originalMinor: 18_000, originalCurrency: 'EUR', inrMinor: fxToInrMinor(18_000, 95_000_000, 2), estimatedRateMicro: 95_000_000,
    paymentMode: 'bank', date: '2026-11-12', payee: 'Lisbon Computing Society', categoryId: 'registration',
  }, [{ file: png(await makeSampleImage('Invoice (EUR)', ['Lisbon Computing Society', 'Conference registration', 'Total: EUR 180.00']), 'invoice-SAMPLE.png'), proofType: 'invoice' }]);
}
