import { useId } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

interface SparklineProps {
  values: number[];
  color: string;
  /** Draw a dot on the latest point */
  height?: number;
}

/** A tiny trend line that sits at the bottom of a KPI card. */
export function Sparkline({ values, color, height = 54 }: SparklineProps) {
  const id = useId().replace(/:/g, '');
  const data = values.map((v, i) => ({ i, v }));
  const flat = values.every((v) => v === values[0]);
  return (
    <div style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }} accessibilityLayer={false}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.38} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* keep a flat line (no data yet) near the bottom instead of the middle */}
          <YAxis hide domain={flat ? [0, (max: number) => Math.max(max, 1) * 2] : ['dataMin', 'dataMax']} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#spark-${id})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
