type SubjectSectionIconProps = {
  label: string;
  className?: string;
};

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

export function SubjectSectionIcon({ label, className = "h-4 w-4" }: SubjectSectionIconProps) {
  const normalized = normalizeLabel(label);

  if (normalized.includes("general aptitude") || normalized.includes("aptitude")) {
    return (
      <svg viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
        <circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="9" cy="9" r="1.6" fill="currentColor" />
        <path d="M9 1.75V4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9 13.9v2.35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M1.75 9H4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M13.9 9h2.35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="m4 4 1.65 1.65" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="m12.35 12.35 1.65 1.65" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (
    normalized.includes("technical") ||
    normalized.includes("core") ||
    normalized.includes("engineering math") ||
    normalized.includes("mathematics")
  ) {
    return (
      <svg viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
        <rect x="5.1" y="5.1" width="7.8" height="7.8" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 1.8v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9 14.2v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M1.8 9h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M14.2 9h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4.2 4.2 5.6 5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="m12.4 12.4 1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="5" height="5" rx="1.1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10" y="3" width="5" height="5" rx="1.1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="10" width="5" height="5" rx="1.1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10" y="10" width="5" height="5" rx="1.1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
