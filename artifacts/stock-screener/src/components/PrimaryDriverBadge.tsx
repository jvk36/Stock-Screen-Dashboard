interface PrimaryDriverBadgeProps {
  driver: string;
  description: string;
}

export function PrimaryDriverBadge({ driver, description }: PrimaryDriverBadgeProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 py-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        Primary Driver
      </span>
      <span className="text-[11px] font-mono font-medium bg-primary/10 text-primary border border-primary/25 px-2.5 py-0.5 rounded-full">
        {driver}
      </span>
      <span className="text-[11px] text-muted-foreground/60 hidden sm:inline">
        · {description}
      </span>
    </div>
  );
}
