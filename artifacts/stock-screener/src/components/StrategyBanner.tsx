interface StrategyBannerProps {
  quote: string;
}

export function StrategyBanner({ quote }: StrategyBannerProps) {
  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg p-5 flex gap-4 items-start shadow-sm">
      <div className="text-primary font-serif text-4xl leading-none mt-1 select-none">"</div>
      <p className="text-foreground/90 font-medium text-sm leading-relaxed max-w-4xl">{quote}</p>
    </div>
  );
}
