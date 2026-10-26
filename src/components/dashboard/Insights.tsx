import { CSSProperties } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, HandCoins, PackageX, Trophy } from 'lucide-react';
import { fmt, peso, useIsDark } from './format';

const rise = (i: number): CSSProperties => ({ ['--i' as string]: i } as CSSProperties);

/* ------------------------------------------------------------------ top sellers */

export interface SellerRow {
  name: string;
  qty: number;
  revenue: number;
}

export function TopSellers({ rows, monthLabel }: { rows: SellerRow[]; monthLabel: string }) {
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <div className="dx-card overflow-hidden dx-rise" style={rise(6)}>
      <div className="dx-head">
        <div>
          <h2 className="dx-title">Top sellers</h2>
          <p className="dx-sub">Best earners in {monthLabel}, by cash sales.</p>
        </div>
        <span className="dx-icon">
          <Trophy className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm font-semibold dx-muted">No sales yet this month.</p>
      ) : (
        <ol className="p-4 md:p-5 space-y-3.5">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center gap-3">
              <span
                className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-black dx-num"
                style={{
                  background: i === 0 ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' : 'var(--dx-accent-soft)',
                  color: i === 0 ? '#3b2300' : 'var(--dx-accent)',
                }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--dx-text)' }}>
                    {r.name}
                  </p>
                  <p className="text-sm font-extrabold dx-num shrink-0" style={{ color: 'var(--dx-text)' }}>
                    {peso(r.revenue)}
                  </p>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="dx-bar flex-1">
                    <span style={{ width: `${Math.max(4, (r.revenue / max) * 100)}%` }} />
                  </div>
                  <span className="text-xs font-semibold dx-muted dx-num shrink-0">{r.qty} sold</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ sales by category */

export interface CategorySlice {
  name: string;
  value: number;
}

const SLICE_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#f97316', '#3b82f6', '#84cc16'];

export function CategoryDonut({ slices, monthLabel }: { slices: CategorySlice[]; monthLabel: string }) {
  const dark = useIsDark();
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <div className="dx-card overflow-hidden dx-rise" style={rise(7)}>
      <div className="dx-head">
        <div>
          <h2 className="dx-title">Sales by category</h2>
          <p className="dx-sub">Where {monthLabel}'s cash sales came from. Utang payments aren't split by item.</p>
        </div>
      </div>
      {total <= 0 ? (
        <p className="p-8 text-center text-sm font-semibold dx-muted">No sales yet this month.</p>
      ) : (
        <div className="p-4 md:p-5 flex flex-col sm:flex-row items-center gap-5">
          <div className="relative w-44 h-44 shrink-0" role="img" aria-label="Donut chart of sales by category">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" innerRadius="66%" outerRadius="100%" paddingAngle={slices.length > 1 ? 3 : 0} stroke="none" cornerRadius={6} isAnimationActive={false}>
                  {slices.map((s, i) => (
                    <Cell key={s.name} fill={SLICE_COLORS[i % SLICE_COLORS.length]} fillOpacity={dark ? 0.95 : 1} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="dx-label">Total</span>
              <span className="text-base font-extrabold dx-num" style={{ color: 'var(--dx-text)' }}>
                {peso(total)}
              </span>
            </div>
          </div>
          <ul className="w-full min-w-0 space-y-2">
            {slices.map((s, i) => (
              <li key={s.name} className="flex items-center gap-2.5 text-sm">
                <span className="dx-dot shrink-0" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                <span className="font-semibold truncate flex-1" style={{ color: 'var(--dx-text)' }}>
                  {s.name}
                </span>
                <span className="dx-num font-bold shrink-0" style={{ color: 'var(--dx-text)' }}>
                  {peso(s.value)}
                </span>
                <span className="dx-num text-xs font-semibold dx-muted w-10 text-right shrink-0">{Math.round((s.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ needs attention */

export interface AttentionItem {
  key: string;
  label: string;
  hint: string;
  count: number;
  tone: 'neg' | 'warn';
  onOpen: () => void;
}

export function Attention({ items }: { items: AttentionItem[] }) {
  const open = items.filter((i) => i.count > 0);
  return (
    <div className="dx-card overflow-hidden dx-rise" style={rise(5)}>
      <div className="dx-head">
        <div>
          <h2 className="dx-title">Needs attention</h2>
          <p className="dx-sub">{open.length === 0 ? 'Everything looks good.' : 'Tap one to jump straight to it.'}</p>
        </div>
        <span className="dx-icon" style={open.length === 0 ? { background: 'var(--dx-pos-soft)', color: 'var(--dx-pos)' } : { background: 'var(--dx-warn-soft)', color: 'var(--dx-warn)' }}>
          {open.length === 0 ? <CheckCircle2 className="w-[18px] h-[18px]" strokeWidth={2.2} /> : <AlertTriangle className="w-[18px] h-[18px]" strokeWidth={2.2} />}
        </span>
      </div>
      <div className="p-4 space-y-2.5">
        {items.map((i) => {
          const Icon = i.key === 'low' ? AlertTriangle : i.key === 'out' ? PackageX : Clock;
          const color = i.count === 0 ? 'var(--dx-muted)' : i.tone === 'neg' ? 'var(--dx-neg)' : 'var(--dx-warn)';
          return (
            <button key={i.key} type="button" onClick={i.onOpen} className="dx-row">
              <span className="dx-icon" style={{ width: 32, height: 32, borderRadius: 10, background: i.count === 0 ? 'var(--dx-accent-soft)' : i.tone === 'neg' ? 'var(--dx-neg-soft)' : 'var(--dx-warn-soft)', color }}>
                <Icon className="w-4 h-4" strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{i.label}</span>
                <span className="block text-xs font-semibold dx-muted truncate">{i.hint}</span>
              </span>
              <span className="text-lg font-extrabold dx-num" style={{ color }}>
                {i.count}
              </span>
              <ChevronRight className="w-4 h-4 dx-muted shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ utang snapshot */

export interface UtangStats {
  unpaid: number;
  customersOwing: number;
  collectedShare: number; // 0..1 of all utang ever given that has been paid back
  oldestDays: number | null;
}

export function UtangSnapshot({ stats, onOpen }: { stats: UtangStats; onOpen: () => void }) {
  const pct = Math.round(stats.collectedShare * 100);
  return (
    <div className="dx-card overflow-hidden dx-rise" style={rise(5.5)}>
      <div className="dx-head">
        <div>
          <h2 className="dx-title">Utang snapshot</h2>
          <p className="dx-sub">Store credit still to collect. It counts as sales once it is paid.</p>
        </div>
        <span className="dx-icon" style={{ background: 'var(--dx-warn-soft)', color: 'var(--dx-warn)' }}>
          <HandCoins className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </span>
      </div>
      <div className="p-4 md:p-5">
        <p className="dx-label">Unpaid balance</p>
        <p className="dx-value mt-1.5" style={{ fontSize: '1.7rem' }}>
          <span className="dx-cur">₱</span>
          {fmt(stats.unpaid)}
        </p>
        <p className="text-xs font-semibold dx-muted mt-1">
          {stats.customersOwing === 0
            ? 'Nobody owes anything right now.'
            : `${stats.customersOwing} ${stats.customersOwing === 1 ? 'customer owes' : 'customers owe'}${stats.oldestDays !== null ? ` · oldest ${stats.oldestDays === 0 ? 'is from today' : `${stats.oldestDays} ${stats.oldestDays === 1 ? 'day' : 'days'} ago`}` : ''}`}
        </p>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
            <span className="dx-muted">Collected so far</span>
            <span className="dx-num" style={{ color: 'var(--dx-text)' }}>
              {pct}%
            </span>
          </div>
          <div className="dx-bar">
            <span style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#10b981,#34d399)' }} />
          </div>
        </div>

        <button type="button" onClick={onOpen} className="dx-btn ghost w-full mt-4">
          Open utang ledger
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
