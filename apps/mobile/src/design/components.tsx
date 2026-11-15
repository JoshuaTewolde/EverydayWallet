/** Sticker Arcade design system (reused from CoinClash, trimmed for Tap). */
import { formatSol, formatUsd, solToUsd } from '@tap/shared';
import QRCode from 'qrcode';
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'accent' | 'teal' | 'plain';

function btnClass(variant: Variant, size: 'md' | 'lg', block: boolean, extra?: string) {
  return [
    'btn',
    variant !== 'plain' && `btn--${variant}`,
    size === 'lg' && 'btn--lg',
    block && 'btn--block',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg';
  block?: boolean;
  busy?: boolean;
}

export function Button({
  variant = 'plain',
  size = 'md',
  block = false,
  busy = false,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={btnClass(variant, size, block, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'plain',
  size = 'md',
  block = false,
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: 'md' | 'lg'; block?: boolean }) {
  return <Link className={btnClass(variant, size, block, className)} {...rest} />;
}

export function Card({
  tone,
  raised,
  dashed,
  className,
  children,
}: {
  tone?: 'paper' | 'sun' | 'teal';
  raised?: boolean;
  dashed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = [
    'card',
    tone && `card--${tone}`,
    raised && 'card--raised',
    dashed && 'card--dashed',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <section className={cls}>{children}</section>;
}

/** SOL amount with optional ≈ USD in parentheses. */
export function SolAmount({
  lamports,
  price,
  size = 'md',
  sign,
}: {
  lamports: bigint;
  price?: number | null;
  size?: 'sm' | 'md' | 'lg';
  sign?: '+' | '-';
}) {
  return (
    <span className={`amount amount--${size}`}>
      <span className="amount__sats">
        {sign}
        {formatSol(lamports)} SOL
      </span>
      {price ? (
        <span className="amount__fiat">(≈ {formatUsd(solToUsd(lamports, price))})</span>
      ) : null}
    </span>
  );
}

export function DevnetBadge() {
  return <span className="badge badge--test devnet">DEVNET · test money</span>;
}

export function BackButton({ to }: { to?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="btn btn--icon"
      aria-label="Back"
      onClick={() => (to ? navigate(to) : navigate(-1))}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M15 5l-7 7 7 7"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function ScreenHead({ title, back }: { title: string; back?: string | true }) {
  return (
    <header className="screen__head">
      {back && <BackButton to={back === true ? undefined : back} />}
      <h1>{title}</h1>
    </header>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p className="error" role="alert">
      {children}
    </p>
  ) : null;
}

export function Qr({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { margin: 1, width: 560, errorCorrectionLevel: 'M' })
      .then((u) => live && setSrc(u))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [value]);
  return src ? <img className="qr" src={src} alt={label} /> : <Loading />;
}

/** The "phones touching" animation used on Receive and Send. */
export function TapPulse({ label }: { label: string }) {
  return (
    <div className="tap-pulse" role="status">
      <span className="tap-pulse__ring" />
      <span className="tap-pulse__ring tap-pulse__ring--2" />
      <span className="tap-pulse__phone" aria-hidden="true">
        <svg
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <rect x="6" y="2" width="12" height="20" rx="2.5" />
          <path d="M10 18h4" strokeLinecap="round" />
        </svg>
      </span>
      <span className="tap-pulse__label">{label}</span>
    </div>
  );
}

const icons = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.5 5.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
};

export function BottomNav() {
  const items = [
    { to: '/', label: 'Home', icon: icons.home },
    { to: '/contacts', label: 'Contacts', icon: icons.people },
    { to: '/settings', label: 'Settings', icon: icons.settings },
  ] as const;
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {i.icon}
          </svg>
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
