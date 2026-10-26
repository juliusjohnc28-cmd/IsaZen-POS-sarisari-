import { CSSProperties, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, LucideIcon, Minus } from 'lucide-react';
import { Sparkline } from './Sparkline';
import { fmt, useCountUp } from './format';

interface KpiCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Percent change versus the comparison period; null hides the pill */
  growth: number | null;
  compareLabel: string;
  spark: number[];
  /** Gradient used for the top line, the glow and the trend line */
  accent: [string, string];
  /** The dark, highlighted card */
  hero?: boolean;
  /** Extra content between the value and the trend line (hero card) */
  extra?: ReactNode;
  index?: number;
  className?: string;
}

export function KpiCard({ label, value, icon: Icon, growth, compareLabel, spark, accent, hero, extra, index = 0, className = '' }: KpiCardProps) {
  const shown = useCountUp(value);
  const tone = growth === null ? 'flat' : growth > 0.05 ? 'pos' : growth < -0.05 ? 'neg' : 'flat';

  return (
    <div
      className={`dx-card dx-kpi dx-rise ${hero ? 'dx-hero' : ''} ${className}`}
      style={{ ['--kpi-a' as string]: accent[0], ['--kpi-b' as string]: accent[1], ['--i' as string]: index } as CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dx-label">{label}</p>
          <p className="dx-value mt-2" aria-label={`${label}: ${fmt(value)} pesos`}>
            <span className="dx-cur">₱</span>
            {fmt(shown)}
          </p>
        </div>
        <span className="dx-icon">
          <Icon className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </span>
      </div>

      <div className="mt-3 flex items-center flex-wrap gap-x-2 gap-y-1">
        {growth !== null && (
          <span className={`dx-pill ${tone}`}>
            {tone === 'pos' ? <ArrowUpRight className="w-3.5 h-3.5" /> : tone === 'neg' ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            {growth > 0 ? '+' : ''}
            {growth.toFixed(1)}%
          </span>
        )}
        <span className="dx-muted text-xs font-semibold">{compareLabel}</span>
      </div>

      {extra && <div className="mt-3">{extra}</div>}

      <div className="dx-spark" style={{ marginTop: extra ? 10 : 'auto' }}>
        <Sparkline values={spark} color={hero ? '#fcd34d' : accent[0]} />
      </div>
    </div>
  );
}
