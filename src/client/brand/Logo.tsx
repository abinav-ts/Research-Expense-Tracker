import { Link } from 'react-router';
import markDark from '../../../brand/logo-mark-dark.svg';
import markLight from '../../../brand/logo-mark.svg';

interface LogoProps {
  /** Researcher pages link to home; the reviewer page shows a plain logo (REQ-BRAND-01). */
  asLink: boolean;
  /** Use the dark-ground mark on ink backgrounds. */
  onDark?: boolean;
}

/** The one ExpRes lockup: mark (36×36) + live-text wordmark (26 px). Hidden wordmark below 320 px. */
export function Logo({ asLink, onDark = false }: LogoProps) {
  const lockup = (
    <>
      <img src={onDark ? markDark : markLight} alt="" width={36} height={36} className="h-[36px] w-[36px] shrink-0" />
      <span
        aria-hidden="true"
        className="hidden font-display text-[26px] leading-none tracking-[-0.035em] min-[320px]:inline"
      >
        <span className="font-medium">Exp</span>
        <span className="font-extrabold">Res</span>
      </span>
    </>
  );
  const classes = 'inline-flex items-center gap-2 text-ink';

  return asLink ? (
    <Link to="/" aria-label="ExpRes" data-testid="brand-logo" className={`${classes} min-h-11`}>
      {lockup}
    </Link>
  ) : (
    <div role="img" aria-label="ExpRes" data-testid="brand-logo" className={classes}>
      {lockup}
    </div>
  );
}
