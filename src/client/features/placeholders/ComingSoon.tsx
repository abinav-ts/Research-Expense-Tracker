import { linkClass } from '../../components/ui.ts';
import { Link } from 'react-router';

export function ComingSoon({ heading, note }: { heading: string; note: string }) {
  return (
    <section>
      <h1 className="font-display text-[28px] leading-[34px] font-bold">{heading}</h1>
      <p className="mt-2 text-ink-soft">{note}</p>
      <Link to="/" className={`${linkClass} mt-6`}>
        Back to start
      </Link>
    </section>
  );
}
