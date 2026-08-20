import { cn } from "@/lib/utils";

// VoxCRM brand lockup. The mark is a row of waveform bars forming a "V" —
// voice + Vox. Pass `mark` to render just the square mark (e.g. the app
// sidebar header). The full lockup is mark + wordmark text in the display
// font; pass `inverse` to force light text on an always-dark surface (e.g.
// the auth brand panel). Size the mark via className (e.g. "h-7 w-7"); the
// wordmark scales with text-* classes applied to the lockup.
export function VoxMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn("h-8 w-8 select-none", className)}
    >
      <defs>
        <linearGradient
          id="voxcrm-mark-grad"
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#voxcrm-mark-grad)" />
      <g fill="#fff">
        <rect x="11" y="18" width="6" height="28" rx="3" />
        <rect x="21" y="22" width="6" height="20" rx="3" />
        <rect x="31" y="26" width="6" height="12" rx="3" />
        <rect x="41" y="22" width="6" height="20" rx="3" />
        <rect x="51" y="18" width="6" height="28" rx="3" />
      </g>
    </svg>
  );
}

export function BrandLogo({
  className,
  inverse = false,
  mark = false,
}: {
  className?: string;
  inverse?: boolean;
  mark?: boolean;
}) {
  if (mark) {
    return <VoxMark className={className} />;
  }
  return (
    <span className={cn("inline-flex select-none items-center gap-2.5", className)}>
      <VoxMark className="h-[1.5em] w-[1.5em]" />
      <span
        className={cn(
          "font-display text-2xl font-bold tracking-tight",
          inverse ? "text-white" : "text-foreground"
        )}
      >
        Vox<span className="text-cta">CRM</span>
      </span>
    </span>
  );
}
