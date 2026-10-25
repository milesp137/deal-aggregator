/** The DealRadar mark. Same artwork as the favicon in app/icon.svg. */
export default function Logo({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="DealRadar logo">
      <defs>
        <linearGradient id="dealradar-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a45" />
          <stop offset="1" stopColor="#e8321a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#dealradar-logo-gradient)" />
      <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round">
        <circle cx="32" cy="32" r="21" opacity="0.9" />
        <circle cx="32" cy="32" r="11" opacity="0.7" />
        <path d="M32 32 L48.5 15.5" />
      </g>
      <circle cx="32" cy="32" r="3.8" fill="#fff" />
      <circle cx="46" cy="43" r="3.2" fill="#fff" />
    </svg>
  );
}
