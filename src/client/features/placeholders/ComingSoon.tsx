import { Link } from 'react-router';

export function ComingSoon({ heading, note }: { heading: string; note: string }) {
  return (
    <section>
      <h1 className="font-display text-[28px] leading-[34px] font-bold">{heading}</h1>
      <p className="mt-2 text-ink-soft">{note}</p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center font-semibold text-breeze-deep underline">
        Back to start
      </Link>
    </section>
  );
}
