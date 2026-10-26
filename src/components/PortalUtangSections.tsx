import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, CheckCircle, Clock } from 'lucide-react';
import { UtangRecord } from '../types';
import { utangRemaining } from '../utils/stock';

interface PortalUtangSectionsProps {
  records: UtangRecord[];
}

type DayGroup = { key: string; date: Date; records: UtangRecord[]; total: number };

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Newest day first; inside a day, newest utang first
function groupByDay(records: UtangRecord[], amountOf: (u: UtangRecord) => number): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const r of records) {
    const key = dayKey(r.date);
    const group = map.get(key) ?? { key, date: new Date(r.date), records: [], total: 0 };
    group.records.push(r);
    group.total += amountOf(r);
    map.set(key, group);
  }
  const groups = [...map.values()];
  groups.forEach((g) => g.records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  return groups.sort((a, b) => b.key.localeCompare(a.key));
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * The customer's utang history, split into UNPAID and PAID.
 * Each section lists its dates; tap a date to open the list of utang from that day.
 */
export function PortalUtangSections({ records }: PortalUtangSectionsProps) {
  const unpaid = useMemo(() => records.filter((r) => r.status === 'UNPAID'), [records]);
  const paid = useMemo(() => records.filter((r) => r.status === 'PAID'), [records]);

  const unpaidDays = useMemo(() => groupByDay(unpaid, utangRemaining), [unpaid]);
  const paidDays = useMemo(() => groupByDay(paid, (r) => r.amount), [paid]);

  // Which dates are open, e.g. "unpaid:2026-10-07"
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  const setAll = (section: 'unpaid' | 'paid', days: DayGroup[], value: boolean) =>
    setOpen((prev) => {
      const next = { ...prev };
      days.forEach((d) => (next[`${section}:${d.key}`] = value));
      return next;
    });

  const unpaidBalance = unpaid.reduce((sum, r) => sum + utangRemaining(r), 0);
  const paidTotal = paid.reduce((sum, r) => sum + r.amount, 0);

  const renderSection = (
    section: 'unpaid' | 'paid',
    days: DayGroup[],
    count: number,
    totalLabel: string,
    total: number,
    emptyText: string
  ) => {
    const isUnpaid = section === 'unpaid';
    const allOpen = days.length > 0 && days.every((d) => open[`${section}:${d.key}`]);
    return (
      <section aria-labelledby={`${section}-heading`}>
        <div
          className={`px-4 md:px-5 py-3 flex items-center justify-between gap-3 border-y ${
            isUnpaid ? 'bg-red-950/30 border-red-500/20' : 'bg-emerald-950/30 border-emerald-500/20'
          }`}
        >
          <div className="min-w-0">
            <h4
              id={`${section}-heading`}
              className={`flex items-center gap-2 text-sm md:text-base font-black uppercase tracking-wider ${
                isUnpaid ? 'text-red-300' : 'text-emerald-300'
              }`}
            >
              {isUnpaid ? <Clock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
              {isUnpaid ? 'Unpaid utang' : 'Paid (settled)'}
              <span className="text-xs font-bold normal-case tracking-normal text-slate-400">({count})</span>
            </h4>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">
              {totalLabel}{' '}
              <span className={`font-mono font-black ${isUnpaid ? 'text-red-300' : 'text-emerald-300'}`}>₱{total.toFixed(2)}</span>
            </p>
          </div>
          {days.length > 0 && (
            <button
              type="button"
              onClick={() => setAll(section, days, !allOpen)}
              className="shrink-0 text-xs font-bold text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors"
            >
              {allOpen ? 'Hide all' : 'Show all'}
            </button>
          )}
        </div>

        {days.length === 0 ? (
          <p className="p-6 text-center text-sm font-semibold text-slate-400">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-slate-700">
            {days.map((day) => {
              const id = `${section}:${day.key}`;
              const isOpen = Boolean(open[id]);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-expanded={isOpen}
                    aria-controls={`panel-${id}`}
                    className="w-full min-h-[56px] px-4 md:px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-700/50 transition-colors"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <CalendarDays className={`w-5 h-5 shrink-0 ${isUnpaid ? 'text-red-300' : 'text-emerald-300'}`} />
                      <span className="min-w-0">
                        <span className="block text-sm md:text-base font-bold text-white">{fmtDate(day.date)}</span>
                        <span className="block text-xs font-semibold text-slate-400">
                          {day.records.length} {day.records.length === 1 ? 'utang' : 'utang items'} · tap to {isOpen ? 'hide' : 'see the list'}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-right">
                        <span className={`block font-mono font-black text-sm md:text-base ${isUnpaid ? 'text-red-400' : 'text-emerald-300'}`}>
                          ₱{day.total.toFixed(2)}
                        </span>
                        <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">{isUnpaid ? 'to pay' : 'paid'}</span>
                      </span>
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>

                  {isOpen && (
                    <ul id={`panel-${id}`} className="bg-slate-900/50 divide-y divide-slate-800">
                      {day.records.map((r) => {
                        const partial = r.status === 'UNPAID' && (r.paidAmount ?? 0) > 0;
                        return (
                          <li key={r.id} className="pl-12 pr-4 md:pr-5 py-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white break-words">{r.itemsDescription || '-'}</div>
                              <div className="text-xs font-mono text-slate-400 mt-0.5">{fmtTime(r.date)}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`font-mono font-black text-sm ${isUnpaid ? 'text-red-400' : 'text-emerald-300'}`}>
                                ₱{r.amount.toFixed(2)}
                              </div>
                              {partial && (
                                <div className="text-[11px] font-bold text-emerald-300 mt-0.5">
                                  Paid ₱{(r.paidAmount ?? 0).toFixed(2)} · Balance ₱{utangRemaining(r).toFixed(2)}
                                </div>
                              )}
                              {partial && (
                                <span className="inline-block mt-1 px-2 py-0.5 text-[11px] rounded-full font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Partly paid
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  if (records.length === 0) {
    return <p className="p-8 text-center text-sm font-semibold text-slate-400">You have no utang records. Excellent standing!</p>;
  }

  return (
    <div>
      {renderSection('unpaid', unpaidDays, unpaid.length, 'Balance to pay', unpaidBalance, 'Nothing unpaid. You are all settled!')}
      {renderSection('paid', paidDays, paid.length, 'Total paid', paidTotal, 'No paid utang yet.')}
    </div>
  );
}
