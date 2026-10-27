import { useState } from 'react';
import { BackLink } from '../../components/BackLink.tsx';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { COMMON_CURRENCIES } from '../../../shared/currency.ts';
import { microToText, validateTripForm, type TripFormInput } from '../../../shared/trip.ts';
import type { Grant, Trip } from '../../../shared/types.ts';
import { SelectField, TextField } from '../../components/fields.tsx';
import { ConfirmPanel } from '../../components/ConfirmPanel.tsx';
import { btn, btnDanger, btnPrimary, h1, linkClass } from '../../components/ui.ts';
import { db, repo } from '../../db/index.ts';
import { attempt } from '../../lib/errors.ts';
import { useLive } from '../../lib/useLive.ts';

const paiseText = (minor: number) => (minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2));

function TripForm({ grants, grantId, trip }: { grants: Grant[]; grantId: string; trip?: Trip }) {
  const navigate = useNavigate();
  const [chosenGrant, setChosenGrant] = useState(grantId);
  const [form, setForm] = useState<TripFormInput>({
    name: trip?.name ?? '', city: trip?.city ?? '', country: trip?.country ?? '',
    startDate: trip?.startDate ?? '', endDate: trip?.endDate ?? '',
    budgetText: trip?.budgetMinor ? paiseText(trip.budgetMinor) : '',
    rates: Object.entries(trip?.fxRatesMicro ?? {}).map(([currency, micro]) => ({ currency, rateText: microToText(micro) })),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof TripFormInput, string>>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string>();
  const grant = grants.find((g) => g.id === chosenGrant);
  const set = (key: Exclude<keyof TripFormInput, 'rates'>) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const setRate = (index: number, patch: Partial<{ currency: string; rateText: string }>) =>
    setForm((f) => ({ ...f, rates: f.rates.map((r, i) => (i === index ? { ...r, ...patch } : r)) }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = validateTripForm(form, grant);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setWarnings(result.warnings); // shown on the next screen render only if saving fails; saving is never blocked
    let id = trip?.id;
    const saved = await attempt(async () => {
      if (trip) await repo.updateTrip(trip.id, result.value);
      else id = (await repo.createTrip(chosenGrant, result.value)).id;
    });
    if (saved && id) navigate(`/trips/${id}`);
  }

  const outsidePeriod = grant && form.startDate && form.endDate && (form.startDate < grant.startDate || form.endDate > grant.endDate);

  return (
    <form onSubmit={submit} noValidate>
      <BackLink to={trip ? `/trips/${trip.id}` : grant ? `/grants/${grant.id}` : '/grants'} label={trip ? trip.name : grant ? grant.name : 'grants'} />
      <h1 className={`${h1} mb-6`}>{trip ? 'Edit trip' : 'New trip'}</h1>
      {!trip && (
        <SelectField id="grant" label="Grant" value={chosenGrant} onChange={setChosenGrant} options={grants.map((g) => ({ value: g.id, label: g.name }))} />
      )}
      <TextField id="name" label="Conference name" value={form.name} onChange={set('name')} error={errors.name} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <TextField id="city" label="City" value={form.city} onChange={set('city')} error={errors.city} />
        <TextField id="country" label="Country" value={form.country} onChange={set('country')} error={errors.country} />
        <TextField id="startDate" label="Start date" type="date" value={form.startDate} onChange={set('startDate')} error={errors.startDate} />
        <TextField id="endDate" label="End date" type="date" value={form.endDate} onChange={set('endDate')} error={errors.endDate} />
      </div>
      {outsidePeriod && grant && (
        <p role="status" className="mb-4 font-semibold text-state-low">⚠ These dates fall outside the grant's period. You can still save.</p>
      )}
      <TextField id="budgetText" label="Trip budget (₹, optional)" value={form.budgetText} onChange={set('budgetText')} error={errors.budgetText} inputMode="decimal" />

      <fieldset className="mb-4 rounded-lg border border-line p-3">
        <legend className="px-1 text-sm font-semibold">Default rates (optional)</legend>
        <p className="mb-3 text-sm text-ink-soft">For foreign-currency spend: the estimated rupees per 1 unit, prefilled on new expenses. Estimates are replaced by the real bank debit later.</p>
        <datalist id="currencies">{COMMON_CURRENCIES.filter((c) => c !== 'INR').map((c) => <option key={c} value={c} />)}</datalist>
        {form.rates.map((row, i) => (
          <div key={i} className="grid grid-cols-[6rem_1fr_auto] items-end gap-x-3">
            <TextField id={`rate-cur-${i}`} label="Currency" value={row.currency} onChange={(v) => setRate(i, { currency: v })} list="currencies" maxLength={3} />
            <TextField id={`rate-val-${i}`} label="₹ per 1 unit" value={row.rateText} onChange={(v) => setRate(i, { rateText: v })} inputMode="decimal" />
            <button type="button" className={`${btn} mb-4`} onClick={() => setForm((f) => ({ ...f, rates: f.rates.filter((_, j) => j !== i) }))} aria-label={`Remove rate ${i + 1}`}>Remove</button>
          </div>
        ))}
        {errors.rates && <p role="alert" className="mb-3 text-sm font-semibold text-state-over">⚠ {errors.rates}</p>}
        <button type="button" className={btn} onClick={() => setForm((f) => ({ ...f, rates: [...f.rates, { currency: '', rateText: '' }] }))}>Add a rate</button>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btnPrimary}>{trip ? 'Save changes' : 'Create trip'}</button>
        <Link to={trip ? `/trips/${trip.id}` : `/grants/${chosenGrant}`} className={btn}>Cancel</Link>
        {trip && (
          <button type="button" className={btnDanger} onClick={async () => {
            const { expenses } = await repo.tripDeletionImpact(trip.id);
            setConfirming(`${expenses} ${expenses === 1 ? 'expense' : 'expenses'} will be deleted and the grant balance will go back up`);
          }}>Delete trip</button>
        )}
      </div>
      {warnings.length > 0 && <p className="sr-only" role="status">{warnings.join(' ')}</p>}
      {confirming && trip && (
        <ConfirmPanel
          message={`Delete "${trip.name}"? ${confirming}.`} confirmLabel="Delete trip"
          onCancel={() => setConfirming(undefined)}
          onConfirm={async () => { if (await attempt(() => repo.deleteTrip(trip.id))) navigate(`/grants/${trip.grantId}`); }}
        />
      )}
    </form>
  );
}

export function TripFormPage() {
  const { tripId } = useParams();
  const [search] = useSearchParams();
  const data = useLive(async () => ({
    grants: await db.grants.orderBy('updatedAt').reverse().toArray(),
    trip: tripId ? ((await db.trips.get(tripId)) ?? null) : undefined,
  }), [tripId]);

  if (!data) return <p role="status">Loading…</p>;
  if (tripId && !data.trip) return <p role="alert">That trip was not found. <Link to="/grants" className={linkClass}>Back to grants</Link></p>;
  if (data.grants.length === 0) {
    return (
      <div>
        <h1 className={h1}>New trip</h1>
        <p role="status" className="mt-3">Create a grant first: every trip belongs to a grant.</p>
        <Link to="/grants/new" className={`${btnPrimary} mt-4`}>Add grant</Link>
      </div>
    );
  }
  const wanted = data.trip?.grantId ?? search.get('grant') ?? '';
  const grantId = data.grants.some((g) => g.id === wanted) ? wanted : data.grants[0]!.id;
  return <TripForm key={data.trip?.id ?? 'new'} grants={data.grants} grantId={grantId} {...(data.trip ? { trip: data.trip } : {})} />;
}
