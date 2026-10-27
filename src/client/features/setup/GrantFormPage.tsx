import { useState } from 'react';
import { BackLink } from '../../components/BackLink.tsx';
import { Link, useNavigate, useParams } from 'react-router';
import { validateGrantForm, type GrantFormInput } from '../../../shared/grant.ts';
import { TextField } from '../../components/fields.tsx';
import { btn, btnPrimary, h1, linkClass } from '../../components/ui.ts';
import { db } from '../../db/index.ts';
import { repo } from '../../db/index.ts';
import { attempt } from '../../lib/errors.ts';
import { useLive } from '../../lib/useLive.ts';
import type { Grant } from '../../../shared/types.ts';

const paiseToText = (minor: number) => {
  const whole = Math.trunc(minor / 100);
  const frac = String(minor % 100).padStart(2, '0');
  return frac === '00' ? String(whole) : `${whole}.${frac}`;
};

function GrantForm({ grant }: { grant?: Grant }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<GrantFormInput>({
    name: grant?.name ?? '',
    sponsor: grant?.sponsor ?? '',
    totalText: grant ? paiseToText(grant.totalMinor) : '',
    utilisedText: grant ? paiseToText(grant.utilisedBeforeMinor) : '',
    startDate: grant?.startDate ?? '',
    endDate: grant?.endDate ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof GrantFormInput, string>>>({});
  const set = (key: keyof GrantFormInput) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = validateGrantForm(form);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    let id = grant?.id;
    const saved = await attempt(async () => {
      if (grant) await repo.updateGrant(grant.id, result.value);
      else id = (await repo.createGrant(result.value)).id;
    });
    if (saved && id) navigate(`/grants/${id}`);
  }

  return (
    <form onSubmit={submit} noValidate>
      <BackLink to={grant ? `/grants/${grant.id}` : '/grants'} label={grant ? grant.name : 'grants'} />
      <h1 className={`${h1} mb-6`}>{grant ? 'Edit grant' : 'New grant'}</h1>
      <TextField id="name" label="Grant name" value={form.name} onChange={set('name')} error={errors.name} maxLength={200} />
      <TextField id="sponsor" label="Sponsor (optional)" value={form.sponsor} onChange={set('sponsor')} error={errors.sponsor} />
      <TextField id="totalText" label="Sanctioned total (₹)" value={form.totalText} onChange={set('totalText')} error={errors.totalText} inputMode="decimal" hint="For example 1,00,000.50" />
      <TextField id="utilisedText" label="Already utilised before using ExpRes (₹)" value={form.utilisedText} onChange={set('utilisedText')} error={errors.utilisedText} inputMode="decimal" hint="Leave empty if nothing was spent yet" />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <TextField id="startDate" label="Grant start date" type="date" value={form.startDate} onChange={set('startDate')} error={errors.startDate} />
        <TextField id="endDate" label="Grant end date" type="date" value={form.endDate} onChange={set('endDate')} error={errors.endDate} />
      </div>
      <p className="mb-4 text-sm text-ink-soft">Grants are in Indian rupees (INR).</p>
      <div className="flex gap-3">
        <button type="submit" className={btnPrimary}>{grant ? 'Save changes' : 'Create grant'}</button>
        <Link to={grant ? `/grants/${grant.id}` : '/grants'} className={btn}>Cancel</Link>
      </div>
    </form>
  );
}

export function GrantFormPage() {
  const { grantId } = useParams();
  const grant = useLive(async () => (grantId ? ((await db.grants.get(grantId)) ?? null) : undefined), [grantId]);
  if (!grantId) return <GrantForm />;
  if (grant === undefined) return <p role="status">Loading…</p>;
  if (grant === null) return <p role="alert">That grant was not found. <Link to="/grants" className={linkClass}>Back to grants</Link></p>;
  return <GrantForm grant={grant} />;
}
