import { CSSProperties, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compact, peso, useIsDark } from './format';

export interface DayPoint {
  label: string;
  fullLabel: string;
  Sales: number;
  Expenses: number;
  Profit: number;
}

export type RangeKey = '7D' | '30D' | 'MONTH';

interface PerformanceChartProps {
  ranges: Record<RangeKey, DayPoint[]>;
  monthLabel: string;
}

const RANGE_LABEL: Record<RangeKey, string> = { '7D': '7 days', '30D': '30 days', MONTH: 'This month' };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: DayPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const row = (name: string, value: number, color: string) => (
    <div className="flex items-center justify-between gap-6 text-xs font-semibold mt-1">
      <span className="inline-flex items-center gap-1.5 dx-muted">
        <span className="dx-dot" style={{ background: color }} />
        {name}
      </span>
      <span className="dx-num font-bold">{peso(value)}</span>
    </div>
  );
  return (
    <div className="dx-tooltip">
      <p className="dx-label">{p.fullLabel}</p>
      {row('Sales', p.Sales, '#6366f1')}
      {row('Expenses', p.Expenses, '#f43f5e')}
      {row('Profit', p.Profit, '#10b981')}
    </div>
  );
}

/** Sales, expenses and profit over time, with a 7 day / 30 day / this month switch. */
export function PerformanceChart({ ranges, monthLabel }: PerformanceChartProps) {
  const [range, setRange] = useState<RangeKey>('7D');
  const dark = useIsDark();
  const data = ranges[range];

  const total = (key: 'Sales' | 'Expenses' | 'Profit') => data.reduce((sum, d) => sum + d[key], 0);
  const sales = total('Sales');
  const expenses = total('Expenses');
  const profit = total('Profit');
  const net = sales - expenses;

  const axis = dark ? '#8da0ba' : '#64748b';
  const grid = dark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.07)';
  const salesColor = dark ? '#818cf8' : '#4f46e5';

  const stat = (name: string, value: number, color: string) => (
    <div className="dx-stat">
      <p className="dx-label inline-flex items-center gap-1.5">
        <span className="dx-dot" style={{ background: color }} />
        {name}
      </p>
      <p className="dx-stat-value mt-1">{peso(value)}</p>
    </div>
  );

  return (
    <div className="dx-card overflow-hidden dx-rise flex flex-col w-full h-full" style={{ ['--i' as string]: 4 } as CSSProperties}>
      <div className="dx-head">
        <div>
          <h2 className="dx-title">Performance</h2>
          <p className="dx-sub">
            Daily sales (cash plus utang paid), expenses and profit
            {range === 'MONTH' ? ` for ${monthLabel}` : ` over the last ${RANGE_LABEL[range]}`}.
          </p>
        </div>
        <div className="dx-seg" role="group" aria-label="Time range">
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((key) => (
            <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>
              {key === 'MONTH' ? 'Month' : key}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-5 flex-1 flex flex-col">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
          {stat('Sales', sales, '#6366f1')}
          {stat('Expenses', expenses, '#f43f5e')}
          {stat('Profit', profit, '#10b981')}
          <div className="dx-stat">
            <p className="dx-label">Net cash</p>
            <p className="dx-stat-value mt-1" style={{ color: net >= 0 ? 'var(--dx-pos)' : 'var(--dx-neg)' }}>
              {net >= 0 ? '+' : '-'}
              {peso(Math.abs(net))}
            </p>
          </div>
        </div>

        <div className="w-full flex-1 min-h-[16rem] md:min-h-[18rem]" role="img" aria-label={`Chart of sales, expenses and profit for ${RANGE_LABEL[range]}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="perf-sales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={dark ? 0.5 : 0.32} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 5" vertical={false} stroke={grid} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11.5, fontWeight: 600, fill: axis }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={range === '7D' ? 8 : 18}
                dy={6}
              />
              <YAxis tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} width={40} tickFormatter={compact} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: salesColor, strokeOpacity: 0.35, strokeDasharray: '4 4' }} />
              <Area type="monotone" dataKey="Sales" stroke={salesColor} strokeWidth={2.5} fill="url(#perf-sales)" activeDot={{ r: 5, strokeWidth: 2 }} />
              <Bar dataKey="Expenses" fill="#f43f5e" fillOpacity={0.85} radius={[5, 5, 0, 0]} maxBarSize={18} />
              <Line type="monotone" dataKey="Profit" stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
