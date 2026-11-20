import type { SVGProps } from "react";

/** Document + fountain pen nib icon matching Accomplish AI's brand mark. */
export function ReportPenIcon({ className = "h-4 w-4", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M12 10.5l-2.6 4.1 1.4 3.4h2.4l1.4-3.4-2.6-4.1z" />
      <path d="M12 10.5V14" />
    </svg>
  );
}

/** Accomplishment clipboard + checkmark icon for completed weekly report actions. */
export function AccomplishCheckIcon({ className = "h-4 w-4", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 7h6" />
      <path d="m8.8 13.5 2.1 2.1 4.4-4.6" />
    </svg>
  );
}

/** Compact prompt quota gauge icon (replaces generic sparkles). */
export function QuotaGaugeIcon({ className = "h-4 w-4", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M12 14l4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" />
    </svg>
  );
}
